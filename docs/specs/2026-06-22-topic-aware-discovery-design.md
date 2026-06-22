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

決定性契約不變（Rule 5）：所有步驟仍是 deterministic mapping，只有 summarize 是 model-shaped。
搜尋是 IO 但 mapping 為純函式，測試以注入 fake 覆蓋。

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
- 前端零改動，森林照常投影。

## 9. Deferred

- 真·開放網路搜尋（grok/gemini）：違反禁用 WebSearch 規則 + 非決定性傷可信度，不做。
- 策展表 UI 管理：env / 程式碼維護即可，demo 不需。
- 搜尋結果的相關性排序 / 語意過濾：先靠來源本身（GitHub stars、HN tags）排序，不加 LLM。
