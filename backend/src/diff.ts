import type { Finding } from '../../shared/src/artifact.js';

// Deterministic delta engine — never an LLM. Two-layer dedup:
// (1) drop candidates already in `known` (memory recalled from prior runs),
// (2) drop intra-batch duplicate keys. knownHit counts every already-known
// occurrence so the agent can report how much of the feed was prior knowledge.
export function computeDelta(
  known: Set<string>,
  candidates: Finding[],
): { fresh: Finding[]; knownHit: number } {
  const seen = new Set<string>();
  const fresh: Finding[] = [];
  let knownHit = 0;
  for (const c of candidates) {
    if (known.has(c.key)) {
      knownHit++;
      continue;
    }
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    fresh.push(c);
  }
  return { fresh, knownHit };
}
