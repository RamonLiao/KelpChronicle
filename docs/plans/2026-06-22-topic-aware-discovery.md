# Topic-Aware Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent's `topic` actually drive content discovery (curated keyword→source map + GitHub Search / HN Algolia fallback), instead of `fetchCandidates()` ignoring topic and hitting 3 fixed repos.

**Architecture:** New `resolveSources(topic)` keyword-matches a curated map to repos/RSS (B). `run.ts` fetches curated sources first; only when fresh findings `< THRESHOLD` does it supplement with `searchCandidates(topic)` (A1 GitHub Search + A3 HN Algolia), merge-dedup, and re-diff (M3). `fetchCandidates(deps)` signature is UNCHANGED — `run.ts` passes resolved repos/rssFeeds through the existing `FetchDeps` fields.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), `node:test` + `node:assert`, `tsx` runner. No new dependencies.

## Global Constraints

- Determinism (Rule 5): every raw-IO → artifact transform is a **pure deterministic mapping**; the IO itself is NOT reproducible. Attestation proves **integrity + provenance**, not reproducibility. Do not claim "verifiable = re-derivable".
- Finding key stability: `gh:<repo>@<tag>` and `hn:<objectID>` — keys derive ONLY from stable source identity, never mutable title/body.
- **repo strings verbatim canonical `full_name`** (e.g. `MystenLabs/walrus`, preserve case). NEVER lowercase — existing memory keys are `gh:MystenLabs/MemWal@...`; lowercasing re-leafs all existing findings once.
- XSS guard: any `sourceUrl` must pass `safeHttpUrl` (http(s) only) or collapse to a safe default.
- `encodeURIComponent(topic)` before putting topic in any query string. Hosts are hard-coded.
- Poisoned input never crashes: malformed env / API JSON → fall back, don't throw at boot or mid-run.
- Test runner: `cd backend && node --import tsx --test test/<file>.test.ts` (single file) or `npm test` (all).
- THRESHOLD = 5 (supplement with search only when curated fresh < 5).

---

### Task 1: `resolveSources` — curated keyword→source map

**Files:**
- Create: `backend/src/sources.ts`
- Test: `backend/test/sources.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface SourceEntry { match: string[]; repos: string[]; rssFeeds?: string[] }`; `function resolveSources(topic: string): { repos: string[]; rssFeeds: string[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/sources.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { resolveSources } from '../src/sources.js';

// WHY: keyword (substring) match, not exact string — 'Walrus ecosystem' and
// 'sui walrus' must both reach the curated walrus repos so the existing
// 30-finding demo topic keeps growing leaves without an exact-string label.
test('keyword match is case-insensitive substring', () => {
  const s = resolveSources('Walrus ecosystem');
  assert.ok(s.repos.includes('MystenLabs/walrus'));
});

// WHY: multiple matched entries union their sources (and dedupe), so a
// cross-cutting topic pulls every relevant feed at once.
test('multiple matches union repos and dedupe', () => {
  const s = resolveSources('sui walrus');
  assert.ok(s.repos.includes('MystenLabs/walrus')); // walrus entry
  assert.ok(s.repos.includes('MystenLabs/sui'));    // sui entry
  assert.strictEqual(new Set(s.repos).size, s.repos.length); // no dupes
});

// WHY: an unmapped topic must yield EMPTY sources so run.ts falls through to
// the search fallback instead of silently reusing a default feed.
test('no keyword match yields empty sources', () => {
  const s = resolveSources('zzz nonexistent quux');
  assert.deepStrictEqual(s, { repos: [], rssFeeds: [] });
});

// WHY: repo strings are verbatim canonical full_name — lowercasing would break
// dedup against existing `gh:MystenLabs/...` memory keys.
test('repos preserve canonical casing (never lowercased)', () => {
  const s = resolveSources('walrus');
  assert.ok(s.repos.every((r) => r === r.trim() && /[A-Z]/.test(r.split('/')[0])));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --import tsx --test test/sources.test.ts`
Expected: FAIL — `Cannot find module '../src/sources.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/sources.ts
// Topic → discovery sources. Routing is CODE, not model judgment (Rule 5).
// Keyword (substring, case-insensitive) match; multiple matches union sources.
// repo strings are verbatim canonical GitHub full_name — NEVER lowercased
// (existing memory keys are `gh:MystenLabs/...`; lowercasing re-leafs them once).

export interface SourceEntry {
  match: string[];
  repos: string[];
  rssFeeds?: string[];
}

// Seed map. env CURATED_SOURCES (JSON array of SourceEntry) overrides; malformed
// JSON falls back to this seed (poisoned input must not crash boot).
const SEED: SourceEntry[] = [
  { match: ['walrus', 'storage', 'blob'], repos: ['MystenLabs/walrus', 'MystenLabs/walrus-sites', 'MystenLabs/MemWal'] },
  { match: ['deepbook', 'dex', 'orderbook'], repos: ['MystenLabs/deepbookv3'] },
  { match: ['seal', 'encryption'], repos: ['MystenLabs/seal'] },
  { match: ['sui', 'move'], repos: ['MystenLabs/sui'] },
];

function loadCurated(): SourceEntry[] {
  const raw = process.env.CURATED_SOURCES;
  if (!raw) return SEED;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return SEED;
    const ok = parsed.every(
      (e) =>
        e && typeof e === 'object' &&
        Array.isArray((e as SourceEntry).match) &&
        Array.isArray((e as SourceEntry).repos),
    );
    return ok ? (parsed as SourceEntry[]) : SEED;
  } catch {
    return SEED; // malformed JSON → seed, never crash boot
  }
}

export function resolveSources(topic: string): { repos: string[]; rssFeeds: string[] } {
  const t = topic.toLowerCase();
  const repos = new Set<string>();
  const rssFeeds = new Set<string>();
  for (const entry of loadCurated()) {
    if (entry.match.some((kw) => t.includes(kw.toLowerCase()))) {
      for (const r of entry.repos) repos.add(r);
      for (const f of entry.rssFeeds ?? []) rssFeeds.add(f);
    }
  }
  return { repos: [...repos], rssFeeds: [...rssFeeds] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --import tsx --test test/sources.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/sources.ts backend/test/sources.test.ts
git commit -m "feat(be): resolveSources — topic keyword→curated source map"
```

---

### Task 2: HN Algolia mapping + export `safeHttpUrl`

**Files:**
- Modify: `backend/src/fetch.ts` (export `safeHttpUrl` at line 29; add `parseHnSearch` after `parseReleases` ~line 117)
- Test: `backend/test/fetch.test.ts` (append)

**Interfaces:**
- Consumes: `Finding` (existing), `safeHttpUrl` (existing private → now exported).
- Produces: `export function safeHttpUrl(s: string): string`; `export function parseHnSearch(data: unknown): Finding[]`.

- [ ] **Step 1: Write the failing test**

```ts
// append to backend/test/fetch.test.ts — also add parseHnSearch to the import line:
//   import { mapGithubRelease, parseReleases, parseRssFeed, fetchCandidates, parseHnSearch } from '../src/fetch.js';

// WHY: HN key must be the stable objectID so the same story dedupes across runs.
test('parseHnSearch maps a hit with a stable hn:<objectID> key', () => {
  const out = parseHnSearch({ hits: [{ objectID: '42', title: 'Walrus is great', url: 'https://blog/x', story_text: '' }] });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].key, 'hn:42');
  assert.strictEqual(out[0].title, 'Walrus is great');
  assert.strictEqual(out[0].sourceUrl, 'https://blog/x');
});

// WHY: a hostile HN url (javascript:) must NOT become a clickable sourceUrl;
// it falls back to the safe HN item permalink.
test('parseHnSearch rejects non-http url, falls back to HN permalink', () => {
  const out = parseHnSearch({ hits: [{ objectID: '7', title: 't', url: 'javascript:alert(1)' }] });
  assert.strictEqual(out[0].sourceUrl, 'https://news.ycombinator.com/item?id=7');
});

// WHY: malformed payloads (no hits array, missing objectID) must drop quietly,
// never crash recall/diff downstream.
test('parseHnSearch drops malformed hits and non-arrays', () => {
  assert.deepStrictEqual(parseHnSearch({}), []);
  assert.deepStrictEqual(parseHnSearch({ hits: [{ title: 'no id' }] }), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --import tsx --test test/fetch.test.ts`
Expected: FAIL — `parseHnSearch is not exported` / not a function.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/fetch.ts`, change the `safeHttpUrl` declaration (line 29) from `function` to exported:

```ts
export function safeHttpUrl(s: string): string {
  return /^https?:\/\//i.test(s) ? s : '';
}
```

Add after `parseReleases` (after line 117):

```ts
// Pure HN Algolia mapping — same determinism contract as mapGithubRelease.
// key = `hn:<objectID>` (objectID stable per story). title/story_text are
// mutable display fields, never part of the key. sourceUrl must be a SAFE
// http(s) url or it falls back to the HN item permalink.
export function parseHnSearch(data: unknown): Finding[] {
  const hits = (data as { hits?: unknown })?.hits;
  if (!Array.isArray(hits)) return [];
  const out: Finding[] = [];
  for (const h of hits) {
    const id = (h as { objectID?: unknown })?.objectID;
    if (typeof id !== 'string' || !id) continue; // no stable key → drop
    const title = typeof (h as { title?: unknown }).title === 'string' ? (h as { title: string }).title : '';
    const storyText = typeof (h as { story_text?: unknown }).story_text === 'string' ? (h as { story_text: string }).story_text : '';
    const url = typeof (h as { url?: unknown }).url === 'string' ? (h as { url: string }).url : '';
    out.push({
      key: `hn:${id}`,
      title: title || `HN story ${id}`,
      summary: (storyText || title).slice(0, 1000),
      sourceUrl: safeHttpUrl(url) || `https://news.ycombinator.com/item?id=${id}`,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --import tsx --test test/fetch.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/fetch.ts backend/test/fetch.test.ts
git commit -m "feat(be): parseHnSearch + export safeHttpUrl for search fallback"
```

---

### Task 3: `searchCandidates` (GitHub Search + HN) + `dedupeByKey`

**Files:**
- Modify: `backend/src/fetch.ts` (append `searchCandidates`, `dedupeByKey`)
- Test: `backend/test/fetch.test.ts` (append)

**Interfaces:**
- Consumes: `FetchDeps` (existing), `parseReleases`, `parseHnSearch`, `PER_REPO_TIMEOUT_MS`.
- Produces: `export function dedupeByKey(findings: Finding[]): Finding[]`; `export async function searchCandidates(topic: string, deps?: FetchDeps): Promise<Finding[]>`.

- [ ] **Step 1: Write the failing test**

```ts
// append to backend/test/fetch.test.ts; add searchCandidates, dedupeByKey to imports.

// WHY: a search-triggered run fans out search→repos→releases AND queries HN;
// both feed the same candidate pool, so the agent discovers topic-relevant
// content beyond the 3 curated repos.
test('searchCandidates fans GitHub search → releases and adds HN hits', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    if (url.includes('/search/repositories')) return fakeRes({ items: [{ full_name: 'acme/foo' }] });
    if (url.includes('/repos/acme/foo/releases')) return fakeRes([{ tag_name: 'v1', name: 'Foo v1', body: 'b', html_url: 'https://gh/foo' }]);
    if (url.includes('hn.algolia.com')) return fakeRes({ hits: [{ objectID: '9', title: 'Foo on HN', url: 'https://hn/foo' }] });
    return fakeRes([], { ok: false });
  }) as unknown as typeof fetch;

  const out = await searchCandidates('foo', { fetchImpl });
  const keys = out.map((f) => f.key).sort();
  assert.deepStrictEqual(keys, ['gh:acme/foo@v1', 'hn:9']);
  // topic is URL-encoded into the query
  assert.ok(calls.some((u) => u.includes('q=foo')));
});

// WHY: the topic goes into a query string — special chars must be encoded so a
// topic like 'a&b' can't break the URL or smuggle params.
test('searchCandidates url-encodes the topic', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => { calls.push(url); return fakeRes({ items: [] }); }) as unknown as typeof fetch;
  await searchCandidates('a&b c', { fetchImpl });
  assert.ok(calls.some((u) => u.includes('a%26b%20c')));
  assert.ok(!calls.some((u) => u.includes('a&b c')));
});

// WHY: one failing source must not kill the run — a bad GitHub search still
// lets HN results through, and vice versa.
test('searchCandidates skips a failing source, keeps the other', async () => {
  const fetchImpl = (async (url: string) => {
    if (url.includes('/search/repositories')) throw new Error('boom');
    if (url.includes('hn.algolia.com')) return fakeRes({ hits: [{ objectID: '1', title: 'x', url: 'https://x' }] });
    return fakeRes([], { ok: false });
  }) as unknown as typeof fetch;
  const out = await searchCandidates('t', { fetchImpl });
  assert.deepStrictEqual(out.map((f) => f.key), ['hn:1']);
});

// WHY: merging curated + search pools can repeat a release; dedupeByKey keeps
// the first occurrence so a node never double-leafs.
test('dedupeByKey keeps first per key', () => {
  const a = { key: 'gh:r@1', title: 'A', summary: '', sourceUrl: '' };
  const b = { key: 'gh:r@1', title: 'B', summary: '', sourceUrl: '' };
  const out = dedupeByKey([a, b]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].title, 'A');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --import tsx --test test/fetch.test.ts`
Expected: FAIL — `searchCandidates` / `dedupeByKey` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `backend/src/fetch.ts`:

```ts
// Shared GitHub auth header — token (when set) lifts the unauthenticated 10
// req/min search limit to 5000/hr. A search-triggered run spends 1 search +
// up to 5 release calls; without a token a cold topic can exhaust the budget.
function ghHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}

const MAX_SEARCH_REPOS = 5; // bounds GitHub fan-out (matches search per_page)

export function dedupeByKey(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    out.push(f);
  }
  return out;
}

// Topic-driven search fallback (A1 GitHub Search + A3 HN Algolia). Each source
// and each fan-out release fetch is individually try/catch-skipped and timeout-
// bounded, so one bad repo / rate-limit never stalls or kills the run. Hosts are
// hard-coded; topic is URL-encoded (never reaches the host, only the query).
export async function searchCandidates(topic: string, deps: FetchDeps = {}): Promise<Finding[]> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const q = encodeURIComponent(topic);
  const out: Finding[] = [];

  // A1: GitHub Search → top repos (verbatim canonical full_name) → their releases.
  try {
    const res = await fetchImpl(
      `https://api.github.com/search/repositories?q=${q}&sort=stars&per_page=${MAX_SEARCH_REPOS}`,
      { headers: ghHeaders(), signal: AbortSignal.timeout(PER_REPO_TIMEOUT_MS) },
    );
    if (res.ok) {
      const data = (await res.json()) as { items?: unknown };
      const items = Array.isArray(data.items) ? data.items : [];
      const repos = items
        .map((it) => (it as { full_name?: unknown }).full_name)
        .filter((n): n is string => typeof n === 'string' && n.length > 0)
        .slice(0, MAX_SEARCH_REPOS);
      for (const repo of repos) {
        try {
          const r2 = await fetchImpl(`https://api.github.com/repos/${repo}/releases?per_page=5`, {
            headers: ghHeaders(),
            signal: AbortSignal.timeout(PER_REPO_TIMEOUT_MS),
          });
          if (r2.ok) out.push(...parseReleases(repo, await r2.json()));
        } catch {
          /* one bad repo never kills the fan-out */
        }
      }
    }
  } catch {
    /* GitHub search down/rate-limited — HN still covers the topic */
  }

  // A3: HN Algolia stories.
  try {
    const res = await fetchImpl(
      `https://hn.algolia.com/api/v1/search?query=${q}&tags=story&hitsPerPage=10`,
      { signal: AbortSignal.timeout(PER_REPO_TIMEOUT_MS) },
    );
    if (res.ok) out.push(...parseHnSearch(await res.json()));
  } catch {
    /* HN down — GitHub results (if any) still return */
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --import tsx --test test/fetch.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add backend/src/fetch.ts backend/test/fetch.test.ts
git commit -m "feat(be): searchCandidates (GitHub Search + HN Algolia) + dedupeByKey"
```

---

### Task 4: Wire M3 threshold into the run loop

**Files:**
- Modify: `backend/src/run.ts` (`RunDeps`, `defaultDeps`, `runAgent`)
- Test: `backend/test/run.test.ts` (modify `fakeDeps`, append tests)

**Interfaces:**
- Consumes: `resolveSources` (Task 1), `searchCandidates` + `dedupeByKey` (Task 3), `fetchCandidates` (existing, signature unchanged), `computeDelta` (existing).
- Produces: `RunDeps` gains `search: typeof searchCandidates`; `runAgent` unchanged signature.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/run.test.ts — update fakeDeps to accept a search fake and counter,
// then append the two M3 tests. Replace the existing fakeDeps `fetch` line and add `search`:
//
//   fetch: async () => over.candidates ?? [],
//   search: async () => { captured.searchCalled = true; return over.searchResults ?? []; },
//
// and add `searchCalled?: boolean` to the captured type, plus `searchResults?: Finding[]`
// to the over type.

// WHY: when curated fresh findings already meet THRESHOLD, search must NOT fire —
// that's the whole point of M3 (don't spend rate-limited search calls when the
// curated feed is rich).
test('search does NOT fire when curated fresh >= THRESHOLD', async () => {
  const candidates = ['a', 'b', 'c', 'd', 'e', 'f'].map(f); // 6 fresh >= 5
  const { deps, captured } = fakeDeps({ candidates });
  await runAgent('walrus', '0xagent', 1, deps);
  assert.strictEqual(captured.searchCalled, undefined);
  assert.strictEqual(captured.remembered?.findings.length, 6);
});

// WHY: when curated is thin (fresh < THRESHOLD), search fires and its results
// merge in (deduped) so a cold topic still grows leaves.
test('search fires when curated fresh < THRESHOLD and merges deduped', async () => {
  const candidates = ['a', 'b'].map(f); // 2 fresh < 5
  const searchResults = ['b', 'c', 'd'].map(f); // 'b' overlaps → dedupes
  const { deps, captured } = fakeDeps({ candidates, searchResults });
  await runAgent('cold topic', '0xagent', 1, deps);
  assert.strictEqual(captured.searchCalled, true);
  const keys = captured.remembered?.findings.map((x) => x.key).sort();
  assert.deepStrictEqual(keys, ['a', 'b', 'c', 'd']); // merged + deduped
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --import tsx --test test/run.test.ts`
Expected: FAIL — `search` missing on RunDeps / `searchCalled` never set.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/run.ts`:

(a) Update imports:
```ts
import { recallArtifacts, rememberArtifact } from './memory.js';
import { fetchCandidates, searchCandidates, dedupeByKey } from './fetch.js';
import { computeDelta } from './diff.js';
import { resolveSources } from './sources.js';
```

(b) Extend `RunDeps`:
```ts
export interface RunDeps {
  recall: typeof recallArtifacts;
  fetch: typeof fetchCandidates;
  search: typeof searchCandidates;
  remember: typeof rememberArtifact;
  execute: AttestExecutor;
}
```

(c) Extend `defaultDeps`:
```ts
const defaultDeps = (): RunDeps => ({
  recall: recallArtifacts,
  fetch: fetchCandidates,
  search: searchCandidates,
  remember: rememberArtifact,
  execute: (tx) => defaultExecutor()(tx),
});
```

(d) Add the constant above `runAgent` and rewrite the fetch+delta block inside `runAgent`:
```ts
// Supplement curated sources with topic search only when the curated feed is
// thin — keeps rate-limited search calls off the rich, common topics (M3).
const SEARCH_THRESHOLD = 5;
```

Replace these two lines:
```ts
  const candidates = await deps.fetch();
  const { fresh, knownHit } = computeDelta(known, candidates);
```
with:
```ts
  const sources = resolveSources(topic);
  let candidates = await deps.fetch({ repos: sources.repos, rssFeeds: sources.rssFeeds });
  let { fresh, knownHit } = computeDelta(known, candidates);
  if (fresh.length < SEARCH_THRESHOLD) {
    const searched = await deps.search(topic);
    candidates = dedupeByKey([...candidates, ...searched]);
    ({ fresh, knownHit } = computeDelta(known, candidates));
  }
```

Note: `knownHit` is currently unused after this block except in the returned `RunResult`; keep returning it. `fetchCandidates({repos, rssFeeds})` is type-correct — `FetchDeps` already has those fields, and an empty `repos: []` stays empty (`[] ?? REPOS` → `[]`), so an unmapped topic fetches no curated GitHub and relies on search.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --import tsx --test test/run.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Run the full backend suite + type-check**

Run: `cd backend && npm test && npx tsc --noEmit`
Expected: all green, no type errors. (Existing `fetch.test.ts` untouched because `fetchCandidates` signature is unchanged.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/run.ts backend/test/run.test.ts
git commit -m "feat(be): M3 topic-aware discovery — curated fetch + search supplement under threshold"
```

---

### Task 5: Monkey tests (extreme inputs)

**Files:**
- Test: `backend/test/sources.test.ts` (append), `backend/test/fetch.test.ts` (append)

**Interfaces:**
- Consumes: `resolveSources`, `searchCandidates`, `parseHnSearch`.
- Produces: nothing (tests only).

- [ ] **Step 1: Write the monkey tests**

```ts
// append to backend/test/sources.test.ts

// WHY: a hostile/garbage CURATED_SOURCES env must fall back to the seed, never
// crash boot — matches the project's poisoned-input-doesn't-crash ethos.
test('malformed CURATED_SOURCES env falls back to seed', () => {
  const prev = process.env.CURATED_SOURCES;
  try {
    process.env.CURATED_SOURCES = '{not json';
    assert.ok(resolveSources('walrus').repos.includes('MystenLabs/walrus'));
    process.env.CURATED_SOURCES = '{"a":1}'; // not an array
    assert.ok(resolveSources('walrus').repos.includes('MystenLabs/walrus'));
  } finally {
    if (prev === undefined) delete process.env.CURATED_SOURCES;
    else process.env.CURATED_SOURCES = prev;
  }
});

// WHY: extreme topics (empty, very long, emoji/CJK, special chars) must not throw.
test('extreme topics resolve without throwing', () => {
  for (const t of ['', ' '.repeat(500), '海象 🦭 walrus', 'a&b#c?d', '../../etc']) {
    assert.doesNotThrow(() => resolveSources(t));
  }
});
```

```ts
// append to backend/test/fetch.test.ts

// WHY: a topic with URL metacharacters must encode into BOTH the GitHub and HN
// queries — never leak raw `#`/`?`/`&` into the URL.
test('searchCandidates encodes metachar topics for every source', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => { calls.push(url); return fakeRes({ items: [], hits: [] }); }) as unknown as typeof fetch;
  await searchCandidates('a#b?c&d', { fetchImpl });
  assert.ok(calls.every((u) => !/[#?]b/.test(u))); // no raw metachars from the topic
  assert.ok(calls.some((u) => u.includes('hn.algolia.com')));
});

// WHY: HN returning zero hits is normal for cold topics — must yield [] cleanly.
test('searchCandidates with empty results returns []', async () => {
  const fetchImpl = (async () => fakeRes({ items: [], hits: [] })) as unknown as typeof fetch;
  assert.deepStrictEqual(await searchCandidates('nothing', { fetchImpl }), []);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd backend && node --import tsx --test test/sources.test.ts test/fetch.test.ts`
Expected: PASS (all, including new monkey tests).

- [ ] **Step 3: Commit**

```bash
git add backend/test/sources.test.ts backend/test/fetch.test.ts
git commit -m "test(be): monkey tests — poisoned env, extreme topics, metachar encoding"
```

---

## Self-Review

**Spec coverage:**
- §2 M3 flow → Task 4. §3.1 `sources.ts` + env override + canonical-casing invariant → Task 1. §3.2 `searchCandidates` (A1+A3) + fan-out try/catch + GITHUB_TOKEN + dedupeByKey → Tasks 2–3. §5 error handling (per-source skip, empty→bare) → Tasks 3–4 (covered by tests). §6 red team (encodeURIComponent, safeHttpUrl, fan-out caps, token) → Tasks 2–3 + Global Constraints. §7 tests → Tasks 1–5. §8 lifeline live-smoke → NOTE below (manual, not unit-testable offline).
- **Gap (intentional):** §8 "lifeline with search fired" asserts `artifactHashHex == hash of blob refetched from Walrus`. That needs a live MemWal account, so it stays a manual wallet-gated smoke step, NOT a unit task. The offline run.test.ts already asserts the anchored hash matches the remembered artifact (existing test), which covers the in-memory half of the lifeline; the Walrus round-trip half is wallet-gated.

**Placeholder scan:** none — every code step has full code.

**Type consistency:** `resolveSources → {repos, rssFeeds}` consumed verbatim in Task 4. `searchCandidates(topic, deps?)` / `dedupeByKey(findings)` signatures match Task 3 definitions and Task 4 usage. `FetchDeps` reused unchanged. `RunDeps.search: typeof searchCandidates` matches.

## Post-Implementation

- **dual-review** (dev-rules 兩輪制): backend TS, non-Move → codex generic review + project rules review.
- **Lifeline live-smoke (wallet-gated):** run a curated topic (`walrus`) → stable leaves; run a cold topic (`nautilus tee`) → search fallback fires, HN/GitHub leaves appear; on a search-fired run, verify Inspector's ✓ Verified on-chain link resolves (in-memory hash↔anchor already unit-covered).
- `.env`: set `GITHUB_TOKEN` before relying on search in demo (10 req/min → 5000/hr).
