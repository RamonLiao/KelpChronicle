import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectGraph } from '../src/lib/projectGraph.ts';
import type { Artifact, RunResult } from '../src/lib/api.ts';

const mk = (runId: number, keys: string[], priors: string[] = []): Artifact => ({
  schema: 'recall.report.v1', agent: '0x6', namespace: 'ns', runId, createdAtMs: runId * 1000,
  topic: 'Walrus', priorRunIds: priors,
  findings: keys.map((k) => ({ key: k, title: `T${k}`, summary: `S${k}`, sourceUrl: `https://x/${k}` })),
});

test('empty input -> empty graph', () => {
  assert.deepEqual(projectGraph([]), { nodes: [], edges: [] });
});

test('one run with two findings -> 1 run node + 2 finding nodes + 2 membership edges', () => {
  const g = projectGraph([mk(1, ['a', 'b'])]);
  assert.equal(g.nodes.filter((n) => n.kind === 'run').length, 1);
  assert.equal(g.nodes.filter((n) => n.kind === 'finding').length, 2);
  assert.equal(g.edges.filter((e) => e.kind === 'membership').length, 2);
});

test('duplicate finding key across runs is reused (one node), both runs link to it', () => {
  const g = projectGraph([mk(1, ['a']), mk(2, ['a', 'b'])]);
  assert.equal(g.nodes.filter((n) => n.id === 'finding:a').length, 1);
  assert.equal(g.edges.filter((e) => e.target === 'finding:a' && e.kind === 'membership').length, 2);
});

test('priorRunIds produce lineage edges; dangling priors skipped', () => {
  const g = projectGraph([mk(1, ['a']), mk(2, ['b'], ['1', '99'])]);
  const lineage = g.edges.filter((e) => e.kind === 'lineage');
  assert.equal(lineage.length, 1);
  assert.deepEqual(lineage[0], { source: 'run:2', target: 'run:1', kind: 'lineage' });
});

test('fresh: live findings whose key is new are fresh; live run node is fresh', () => {
  const prior = mk(1, ['a']);
  const liveArtifact = mk(2, ['a', 'c']); // a is known, c is new
  const live: RunResult = { artifact: liveArtifact, blobId: 'blob9', attestationDigest: '0xdig', knownHit: 1, freshCount: 1 };
  const g = projectGraph([prior, liveArtifact], live);
  assert.equal(g.nodes.find((n) => n.id === 'finding:c')?.fresh, true);
  assert.equal(g.nodes.find((n) => n.id === 'finding:a')?.fresh, false);
  const runNode = g.nodes.find((n) => n.id === 'run:2');
  assert.equal(runNode?.fresh, true);
  assert.equal(runNode?.blobId, 'blob9');
  assert.equal(runNode?.digest, '0xdig');
});

test('without live, no node is fresh and no blobId/digest set', () => {
  const g = projectGraph([mk(1, ['a'])]);
  assert.ok(g.nodes.every((n) => n.fresh === false));
  assert.ok(g.nodes.every((n) => n.blobId === undefined && n.digest === undefined));
});
