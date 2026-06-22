import { test } from 'node:test';
import assert from 'node:assert';
import { runAgent, type RunDeps } from '../src/run.js';
import { artifactHashHex } from '../../shared/src/canonical.js';
import { fromBase64 } from '@mysten/sui/utils';
import type { Artifact, Finding } from '../../shared/src/artifact.js';

const f = (key: string): Finding => ({ key, title: key, summary: key, sourceUrl: `https://x/${key}` });

const priorArtifact = (runId: number, keys: string[]): Artifact => ({
  schema: 'recall.report.v1',
  agent: '0xprior',
  namespace: 'recall',
  runId,
  createdAtMs: 0,
  topic: 't',
  findings: keys.map(f),
  priorRunIds: [],
});

// Capturing fake deps so the whole loop runs offline; records what got remembered + the tx executed.
function fakeDeps(over: Partial<{ prior: Artifact[]; candidates: Finding[]; searchResults: Finding[] }> = {}): {
  deps: RunDeps;
  captured: { remembered?: Artifact; txHashBytes?: Uint8Array; searchCalled?: boolean };
} {
  const captured: { remembered?: Artifact; txHashBytes?: Uint8Array; searchCalled?: boolean } = {};
  const deps: RunDeps = {
    recall: async () => over.prior ?? [],
    fetch: async () => over.candidates ?? [],
    search: async () => { captured.searchCalled = true; return over.searchResults ?? []; },
    remember: async (a) => {
      captured.remembered = a;
      return { blobId: 'blob-1' };
    },
    execute: async (tx) => {
      const d = tx.getData();
      captured.txHashBytes = fromBase64((d.inputs[3] as any).Pure.bytes).slice(1); // anchored hash
      return { digest: 'DIGEST123' };
    },
  };
  return { deps, captured };
}

test('runId is a best-effort monotonic label above every recalled prior run (uniqueness comes from the on-chain object, not this label)', async () => {
  const { deps } = fakeDeps({ prior: [priorArtifact(2, ['a']), priorArtifact(5, ['b'])], candidates: [f('c')] });
  const r = await runAgent('t', '0xa1', 1000, deps);
  assert.strictEqual(r.artifact.runId, 6);
  assert.deepStrictEqual(r.artifact.priorRunIds, ['2', '5']);
});

test('the artifact stored on Walrus is the SAME bytes anchored on-chain — store-then-anchor invariant is what makes Verified honest', async () => {
  const { deps, captured } = fakeDeps({ candidates: [f('c')] });
  const r = await runAgent('t', '0xa1', 1000, deps);
  // anchored hash bytes must equal the keccak256 of the artifact that was remembered.
  const expected = artifactHashHex(captured.remembered!);
  const anchoredHex = Buffer.from(captured.txHashBytes!).toString('hex');
  assert.strictEqual(anchoredHex, expected);
  assert.strictEqual(captured.remembered, r.artifact); // exact same object, no re-serialize drift
});

test('findings already in recalled memory are dropped from the new run (delta-only research)', async () => {
  const { deps } = fakeDeps({ prior: [priorArtifact(1, ['known'])], candidates: [f('known'), f('fresh')] });
  const r = await runAgent('t', '0xa1', 1000, deps);
  assert.strictEqual(r.knownHit, 1);
  assert.strictEqual(r.freshCount, 1);
  assert.deepStrictEqual(r.artifact.findings.map((x) => x.key), ['fresh']);
});

// monkey: cold start (no memory) + empty feed → runId 1, zero findings, still anchors a run.
test('cold start with empty feed still produces an attested run-1 artifact', async () => {
  const { deps } = fakeDeps();
  const r = await runAgent('t', '0xa1', 1000, deps);
  assert.strictEqual(r.artifact.runId, 1);
  assert.strictEqual(r.freshCount, 0);
  assert.strictEqual(r.attestationDigest, 'DIGEST123');
  assert.deepStrictEqual(r.artifact.priorRunIds, []);
});

// WHY: when curated fresh findings already meet THRESHOLD, search must NOT fire —
// that's the whole point of M3 (don't spend rate-limited search calls when the
// curated feed is rich).
test('search does NOT fire when curated fresh >= THRESHOLD', async () => {
  const candidates = ['a', 'b', 'c', 'd', 'e', 'f'].map(f); // 6 fresh >= 5
  const { deps, captured } = fakeDeps({ candidates });
  await runAgent('walrus', '0xa1', 1, deps);
  assert.strictEqual(captured.searchCalled, undefined);
  assert.strictEqual(captured.remembered?.findings.length, 6);
});

// WHY: when curated is thin (fresh < THRESHOLD), search fires and its results
// merge in (deduped) so a cold topic still grows leaves.
test('search fires when curated fresh < THRESHOLD and merges deduped', async () => {
  const candidates = ['a', 'b'].map(f); // 2 fresh < 5
  const searchResults = ['b', 'c', 'd'].map(f); // 'b' overlaps → dedupes
  const { deps, captured } = fakeDeps({ candidates, searchResults });
  await runAgent('cold topic', '0xa1', 1, deps);
  assert.strictEqual(captured.searchCalled, true);
  const keys = captured.remembered?.findings.map((x) => x.key).sort();
  assert.deepStrictEqual(keys, ['a', 'b', 'c', 'd']); // merged + deduped
});
