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
    // Validate element types too, not just that match/repos are arrays: a row
    // like {"match":[null],...} or {"rssFeeds":123} would pass a shallow
    // Array.isArray check then crash in resolveSources (kw.toLowerCase() / for-of).
    // Poisoned env must fall back to SEED, never crash (Rule 12 fail-loud → safe default).
    const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
    const ok = parsed.every(
      (e) =>
        e && typeof e === 'object' &&
        isStrArr((e as SourceEntry).match) &&
        isStrArr((e as SourceEntry).repos) &&
        ((e as SourceEntry).rssFeeds === undefined || isStrArr((e as SourceEntry).rssFeeds)),
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
