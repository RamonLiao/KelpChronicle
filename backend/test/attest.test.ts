import { test } from 'node:test';
import assert from 'node:assert';
import { buildAttestTx } from '../src/attest.js';
import { RECALL_PACKAGE_ID, RECALL_MODULE } from '../src/config.js';
import { fromHex, fromBase64 } from '@mysten/sui/utils';

// Decode a Pure vector<u8> input back to its raw bytes (strip BCS ULEB length prefix).
// Hash <=255 bytes ⇒ single-byte prefix, which is all this module ever passes.
function pureVecU8(input: any): Uint8Array {
  const bytes = fromBase64(input.Pure.bytes);
  return bytes.slice(1); // drop the ULEB128 length byte
}

const HEX = 'ab'.repeat(32); // 32-byte keccak256 digest

test('attest tx targets the deployed recall::attestation::attest — wrong target would anchor into the wrong module and silently break Verified', () => {
  const d = buildAttestTx({ agent: '0x2', namespace: 'recall', runId: 1, artifactHashHex: HEX, blobId: 'b' }).getData();
  const mc = (d.commands[0] as any).MoveCall;
  // package normalizes to 0x-padded form; compare via normalized RECALL_PACKAGE_ID hex tail.
  assert.strictEqual(mc.module, RECALL_MODULE);
  assert.strictEqual(mc.function, 'attest');
  assert.ok(RECALL_PACKAGE_ID.endsWith(mc.package.replace(/^0x0*/, '')) || mc.package.endsWith(RECALL_PACKAGE_ID.replace(/^0x/, '')));
  assert.strictEqual(mc.arguments.length, 6); // agent, ns, runId, hash, blobId, clock
});

test('the anchored bytes are exactly fromHex(artifactHashHex) — Move never recomputes the JSON, so a hex/byte mismatch here makes on-chain hash != stored artifact', () => {
  const d = buildAttestTx({ agent: '0x2', namespace: 'recall', runId: 1, artifactHashHex: HEX, blobId: 'b' }).getData();
  // arg order: [agent, namespace, runId, artifactHash, blobId, clock] → hash is input index 3.
  const hashBytes = pureVecU8(d.inputs[3]);
  assert.deepStrictEqual(Array.from(hashBytes), Array.from(fromHex(HEX)));
  assert.strictEqual(hashBytes.length, 32);
});

test('namespace + blobId are encoded as UTF-8 bytes so off-chain text round-trips on-chain', () => {
  const d = buildAttestTx({ agent: '0x2', namespace: 'recall', runId: 1, artifactHashHex: HEX, blobId: 'blob-xyz' }).getData();
  assert.strictEqual(new TextDecoder().decode(pureVecU8(d.inputs[1])), 'recall'); // namespace
  assert.strictEqual(new TextDecoder().decode(pureVecU8(d.inputs[4])), 'blob-xyz'); // blobId
});

// monkey: odd-length / non-hex must throw inside fromHex rather than anchoring garbage bytes.
test('malformed artifactHashHex is rejected, never anchored', () => {
  assert.throws(() => buildAttestTx({ agent: '0x2', namespace: 'recall', runId: 1, artifactHashHex: 'zz', blobId: 'b' }));
});
