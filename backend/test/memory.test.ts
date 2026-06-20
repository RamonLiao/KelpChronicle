import { test } from 'node:test';
import assert from 'node:assert';
import { recallArtifacts, rememberArtifact, restoreMemory } from '../src/memory.js';
import type { Artifact } from '../../shared/src/artifact.js';
import { canonicalize } from '../../shared/src/canonical.js';

const artifact: Artifact = {
  schema: 'recall.report.v1',
  agent: '0xA',
  namespace: 'recall',
  runId: 1,
  createdAtMs: 123,
  topic: 't',
  findings: [{ key: 'k', title: 'T', summary: 's', sourceUrl: 'https://x' }],
  priorRunIds: [],
};

test('recallArtifacts parses valid artifacts and drops malformed/foreign rows', async () => {
  // why: a shared namespace can hold corrupted blobs or rows from other schemas;
  // a single bad JSON row must not crash the whole recall (DoS via poisoned memory).
  const fake = {
    recall: async () => ({
      results: [
        { text: canonicalize(artifact) }, // valid
        { text: '{not json' }, // malformed → drop, not throw
        { text: JSON.stringify({ schema: 'other.v1' }) }, // foreign schema → drop
        // right schema tag but garbage body: would crash canonicalize()/diff
        // (spread findings, read finding.key) if it leaked through → must drop.
        { text: JSON.stringify({ schema: 'recall.report.v1', agent: '0xB' }) }, // missing findings
        { text: JSON.stringify({ ...artifact, findings: 'oops' }) }, // findings not an array
        { text: JSON.stringify({ ...artifact, findings: [{ key: 1 }] }) }, // finding fields wrong type
        { text: JSON.stringify({ ...artifact, runId: 'x' }) }, // runId not a number
      ],
    }),
  };
  const out = await recallArtifacts('q', fake as never);
  assert.equal(out.length, 1);
  assert.equal(out[0].agent, '0xA');
});

test('rememberArtifact sends canonical JSON and returns blobId', async () => {
  // why: stored bytes MUST be canonical so the same artifact re-hashes to the
  // on-chain attestation anchor — this is the Verified badge's lifeline.
  let sent = '';
  const fake = {
    rememberAndWait: async (text: string) => {
      sent = text;
      return { blob_id: 'BLOB123' };
    },
  };
  const res = await rememberArtifact(artifact, fake as never);
  assert.equal(res.blobId, 'BLOB123');
  assert.equal(sent, canonicalize(artifact));
});

test('restoreMemory restores the configured namespace', async () => {
  let ns = '';
  const fake = {
    restore: async (n: string) => {
      ns = n;
      return {};
    },
  };
  await restoreMemory(fake as never);
  assert.equal(ns, 'recall');
});
