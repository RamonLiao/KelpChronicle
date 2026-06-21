import { normalizeSuiAddress } from '@mysten/sui/utils';
import { SUI_NETWORK, RECALL_PACKAGE_ID } from './config.js';

export interface AttestRow { runId: number; blobId: string; digest: string }
export interface AttestIndexDeps { listAttestations: (agent: string, namespace: string) => Promise<AttestRow[]> }

// gRPC v2 (fullnode) is point-lookup only (by id / by owner) — it cannot list objects by
// type, and RunAttestation is frozen (no owner) so listOwnedObjects is useless. The indexer
// GraphQL endpoint is the only way to enumerate frozen objects of a given type.
const GRAPHQL_URL: Record<string, string> = {
  testnet: 'https://graphql.testnet.sui.io/graphql',
  mainnet: 'https://graphql.mainnet.sui.io/graphql',
};

// Page cap so a runaway dataset can't hang the request; we log if we hit it (Rule 12: no
// silent truncation). 50/page × 20 pages = 1000 runs, far beyond any demo.
const PAGE_SIZE = 50;
const MAX_PAGES = 20;

const RUN_ATTESTATION_TYPE = `${RECALL_PACKAGE_ID}::attestation::RunAttestation`;

interface AttRaw {
  agent: string;
  namespace: string; // base64
  run_id: string;
  walrus_blob_id: string; // base64
  created_at_ms: string;
}

function b64ToUtf8(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf8');
}

// Live impl: query frozen RunAttestation objects via the indexer, filter by agent+namespace,
// map each to {runId, blobId, digest} where digest is the creating tx (previousTransaction of
// a never-mutated frozen object). Constructed lazily so the loop stays testable with a fake.
export function defaultListAttestations(): AttestIndexDeps['listAttestations'] {
  const url = GRAPHQL_URL[SUI_NETWORK] ?? GRAPHQL_URL.testnet;
  return async (agent, namespace) => {
    const wantAgent = normalizeSuiAddress(agent);
    const found: Array<AttestRow & { createdAtMs: number }> = [];
    let after: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const afterArg = after ? `, after: "${after}"` : '';
      const query = `{ objects(filter: {type: "${RUN_ATTESTATION_TYPE}"}, first: ${PAGE_SIZE}${afterArg}) {
        pageInfo { hasNextPage endCursor }
        nodes { previousTransaction { digest } asMoveObject { contents { json } } }
      } }`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error(`indexer GraphQL ${res.status}`);
      const body = (await res.json()) as {
        data?: { objects?: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Array<{ previousTransaction: { digest: string } | null; asMoveObject: { contents: { json: AttRaw } } }> } };
        errors?: Array<{ message: string }>;
      };
      if (body.errors?.length) throw new Error(`indexer GraphQL: ${body.errors.map((e) => e.message).join('; ')}`);
      const conn = body.data?.objects;
      if (!conn) break;
      for (const n of conn.nodes) {
        const j = n.asMoveObject?.contents?.json;
        const digest = n.previousTransaction?.digest;
        if (!j || !digest) continue;
        if (normalizeSuiAddress(j.agent) !== wantAgent) continue;
        if (b64ToUtf8(j.namespace) !== namespace) continue;
        found.push({ runId: Number(j.run_id), blobId: b64ToUtf8(j.walrus_blob_id), digest, createdAtMs: Number(j.created_at_ms) });
      }
      if (!conn.pageInfo.hasNextPage) {
        // Sort oldest→newest so a re-attested runId resolves to its LATEST record in
        // makeAttestIndex ("later rows win"). GraphQL page order isn't time-ordered, so
        // we can't rely on insertion order alone.
        found.sort((a, b) => a.createdAtMs - b.createdAtMs);
        return found.map(({ runId, blobId, digest }) => ({ runId, blobId, digest }));
      }
      after = conn.pageInfo.endCursor;
    }
    // Fail loud (Rule 12): the objects connection can't filter by agent/namespace on-chain,
    // so a multi-agent dataset exceeding the page cap would yield a SILENT partial index.
    // Throw rather than return incomplete data behind a 200.
    throw new Error(`[/attestations] exceeded ${PAGE_SIZE * MAX_PAGES}-object scan cap for ${RUN_ATTESTATION_TYPE}; index would be incomplete (needs an indexed event/field query for multi-agent scale)`);
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
