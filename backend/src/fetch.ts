import type { Finding } from '../../shared/src/artifact.js';

export interface GhRelease {
  repo: string;
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
}

// Pure, deterministic mapping — never an LLM. The key is derived ONLY from
// repo + tag so the same release dedupes byte-identically across runs
// (mutable name/body must not leak in, or edits would re-surface as "fresh").
export function mapGithubRelease(r: GhRelease): Finding {
  return {
    key: `gh:${r.repo}@${r.tag_name}`,
    title: r.name || r.tag_name,
    summary: (r.body || '').slice(0, 1000),
    sourceUrl: r.html_url,
  };
}

// Pure RSS mapping — same determinism contract as mapGithubRelease. key is
// `rss:<guid>` (guid stable per entry across fetches). Minimal regex extraction
// keeps us off an XML dep; only <item> guid/title/link/description are read.
// Only http(s) URLs are safe to surface as a clickable sourceUrl. Anything
// else (javascript:, data:, opaque guid) collapses to '' — defense against
// XSS from a hostile RSS feed.
export function safeHttpUrl(s: string): string {
  return /^https?:\/\//i.test(s) ? s : '';
}

// Decode the XML entities RSS feeds actually emit. Without this a link like
// `https://x?a=1&amp;b=2` keeps the `&amp;` and becomes a wrong URL, and titles
// render literal `&amp;`. Named set + numeric refs; `&amp;` last to avoid
// double-decoding (e.g. `&amp;lt;` must stay `&lt;`, not become `<`).
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => codePoint(m, parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => codePoint(m, parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

// Out-of-range numeric refs (e.g. &#x110000;) would throw RangeError in
// String.fromCodePoint and sink the whole feed. Keep the literal instead.
function codePoint(original: string, cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : original;
}

// feedId namespaces the key: RSS guid is only unique WITHIN one feed, so two
// feeds sharing an opaque guid would otherwise collide and wrongly dedup. With
// feedId the key is `rss:<feedId>#<guid>`; without it (unit tests) just `rss:<guid>`.
// Bound parse work so a hostile/huge feed can't exhaust CPU/memory. Field
// length is already capped (title via slice, summary 1000). These cap the
// document and item count we'll even look at.
const MAX_RSS_BYTES = 2_000_000; // 2MB of XML is far beyond any real feed
const MAX_RSS_ITEMS = 200;

export function parseRssFeed(xml: string, feedId = ''): Finding[] {
  const ns = feedId ? `${feedId}#` : '';
  const out: Finding[] = [];
  const items = (xml.slice(0, MAX_RSS_BYTES).match(/<item\b[\s\S]*?<\/item>/gi) ?? []).slice(0, MAX_RSS_ITEMS);
  const pick = (block: string, tag: string): string => {
    const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
    if (!m) return '';
    return decodeXmlEntities(
      m[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .trim(),
    );
  };
  for (const block of items) {
    const link = pick(block, 'link');
    const guid = pick(block, 'guid') || link;
    if (!guid) continue; // no stable key → drop, never emit `rss:`
    // guid is fine as a key (opaque id), but sourceUrl must be a SAFE URL:
    // http(s) only. A UUID guid → dead link; a `javascript:` link → XSS if the
    // UI renders it. Reject both; empty string is the safe default.
    const sourceUrl = safeHttpUrl(link) || safeHttpUrl(guid);
    out.push({
      key: `rss:${ns}${guid}`,
      title: pick(block, 'title') || guid,
      summary: pick(block, 'description').slice(0, 1000),
      sourceUrl,
    });
  }
  return out;
}

// Curated Walrus-ecosystem seed list. Routing is code, not model judgment.
const REPOS = ['MystenLabs/walrus', 'MystenLabs/walrus-sites', 'MystenLabs/MemWal'];

// RSS feeds are config-driven (comma-separated env) — no hard-coded endpoint to
// avoid shipping an unverified URL. Empty by default; the path is exercised by
// parseRssFeed unit tests regardless.
const RSS_FEEDS = (process.env.RSS_FEEDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const PER_REPO_TIMEOUT_MS = 8000;

// Defensive parse: GitHub can return an error object instead of an array, or
// entries missing a tag_name. Drop anything that can't form a stable key
// rather than emitting a Finding with key `gh:<repo>@undefined`.
export function parseReleases(repo: string, data: unknown): Finding[] {
  if (!Array.isArray(data)) return [];
  const out: Finding[] = [];
  for (const r of data) {
    if (!r || typeof (r as GhRelease).tag_name !== 'string') continue;
    const rel = r as Omit<GhRelease, 'repo'>;
    out.push(mapGithubRelease({ ...rel, repo }));
  }
  return out;
}

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

// Deps are injectable so the GitHub→RSS fallback gating can be tested
// deterministically without real network IO. Defaults are the production values.
export interface FetchDeps {
  fetchImpl?: typeof fetch;
  repos?: string[];
  rssFeeds?: string[];
}

export async function fetchCandidates(deps: FetchDeps = {}): Promise<Finding[]> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const repos = deps.repos ?? REPOS;
  const rssFeeds = deps.rssFeeds ?? RSS_FEEDS;
  const out: Finding[] = [];
  for (const repo of repos) {
    try {
      const res = await fetchImpl(`https://api.github.com/repos/${repo}/releases?per_page=10`, {
        headers: {
          Accept: 'application/vnd.github+json',
          ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
        },
        signal: AbortSignal.timeout(PER_REPO_TIMEOUT_MS),
      });
      if (!res.ok) continue; // rate-limited / 404 / 5xx — skip this repo
      out.push(...parseReleases(repo, await res.json()));
    } catch {
      /* network error / timeout / bad JSON — skip repo, other repos still cover the feed */
    }
  }
  // RSS fallback: only when GitHub yielded nothing (hard rate-limit / outage),
  // so RSS never duplicates the primary GitHub feed.
  if (out.length === 0) {
    for (const url of rssFeeds) {
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(PER_REPO_TIMEOUT_MS) });
        if (!res.ok) continue;
        out.push(...parseRssFeed(await res.text(), url));
      } catch {
        /* skip feed */
      }
    }
  }
  return out;
}

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
