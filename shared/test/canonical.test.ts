import { test } from 'node:test';
import assert from 'node:assert';
import { canonicalize, artifactHashHex } from '../src/canonical.js';
import type { Artifact } from '../src/artifact.js';

const base: Artifact = {
  schema: 'recall.report.v1', agent: '0xabc', namespace: 'walrus-ecosystem',
  runId: 2, createdAtMs: 1718000000000, topic: 't',
  findings: [
    { key: 'b', title: 'B', summary: 's', sourceUrl: 'u2' },
    { key: 'a', title: 'A', summary: 's', sourceUrl: 'u1' },
  ],
  priorRunIds: ['1'],
};

test('canonical output is key-sorted and finding-sorted, whitespace-free', () => {
  const c = canonicalize(base);
  assert.ok(!/\s/.test(c), 'no whitespace');
  // findings reordered by key → "a" before "b"
  assert.ok(c.indexOf('"key":"a"') < c.indexOf('"key":"b"'));
  // top-level keys sorted: agent before topic
  assert.ok(c.indexOf('"agent"') < c.indexOf('"topic"'));
});

// GOLDEN: freezes the byte-identical serialization contract between backend
// hashing and frontend verification. If this fails, every "✓ Verified on-chain"
// badge silently breaks — do NOT update these values to make it pass without
// understanding why the serialization drifted.
test('golden canonical string and hash are frozen', () => {
  assert.strictEqual(
    canonicalize(base),
    '{"agent":"0xabc","createdAtMs":1718000000000,"findings":[{"key":"a","sourceUrl":"u1","summary":"s","title":"A"},{"key":"b","sourceUrl":"u2","summary":"s","title":"B"}],"namespace":"walrus-ecosystem","priorRunIds":["1"],"runId":2,"schema":"recall.report.v1","topic":"t"}',
  );
  assert.strictEqual(
    artifactHashHex(base),
    'afc1b94c625f1a2394e33e58f528bc6d55b2b79e9a89da0394c37259ee5a2428',
  );
});

test('reordering findings does not change the hash', () => {
  const shuffled: Artifact = { ...base, findings: [...base.findings].reverse() };
  assert.strictEqual(artifactHashHex(base), artifactHashHex(shuffled));
});

test('changing a finding changes the hash', () => {
  const tampered: Artifact = { ...base, findings: [{ ...base.findings[0], summary: 'x' }, base.findings[1]] };
  assert.notStrictEqual(artifactHashHex(base), artifactHashHex(tampered));
});
