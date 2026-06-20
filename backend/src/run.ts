// Agent run loop: recall prior memory → fetch feed → diff to delta → summarize →
// remember on Walrus → anchor artifact hash on-chain. Every non-LLM step is
// deterministic code (Rule 5); only summarize is model-shaped (currently a toy).
// Deps are injected so the whole loop is testable offline with fakes — the only
// untested path is real relayer/chain IO.
import { recallArtifacts, rememberArtifact } from './memory.js';
import { fetchCandidates } from './fetch.js';
import { computeDelta } from './diff.js';
import { summarizeFresh } from './summarize.js';
import { artifactHashHex } from '../../shared/src/canonical.js';
import type { Artifact } from '../../shared/src/artifact.js';
import { buildAttestTx, defaultExecutor, type AttestExecutor } from './attest.js';
import { MEMWAL_NAMESPACE } from './config.js';

export interface RunDeps {
  recall: typeof recallArtifacts;
  fetch: typeof fetchCandidates;
  remember: typeof rememberArtifact;
  execute: AttestExecutor;
}

// defaultExecutor() is called lazily (only when execute actually runs) so importing
// run.ts and injecting fakes never demands a signer key.
const defaultDeps = (): RunDeps => ({
  recall: recallArtifacts,
  fetch: fetchCandidates,
  remember: rememberArtifact,
  execute: (tx) => defaultExecutor()(tx),
});

export interface RunResult {
  artifact: Artifact;
  blobId: string;
  attestationDigest: string;
  knownHit: number;
  freshCount: number;
}

export async function runAgent(
  topic: string,
  agent: string,
  nowMs: number,
  deps: RunDeps = defaultDeps(),
): Promise<RunResult> {
  const prior = await deps.recall(topic);
  const known = new Set(prior.flatMap((a) => a.findings.map((f) => f.key)));
  const candidates = await deps.fetch();
  const { fresh, knownHit } = computeDelta(known, candidates);
  const summarized = summarizeFresh(fresh);

  // runId is a best-effort monotonic label above all *recalled* prior runs. It is NOT a
  // global counter: semantic recall returns top-K, so a missed prior run (or two
  // concurrent agents) can reuse a runId. That's tolerated — each attest() mints a
  // distinct frozen on-chain object regardless, so the label colliding never breaks
  // attestation uniqueness. TODO(cleanup): chain-side counter if multi-agent ever ships.
  const runId = prior.reduce((m, a) => Math.max(m, a.runId), 0) + 1;
  const artifact: Artifact = {
    schema: 'recall.report.v1',
    agent,
    namespace: MEMWAL_NAMESPACE,
    runId,
    createdAtMs: nowMs,
    topic,
    findings: summarized,
    priorRunIds: prior.map((a) => String(a.runId)),
  };

  // Store first, anchor second: the attested hash must match the bytes actually on Walrus.
  const { blobId } = await deps.remember(artifact);
  const tx = buildAttestTx({
    agent,
    namespace: MEMWAL_NAMESPACE,
    runId,
    artifactHashHex: artifactHashHex(artifact),
    blobId,
  });
  const { digest } = await deps.execute(tx);

  return { artifact, blobId, attestationDigest: digest, knownHit, freshCount: fresh.length };
}
