// On-chain attestation: anchor a run's artifact hash via recall::attestation::attest.
// buildAttestTx is PURE (no IO) so it can be unit-tested offline; signing+execution
// lives in defaultExecutor(), env-gated like memory.ts's defaultClient() so importing
// this module never requires a signer key.
import { Transaction } from '@mysten/sui/transactions';
import { fromHex } from '@mysten/sui/utils';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { RECALL_ATTEST_TARGET, SUI_NETWORK } from './config.js';

export interface AttestParams {
  agent: string;
  namespace: string;
  runId: number;
  artifactHashHex: string;
  blobId: string;
}

// Move sig: attest(agent, namespace, run_id, artifact_hash, walrus_blob_id, clock, ctx).
// artifact_hash is the keccak256 bytes from Task 2 — Move does NOT recompute the JSON,
// so this builder is the single source of the bytes that get anchored.
export function buildAttestTx(p: AttestParams): Transaction {
  const enc = new TextEncoder();
  const tx = new Transaction();
  tx.moveCall({
    target: RECALL_ATTEST_TARGET,
    arguments: [
      tx.pure.address(p.agent),
      tx.pure.vector('u8', Array.from(enc.encode(p.namespace))),
      tx.pure.u64(p.runId),
      tx.pure.vector('u8', Array.from(fromHex(p.artifactHashHex))),
      tx.pure.vector('u8', Array.from(enc.encode(p.blobId))),
      tx.object('0x6'), // shared Clock
    ],
  });
  return tx;
}

// Executes a built attest tx and returns the on-chain digest. Injected into runAgent
// so the loop is testable with a fake; the live impl is constructed lazily.
export type AttestExecutor = (tx: Transaction) => Promise<{ digest: string }>;

const GRPC_URL: Record<string, string> = {
  testnet: 'https://fullnode.testnet.sui.io',
  mainnet: 'https://fullnode.mainnet.sui.io',
  devnet: 'https://fullnode.devnet.sui.io',
};

// Live executor — needs a signer. Constructed only when called, throws if env missing.
export function defaultExecutor(): AttestExecutor {
  const secret = process.env.RECALL_SIGNER_KEY;
  if (!secret) {
    throw new Error('RECALL_SIGNER_KEY env var is required to sign attestations (suiprivkey... bech32)');
  }
  const url = GRPC_URL[SUI_NETWORK] ?? GRPC_URL.testnet;
  const keypair = Ed25519Keypair.fromSecretKey(secret);
  const client = new SuiGrpcClient({ network: SUI_NETWORK as 'testnet', baseUrl: url });
  return async (tx: Transaction) => {
    const res = await client.signAndExecuteTransaction({ transaction: tx, signer: keypair });
    // Fail loud (Rule 12): a reverted attest must not be reported as a successful anchor.
    if (res.$kind === 'FailedTransaction') {
      throw new Error(`attestation tx failed: ${JSON.stringify(res.FailedTransaction.status)}`);
    }
    const digest = res.Transaction.digest;
    await client.waitForTransaction({ digest });
    return { digest };
  };
}
