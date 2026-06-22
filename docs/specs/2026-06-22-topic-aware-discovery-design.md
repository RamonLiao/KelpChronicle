# Topic-Aware Discovery — Design

> 2026-06-22. Recall (Sui Overflow Walrus track, project 07).
> 解決：`fetchCandidates()` 目前 topic-blind（寫死 3 個 Walrus repo），使 `/run` 的 topic
> 只當記憶標籤、不影響「發現什麼新內容」。本設計讓 topic 真正驅動內容發現。

## 1. 問題與範圍

agent run loop：`recall(topic) → fetch() → diff → summarize → 存Walrus → 錨鏈`。

- `recall(query=topic)` **已** topic-aware（對 MemWal 做語意檢索，topic embedding 配對存過的 artifact）。
- `fetch()` **完全無視 topic** —— 固定抓 `['MystenLabs/walrus','MystenLabs/walrus-sites','MystenLabs/MemWal']` 的 GitHub releases。

**範圍**：只改「發現新內容」這一步（`fetchCandidates` 與其呼叫點），讓來源依 topic 而變。
recall / diff / summarize / 存儲 / 錨鏈 **不動契約**。前端不動。

**非範圍**：真·開放網路搜尋（違反專案禁用內建 WebSearch 規則）；多租戶；前端視覺。

## 2. 方案：B（策展映射）+ A（搜尋 fallback）混合，M3 門檻

選定 **M3 + 關鍵字配對**：命中策展表先抓策展來源；`computeDelta` 後若 `fresh < THRESHOLD`
才補搜尋並合併重 diff。未命中映射的 topic 直接走搜尋。

```
recall(topic)
  → resolveSources(topic)            # B：關鍵字配對策展表 → repos/rssFeeds 聯集
  → fetch(sources)                   # 抓策展來源（命中時）
  → {fresh, knownHit} = diff(known, candidates)
  → if fresh.length < THRESHOLD:     # M3：策展不足才補搜尋
       searchCandidates = A1(topic) ∪ A3(topic)
       candidates = dedupeByKey(candidates ∪ searchCandidates)
       {fresh, knownHit} = diff(known, candidates)   # diff 純函式，重跑零成本
  → summarize(fresh) → remember → attest
```

**決定性契約（Rule 5）— 精確版**：契約是「**每個 raw IO → artifact 的 transform 都是純決定性 mapping**」，
**IO 本身不可重現**（GitHub releases / search 排序 / HN 時序 run 當下才定）。搜尋讓「被錨定的內容」
依 run 當下而變，因此 attestation 證明的是 **integrity + provenance**（這批 exact bytes 由 agent 產出並釘上鏈/Walrus），
**不是 reproducibility**（重跑不保證同 bytes）。demo 敘事必須講 integrity，不可宣稱「verifiable = 可重新推導」。
搜尋是 IO 但 mapping 為純函式，測試以注入 fake 覆蓋。

> sui-architect 確認：lifeline 安全。`run.ts` 在記憶體組好 artifact 後，`remember(artifact)`（canonicalize→Walrus）
> 與 `artifactHashHex(artifact)` 吃**同一個** in-memory 物件 → 搜尋非決定性永遠進不到 store↔anchor 之間，
> 「stored bytes == attested hash」不受本變更影響。

`THRESHOLD = 5`（fresh 少於 5 才補搜尋）。

## 3. 元件

### 3.1 `backend/src/sources.ts`（新檔）

```ts
export interface SourceEntry { match: string[]; repos: string[]; rssFeeds?: string[]; }

// env 可覆寫（CURATED_SOURCES JSON）；預設 seed：
const CURATED: SourceEntry[] = [
  { match: ['walrus', 'storage', 'blob'],  repos: ['MystenLabs/walrus', 'MystenLabs/walrus-sites', 'MystenLabs/MemWal'] },
  { match: ['deepbook', 'dex', 'orderbook'], repos: ['MystenLabs/deepbookv3'] },
  { match: ['seal', 'encryption'],         repos: ['MystenLabs/seal'] },
  { match: ['sui', 'move'],                repos: ['MystenLabs/sui'] },
];

// topic 轉小寫；entry 任一 keyword 是子字串即命中；多命中 → 來源聯集（repos/rssFeeds 各自去重）。
export function resolveSources(topic: string): { repos: string[]; rssFeeds: string[] };
```

- 關鍵字配對讓 `Walrus ecosystem` / `sui walrus` 都命中 walrus 來源，不必精確字串。
- 保住現有 30-findings demo topic 走策展、穩定長葉。
- 缺失 / 不存在的 repo 由 `fetchCandidates` 既有「per-source try/catch、skip 失敗」吸收，不致命。
- **`CURATED_SOURCES` env 覆寫**：malformed JSON **fallback 回 seed list，不可 crash boot**（符合專案「中毒輸入不崩」ethos）。
- **repo 正規化（防雙葉）— verbatim canonical，不 lowercase**：策展 entry 的 repo 字串**必須**逐字＝
  GitHub 的 `full_name`（canonical 大小寫 `MystenLabs/walrus`，**保留大小寫**）；search fan-out 也用 GitHub 回的 `full_name` 逐字。
  ⚠️ **不可 lowercase**：既有記憶 key 是 `gh:MystenLabs/MemWal@...`，lowercase 會讓新 key 配不上 → 30 筆既有 finding 被當 fresh 重長一次。
  invariant＝兩個呼叫端都用 canonical `full_name` 逐字，靠來源一致性（GitHub 永遠回 canonical）保證不分裂，毋須轉換。

### 3.2 `backend/src/fetch.ts`（改）

- `fetchCandidates(deps)` → `fetchCandidates(sources, deps)`：repos/rssFeeds 改由參數傳入（移除寫死 `REPOS`，或保留為「無命中時的空集」）。
- 新增 `searchCandidates(topic, deps)`：
  - **A1 GitHub Search**：`GET https://api.github.com/search/repositories?q=<enc(topic)>&sort=stars&per_page=5`
    → 取回的 repo（≤5）各 `releases?per_page=5` → 沿用 `mapGithubRelease`，key=`gh:<repo>@<tag>`。
      （repo fan-out 上限 = search 的 per_page = 5，與 §6 一致。）
  - **A3 HN Algolia**：`GET https://hn.algolia.com/api/v1/search?query=<enc(topic)>&tags=story&hitsPerPage=10`
    → map：key=`hn:<objectID>`、title=`title`、summary=`story_text || title`、
      sourceUrl=`safeHttpUrl(url) || https://news.ycombinator.com/item?id=<objectID>`。
  - 兩者無 key、回 JSON、失敗 skip（沿用 per-source try/catch）。
  - **fan-out 控制流（新路徑，須明確）**：search→N repos→各自 releases 的**每個 release fetch 個別 try/catch-skip**
    （一個壞 repo ≠ 整 run 死）且套用同一 `PER_REPO_TIMEOUT_MS`，否則 5-repo fan-out 在 timeout 下會串成 40s+ 卡死。
  - **`GITHUB_TOKEN`**：未認證 GitHub 速率限制 = 10 req/min；一次 search-triggered run = 1 search + ≤5 releases = 6 calls
    （加策展已花的）。search 與 fan-out releases 呼叫**都要帶** `GITHUB_TOKEN`（有設時），把上限拉到 5000/hr。
    強烈建議 search 上線後設 token。
- `dedupeByKey(findings)`：合併策展 + 搜尋 candidates 時去重（key 唯一）。

### 3.3 `backend/src/run.ts`（改）

`runAgent` 內：
```ts
const sources = resolveSources(topic);
let candidates = await deps.fetch(sources);
let { fresh, knownHit } = computeDelta(known, candidates);
if (fresh.length < THRESHOLD) {
  const searched = await deps.search(topic);
  candidates = dedupeByKey([...candidates, ...searched]);
  ({ fresh, knownHit } = computeDelta(known, candidates));
}
```
`RunDeps` 加 `search: typeof searchCandidates`；`fetch` 簽名加 `sources` 參數。

## 4. 資料流與 key 穩定性

- 既有記憶 findings 為 `gh:<repo>@<tag>`；新增 A1 同樣 `gh:` → 跨來源自然 dedup，不重複長葉。
- A3 `hn:<objectID>`（objectID 每篇 HN story 穩定）→ 跨 run dedup 正確。
- topic 變更不影響 key（key 只來自來源內容），符合既有「mutable 欄位不入 key」契約。
- **lineage 穩定性 ≠ key 穩定性（接受的 tradeoff）**：`runId = max(recalled priorRunIds)+1` 建在語意 top-K=20 recall 上。
  搜尋讓 recall 更 noisy → 下一 run 的 `recall(topic)` 可能帶回不同 prior 集合，使 `priorRunIds` lineage 較不穩。
  這**不破壞** attestation 唯一性（每次 `attest` 鑄出獨立 frozen object），只讓前端「記憶森林 lineage」敘事稍弱。
  **明確接受**：key 穩定保證「不重複長葉」，但不保證「lineage 邊永遠相同」；demo 不依賴 lineage 精確性。

## 5. 錯誤處理

- 任一來源（策展 repo / GitHub search / HN）失敗 → skip 該來源，其餘照常（既有 pattern）。
- 全部來源失敗 → candidates 空 → fresh 0 → 仍存「空記憶」並錨鏈（既有誠實行為，禿莖）。
- `/run` 既有 409 single-flight 擋併發，搜尋不另開併發。

## 6. Red Team（核心資料處理路徑）

| 攻擊向量 | 防禦 |
|---|---|
| topic 注入 query（破壞 URL / SSRF） | `encodeURIComponent(topic)`；host 寫死，topic 僅進 query 不進 host |
| 惡意搜尋結果 XSS（`javascript:`/`data:` sourceUrl） | 沿用 `safeHttpUrl()` → 非 http(s) 收斂為 `''` |
| 巨大回應 / 海量 hit 耗盡 CPU/記憶體 | `per_page`/`hitsPerPage` 上限、repo fan-out 封頂 5、release 數封頂、既有 `MAX_RSS_BYTES` |
| GitHub Search 未認證速率限制（10 req/min）被洪水打爆 | 409 single-flight + 搜尋僅在 fresh<門檻觸發 + repo fan-out 封頂 |
| 中毒 key 讓 diff/canonicalize 崩 | 沿用來源 mapping 的 key 純化 + 既有 artifact 結構守衛（memory.ts isArtifact） |
| **搜尋來源可被攻擊者影響內容**（star-farming 讓惡意 repo 進 `sort=stars`、貼 HN story）→ 注入你被錨定的 artifact + 未來 recall | `isArtifact` 只守**結構**不守**內容**——這是 narrative gap 非 crash gap。緩解：`safeHttpUrl` + 長度上限 + **誠實 framing：attestation 證明「agent 看過這條」，不證明「這條為真」**。star/HN-tag 排序當弱訊號，不引入 LLM 真偽判斷。 |

## 7. 測試（Rule 9 — 測 why 不只 what）

- `sources.test.ts`：關鍵字配對（`walrus`→walrus repos；多命中聯集；無命中回空）；env 覆寫 `CURATED_SOURCES`。
- `fetch.test.ts` 擴充：注入 fake GitHub-search / HN-Algolia →
  - key 穩定（`gh:`/`hn:` 跨 run 相同）；
  - `safeHttpUrl` 擋 `javascript:` sourceUrl；
  - `encodeURIComponent` 對含 `&`/`#`/`?` 的 topic 正確。
- `run.test.ts` 擴充（encode M3 為何省搜尋）：
  - fresh ≥ THRESHOLD → `deps.search` **未**被呼叫；
  - fresh < THRESHOLD → `deps.search` 被呼叫且結果併入、去重後 fresh 反映合併。
- Monkey：超長 topic、emoji/CJK topic、含特殊字元 topic、HN 回 0 hit、GitHub search 429、策展 repo 404。

## 8. 驗證

- `npm test`（backend）全綠。
- Live smoke：連錢包跑一個策展 topic（`walrus`）→ 穩定長葉；跑一個冷門 topic（如 `nautilus tee`）
  → 走搜尋 fallback、HN/GitHub 有料則長新葉。
- **Lifeline live 驗（offline fake 蓋不到的唯一路徑）**：在**搜尋確實觸發**的那次 run，斷言
  `artifactHashHex(artifact)` == 從 Walrus 取回 blob 重算的 hash（stored bytes == attested hash），
  確認搜尋 candidates 進入 artifact 後 lifeline 仍成立。
- 前端零改動，森林照常投影。

## 9. Deferred

- 真·開放網路搜尋（grok/gemini）：違反禁用 WebSearch 規則 + 非決定性傷可信度，不做。
- 策展表 UI 管理：env / 程式碼維護即可，demo 不需。
- 搜尋結果的相關性排序 / 語意過濾：先靠來源本身（GitHub stars、HN tags）排序，不加 LLM。
