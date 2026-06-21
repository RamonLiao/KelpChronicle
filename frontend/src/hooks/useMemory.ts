import { useQuery } from '@tanstack/react-query';
import { api, type Artifact } from '../lib/api.ts';

export function useMemory(topic: string) {
  return useQuery<Artifact[]>({
    queryKey: ['memory', topic],
    queryFn: () => api.getMemory(topic),
    enabled: topic.trim().length > 0,
  });
}
