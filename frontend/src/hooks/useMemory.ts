import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { api, type Artifact } from '../lib/api.ts';

// Pure: merge per-topic query results into one stably-ordered array. Errored topics
// (data === undefined) are skipped so one failing /memory never blanks the forest.
// Dedupes by (runId, createdAtMs, topic) to eliminate semantic recall overlap across topic queries.
// If allowedTopics is provided, restricts the result to only those topics (filters out bleed-over).
export function mergeTopicArtifacts(
  results: ReadonlyArray<{ data?: Artifact[] }>,
  allowedTopics?: readonly string[],
): Artifact[] {
  const allow = allowedTopics ? new Set(allowedTopics) : null;
  const all: Artifact[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (!r.data) continue;
    for (const a of r.data) {
      if (allow && !allow.has(a.topic)) continue;
      const id = `${a.runId}-${a.createdAtMs}-${a.topic}`;
      if (seen.has(id)) continue;
      seen.add(id);
      all.push(a);
    }
  }
  return all.sort((a, b) => (a.topic < b.topic ? -1 : a.topic > b.topic ? 1 : a.runId - b.runId));
}

export function useMemoriesForTopics(topics: string[]) {
  const results = useQueries({
    queries: topics.map((t) => ({
      queryKey: ['memory', t],
      queryFn: () => api.getMemory(t),
      enabled: t.trim().length > 0,
    })),
  });
  // Recompute the merge only when a topic's data actually changes — depend on a single
  // string key built from each query's dataUpdatedAt, NOT the fresh `results` array identity
  // (which changes every render and would rebuild the d3 sim downstream).
  const updatedKey = results.map((r) => r.dataUpdatedAt).join(',');
  const topicsKey = topics.join(' ');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const artifacts = useMemo(() => mergeTopicArtifacts(results, topics), [updatedKey, topicsKey]);
  return {
    artifacts,
    isError: results.some((r) => r.isError),
    isLoading: results.some((r) => r.isLoading),
    refetch: () => { for (const r of results) void r.refetch(); },
  };
}
