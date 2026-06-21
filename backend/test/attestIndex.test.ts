import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAttestIndex } from '../src/attestIndex.js';

test('maps on-chain attestations to runId -> {blobId,digest}', async () => {
  const fakeList = async () => [
    { runId: 1, blobId: 'b1', digest: '0xd1' },
    { runId: 2, blobId: 'b2', digest: '0xd2' },
  ];
  const index = makeAttestIndex({ listAttestations: fakeList });
  const r = await index('0x6', 'ns');
  assert.deepEqual(r, { '1': { blobId: 'b1', digest: '0xd1' }, '2': { blobId: 'b2', digest: '0xd2' } });
});

test('latest digest wins when a runId has multiple attestations', async () => {
  const fakeList = async () => [
    { runId: 1, blobId: 'b1', digest: '0xold' },
    { runId: 1, blobId: 'b1b', digest: '0xnew' },
  ];
  const index = makeAttestIndex({ listAttestations: fakeList });
  const r = await index('0x6', 'ns');
  assert.equal(r['1'].digest, '0xnew');
});
