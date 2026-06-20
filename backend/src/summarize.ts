// Toy summarizer — normalizes each finding's summary (truncate + title prefix).
// Pure + deterministic so canonical bytes stay stable. A real-LLM swap is a later
// stretch with the SAME signature, keeping the run loop unchanged.
import type { Finding } from '../../shared/src/artifact.js';

const MAX = 500;

export function summarizeFresh(fresh: Finding[]): Finding[] {
  return fresh.map((f) => ({
    ...f,
    summary: `${f.title}: ${f.summary.replace(/\s+/g, ' ').trim()}`.trim().slice(0, MAX),
  }));
}
