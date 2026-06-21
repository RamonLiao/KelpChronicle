import { SuiGrpcClient } from '@mysten/sui/grpc';
import { SUI_NETWORK, RECALL_PACKAGE_ID } from './config.js';

export interface AttestRow { runId: number; blobId: string; digest: string }
export interface AttestIndexDeps { listAttestations: (agent: string, namespace: string) => Promise<AttestRow[]> }

const GRPC_URL: Record<string, string> = {
  testnet: 'https://fullnode.testnet.sui.io', mainnet: 'https://fullnode.mainnet.sui.io',
};

// Live impl: query RunAttestation objects of type `${pkg}::attestation::RunAttestation`,
// filter by agent+namespace fields, read runId/blobId from object fields and digest from the
// creating transaction. Constructed lazily so the loop stays testable with a fake.
export function defaultListAttestations(): AttestIndexDeps['listAttestations'] {
  const client = new SuiGrpcClient({ network: SUI_NETWORK as 'testnet', baseUrl: GRPC_URL[SUI_NETWORK] ?? GRPC_URL.testnet });
  return async (agent, namespace) => {
    // Implementer: use client event/object query for type
    // `${RECALL_PACKAGE_ID}::attestation::RunAttestation`; map each to {runId, blobId, digest}.
    // Filter by matching agent + namespace fields. Return [] on none.
    // Stubbed until the deployed package has attestations to index (Task 9 Step 3 live run).
    void client; void agent; void namespace; void RECALL_PACKAGE_ID;
    return [];
  };
}

export function makeAttestIndex(deps: AttestIndexDeps = { listAttestations: defaultListAttestations() }) {
  return async (agent: string, namespace: string): Promise<Record<string, { blobId: string; digest: string }>> => {
    const rows = await deps.listAttestations(agent, namespace);
    const out: Record<string, { blobId: string; digest: string }> = {};
    for (const r of rows) out[String(r.runId)] = { blobId: r.blobId, digest: r.digest }; // later rows win (latest)
    return out;
  };
}
