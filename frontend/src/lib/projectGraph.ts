import type { Artifact, RunResult } from './api.ts';

export interface KelpNode {
  id: string; kind: 'run' | 'finding'; runId: number; label: string; fresh: boolean;
  createdAtMs?: number; blobId?: string; digest?: string;
  findingKey?: string; summary?: string; sourceUrl?: string;
}
export interface KelpEdge { source: string; target: string; kind: 'membership' | 'lineage'; }
export interface KelpGraph { nodes: KelpNode[]; edges: KelpEdge[]; }

export function projectGraph(
  artifacts: Artifact[],
  live?: RunResult | null,
  attestations: Record<string, { blobId: string; digest: string }> = {},
): KelpGraph {
  const liveRunId = live?.artifact.runId;
  // keys known from any NON-live artifact — used to decide freshness of live findings.
  const knownKeys = new Set<string>();
  for (const a of artifacts) {
    if (a.runId === liveRunId) continue;
    for (const f of a.findings) knownKeys.add(f.key);
  }

  const runIds = new Set(artifacts.map((a) => a.runId));
  const nodes = new Map<string, KelpNode>();
  const edges: KelpEdge[] = [];

  for (const a of artifacts) {
    const runNode: KelpNode = {
      id: `run:${a.runId}`, kind: 'run', runId: a.runId, label: `Run #${a.runId}`,
      fresh: a.runId === liveRunId, createdAtMs: a.createdAtMs,
    };
    if (a.runId === liveRunId && live) { runNode.blobId = live.blobId; runNode.digest = live.attestationDigest; }
    // backfill historical run nodes from the on-chain attestation index (live result wins).
    const att = attestations[String(a.runId)];
    if (att) {
      if (runNode.blobId === undefined) runNode.blobId = att.blobId;
      if (runNode.digest === undefined) runNode.digest = att.digest;
    }
    nodes.set(runNode.id, runNode);

    for (const f of a.findings) {
      const id = `finding:${f.key}`;
      const isFresh = a.runId === liveRunId && !knownKeys.has(f.key);
      const existing = nodes.get(id);
      if (existing) {
        if (isFresh) existing.fresh = true; // promote if surfaced fresh this run
      } else {
        nodes.set(id, {
          id, kind: 'finding', runId: a.runId, label: f.title, fresh: isFresh,
          findingKey: f.key, summary: f.summary, sourceUrl: f.sourceUrl,
        });
      }
      edges.push({ source: `run:${a.runId}`, target: id, kind: 'membership' });
    }

    for (const pid of a.priorRunIds) {
      const n = Number(pid);
      if (runIds.has(n)) edges.push({ source: `run:${a.runId}`, target: `run:${n}`, kind: 'lineage' });
    }
  }

  return { nodes: [...nodes.values()], edges };
}
