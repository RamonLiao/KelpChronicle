// MemWal client wrapper — thin layer over the TEE relayer SDK.
// The SDK signs requests with an Ed25519 delegate key; embedding/encryption/
// Walrus upload happen server-side. We store CANONICAL JSON so the same artifact
// re-hashes to its on-chain attestation anchor (Verified badge lifeline).
import { MemWal } from '@mysten-incubation/memwal';
import { MEMWAL_RELAYER, MEMWAL_NAMESPACE } from './config.js';
import { canonicalize } from '../../shared/src/canonical.js';
import type { Artifact } from '../../shared/src/artifact.js';

// Minimal structural surface we depend on — lets tests inject a fake without a live account.
export interface MemoryClient {
  recall(p: { query: string; topK?: number; namespace?: string }): Promise<{ results: { text: string }[] }>;
  rememberAndWait(text: string, namespace?: string): Promise<{ blob_id: string }>;
  restore(namespace: string, limit?: number): Promise<unknown>;
}

// Secrets stay in env; constructed lazily so importing this module never requires them.
export function defaultClient(): MemoryClient {
  const key = process.env.MEMWAL_KEY;
  const accountId = process.env.MEMWAL_ACCOUNT_ID;
  if (!key || !accountId) {
    throw new Error('MEMWAL_KEY and MEMWAL_ACCOUNT_ID env vars are required (provision via playground first)');
  }
  return MemWal.create({ key, accountId, serverUrl: MEMWAL_RELAYER, namespace: MEMWAL_NAMESPACE }) as unknown as MemoryClient;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Full structural guard, not just a schema-tag check: a row may carry the right
// `schema` string but a garbage body (missing findings, wrong types). Such rows
// must be dropped here, or downstream canonicalize()/diff (which spread findings
// and read finding.key) crash — a poisoned-namespace DoS in a shared namespace.
function isArtifact(v: unknown): v is Artifact {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  return (
    a.schema === 'recall.report.v1' &&
    isStr(a.agent) &&
    isStr(a.namespace) &&
    isNum(a.runId) &&
    isNum(a.createdAtMs) &&
    isStr(a.topic) &&
    Array.isArray(a.priorRunIds) &&
    a.priorRunIds.every(isStr) &&
    Array.isArray(a.findings) &&
    a.findings.every(
      (f) =>
        f != null &&
        typeof f === 'object' &&
        isStr((f as Record<string, unknown>).key) &&
        isStr((f as Record<string, unknown>).title) &&
        isStr((f as Record<string, unknown>).summary) &&
        isStr((f as Record<string, unknown>).sourceUrl),
    )
  );
}

function safeParseArtifact(text: string): Artifact | null {
  try {
    const a: unknown = JSON.parse(text);
    return isArtifact(a) ? a : null;
  } catch {
    return null; // poisoned/corrupted row in a shared namespace must not crash recall
  }
}

export async function recallArtifacts(query: string, client: MemoryClient = defaultClient()): Promise<Artifact[]> {
  const { results } = await client.recall({ query, topK: 20, namespace: MEMWAL_NAMESPACE });
  return results.map((r) => safeParseArtifact(r.text)).filter((a): a is Artifact => a !== null);
}

export async function rememberArtifact(a: Artifact, client: MemoryClient = defaultClient()): Promise<{ blobId: string }> {
  const job = await client.rememberAndWait(canonicalize(a), MEMWAL_NAMESPACE);
  return { blobId: job.blob_id };
}

export async function restoreMemory(client: MemoryClient = defaultClient()): Promise<void> {
  await client.restore(MEMWAL_NAMESPACE, 100);
}
