import { useMemo } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { api, type Artifact } from '../lib/api.ts';

export function useMemory(topic: string) {
  return useQuery<Artifact[]>({
    queryKey: ['memory', topic],
    queryFn: () => api.getMemory(topic),
    enabled: topic.trim().length > 0,
  });
}

// Pure: merge per-topic query results into one stably-ordered array. Errored topics
// (data === undefined) are skipped so one failing /memory never blanks the forest.
export function mergeTopicArtifacts(results: ReadonlyArray<{ data?: Artifact[] }>): Artifact[] {
  const all: Artifact[] = [];
  for (const r of results) if (r.data) all.push(...r.data);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const artifacts = useMemo(() => mergeTopicArtifacts(results), [updatedKey]);
  return {
    artifacts,
    isError: results.some((r) => r.isError),
    isLoading: results.some((r) => r.isLoading),
    refetch: () => { for (const r of results) void r.refetch(); },
  };
}
