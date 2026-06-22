import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectGraph } from '../src/lib/projectGraph.ts';
import type { Artifact, RunResult } from '../src/lib/api.ts';

const mk = (runId: number, keys: string[], priors: string[] = [], topic = 'Walrus'): Artifact => ({
  schema: 'recall.report.v1', agent: '0x6', namespace: 'ns', runId, createdAtMs: runId * 1000,
  topic, priorRunIds: priors,
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

// two artifacts can legitimately share a runId: a backfilled historical artifact and a
// live-fetched one both carry runId 1. The projection must collapse them onto a single
// run node (not emit a duplicate). This is the same shared-runId reality that forced the
// MemoryRestore list to key by `${runId}-${createdAtMs}` instead of runId alone.
test('two artifacts sharing a runId collapse to one run node; findings union', () => {
  const g = projectGraph([mk(1, ['a', 'b']), mk(1, ['a', 'c'])]);
  assert.equal(g.nodes.filter((n) => n.id === 'run:1').length, 1);
  assert.equal(g.nodes.filter((n) => n.kind === 'finding').length, 3); // a,b,c unioned
  // membership edges must also union — the repeated run:1->finding:a pair is emitted once,
  // else d3 forceLink double-pulls finding:a and the retrieval pulse draws twice.
  assert.equal(g.edges.filter((e) => e.kind === 'membership').length, 3); // a,b,c (a not doubled)
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

test('attestation map backfills blobId/digest onto historical run nodes', () => {
  const g = projectGraph([mk(1, ['a'])], null, { '1': { blobId: 'bb', digest: '0xdd' } });
  const run = g.nodes.find((n) => n.id === 'run:1');
  assert.equal(run?.blobId, 'bb');
  assert.equal(run?.digest, '0xdd');
});

test('live result takes precedence over attestation backfill', () => {
  const liveArtifact = mk(2, ['c']);
  const live: RunResult = { artifact: liveArtifact, blobId: 'liveBlob', attestationDigest: '0xlive', knownHit: 0, freshCount: 1 };
  const g = projectGraph([liveArtifact], live, { '2': { blobId: 'stale', digest: '0xstale' } });
  const run = g.nodes.find((n) => n.id === 'run:2');
  assert.equal(run?.blobId, 'liveBlob');
  assert.equal(run?.digest, '0xlive');
});

test('without live, no node is fresh and no blobId/digest set', () => {
  const g = projectGraph([mk(1, ['a'])]);
  assert.ok(g.nodes.every((n) => n.fresh === false));
  assert.ok(g.nodes.every((n) => n.blobId === undefined && n.digest === undefined));
});

test('every node carries the topic of its run', () => {
  const g = projectGraph([mk(1, ['a'], [], 'Walrus'), mk(2, ['b'], [], 'Seal')]);
  assert.equal(g.nodes.find((n) => n.id === 'run:1')!.topic, 'Walrus');
  assert.equal(g.nodes.find((n) => n.id === 'finding:a')!.topic, 'Walrus');
  assert.equal(g.nodes.find((n) => n.id === 'run:2')!.topic, 'Seal');
  assert.equal(g.nodes.find((n) => n.id === 'finding:b')!.topic, 'Seal');
});

test('lineage is NOT drawn across topics (two plants stay separate)', () => {
  // run 2 lists run 1 as a prior, but they are different topics -> no lineage edge
  const g = projectGraph([mk(1, ['a'], [], 'Walrus'), mk(2, ['b'], ['1'], 'Seal')]);
  assert.equal(g.edges.filter((e) => e.kind === 'lineage').length, 0);
});

test('lineage IS drawn within the same topic', () => {
  const g = projectGraph([mk(1, ['a'], [], 'Walrus'), mk(2, ['b'], ['1'], 'Walrus')]);
  assert.equal(g.edges.filter((e) => e.kind === 'lineage' && e.source === 'run:2' && e.target === 'run:1').length, 1);
});

test('barren re-runs collapse: only productive runs + latest survive', () => {
  // run1 introduces a,b; run2 & run3 add nothing new (same topic, same keys)
  const g = projectGraph([mk(1, ['a', 'b'], [], 'Walrus'), mk(2, ['a'], ['1'], 'Walrus'), mk(3, ['a', 'b'], ['1', '2'], 'Walrus')]);
  const runIds = g.nodes.filter((n) => n.kind === 'run').map((n) => n.runId).sort();
  assert.deepEqual(runIds, [1, 3]); // run2 dropped (barren); run3 kept as latest head
  // findings still present and attached to a surviving run
  assert.ok(g.nodes.find((n) => n.id === 'finding:a'));
  assert.ok(g.nodes.find((n) => n.id === 'finding:b'));
});

test('no finding is orphaned after collapse (every finding has a membership edge to a kept run)', () => {
  const g = projectGraph([mk(1, ['a', 'b'], [], 'W'), mk(2, [], ['1'], 'W'), mk(3, [], ['1', '2'], 'W')]);
  const runNodeIds = new Set(g.nodes.filter((n) => n.kind === 'run').map((n) => n.id));
  for (const fn of g.nodes.filter((n) => n.kind === 'finding')) {
    const hasKeptOwner = g.edges.some((e) => e.kind === 'membership' && e.target === fn.id && runNodeIds.has(e.source));
    assert.ok(hasKeptOwner, `finding ${fn.id} orphaned`);
  }
});

test('single productive topic is unchanged (no regression)', () => {
  const g = projectGraph([mk(1, ['a', 'b'], [], 'W')]);
  assert.equal(g.nodes.filter((n) => n.kind === 'run').length, 1);
  assert.equal(g.edges.filter((e) => e.kind === 'membership').length, 2);
});

test('no edge points at a dropped run node', () => {
  const g = projectGraph([mk(1, ['a'], [], 'W'), mk(2, [], ['1'], 'W'), mk(3, [], ['2'], 'W')]);
  const ids = new Set(g.nodes.map((n) => n.id));
  for (const e of g.edges) { assert.ok(ids.has(e.source) && ids.has(e.target), `edge to missing node ${e.source}->${e.target}`); }
});
