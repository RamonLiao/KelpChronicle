import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTopicArtifacts } from '../src/hooks/useMemory.ts';
import type { Artifact } from '../src/lib/api.ts';

const art = (topic: string, runId: number): Artifact => ({
  schema: 'recall.report.v1', agent: '0x6', namespace: 'ns', runId, createdAtMs: runId * 1000,
  topic, priorRunIds: [], findings: [],
});

test('merges all loaded topics, skips errored (undefined data)', () => {
  const merged = mergeTopicArtifacts([{ data: [art('A', 1)] }, { data: undefined }, { data: [art('B', 1)] }]);
  assert.deepEqual(merged.map((a) => a.topic), ['A', 'B']);
});

test('stable ordering by (topic, runId) regardless of input order', () => {
  const merged = mergeTopicArtifacts([{ data: [art('B', 2), art('A', 3)] }, { data: [art('A', 1)] }]);
  assert.deepEqual(merged.map((a) => `${a.topic}${a.runId}`), ['A1', 'A3', 'B2']);
});
