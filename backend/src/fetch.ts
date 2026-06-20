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

// Curated Walrus-ecosystem seed list. Routing is code, not model judgment.
const REPOS = ['MystenLabs/walrus', 'MystenLabs/walrus-sites', 'MystenLabs/MemWal'];

const PER_REPO_TIMEOUT_MS = 8000;

// Defensive parse: GitHub can return an error object instead of an array, or
// entries missing a tag_name. Drop anything that can't form a stable key
// rather than emitting a Finding with key `gh:<repo>@undefined`.
function parseReleases(repo: string, data: unknown): Finding[] {
  if (!Array.isArray(data)) return [];
  const out: Finding[] = [];
  for (const r of data) {
    if (!r || typeof (r as GhRelease).tag_name !== 'string') continue;
    const rel = r as Omit<GhRelease, 'repo'>;
    out.push(mapGithubRelease({ ...rel, repo }));
  }
  return out;
}

export async function fetchCandidates(): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const repo of REPOS) {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, {
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
  // RSS fallback: if GitHub yielded nothing (e.g. hard rate-limit), a future
  // step can parse the Walrus blog RSS → key `rss:<guid>`. Omitted until needed.
  return out;
}
