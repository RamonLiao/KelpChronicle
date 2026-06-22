import type { Artifact, RunResult } from './api.ts';

export interface KelpNode {
  id: string; kind: 'run' | 'finding'; runId: number; topic: string; label: string; fresh: boolean;
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
  const runTopic = new Map<number, string>();
  for (const a of artifacts) runTopic.set(a.runId, a.topic);
  const runFindingKeys = new Map<number, Set<string>>();
  const nodes = new Map<string, KelpNode>();
  const edges: KelpEdge[] = [];
  // two artifacts sharing a runId (backfill + live) repeat the same run->finding pairs;
  // dedupe so d3 forceLink doesn't double-pull a node and the pulse doesn't draw twice.
  const seenEdges = new Set<string>();
  const addEdge = (e: KelpEdge) => {
    const k = `${e.source}->${e.target}:${e.kind}`;
    if (seenEdges.has(k)) return;
    seenEdges.add(k);
    edges.push(e);
  };

  for (const a of artifacts) {
    const runNode: KelpNode = {
      id: `run:${a.runId}`, kind: 'run', runId: a.runId, topic: a.topic, label: `Run #${a.runId}`,
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
      (runFindingKeys.get(a.runId) ?? runFindingKeys.set(a.runId, new Set()).get(a.runId)!).add(f.key);
      // scope finding node identity to its topic — a key shared across two watched topics
      // must NOT collapse to one node, or it bridges two plants into the wrong seabed band.
      const id = `finding:${a.topic}:${f.key}`;
      const isFresh = a.runId === liveRunId && !knownKeys.has(f.key);
      const existing = nodes.get(id);
      if (existing) {
        if (isFresh) existing.fresh = true; // promote if surfaced fresh this run
      } else {
        nodes.set(id, {
          id, kind: 'finding', runId: a.runId, topic: a.topic, label: f.title, fresh: isFresh,
          findingKey: f.key, summary: f.summary, sourceUrl: f.sourceUrl,
        });
      }
      addEdge({ source: `run:${a.runId}`, target: id, kind: 'membership' });
    }

    for (const pid of a.priorRunIds) {
      const n = Number(pid);
      if (runIds.has(n) && runTopic.get(n) === a.topic) {
        addEdge({ source: `run:${a.runId}`, target: `run:${n}`, kind: 'lineage' });
      }
    }
  }

  // Per topic (runs in runId order), keep a run only if it introduces a finding key not seen
  // in an earlier run of the same topic — plus always keep each topic's latest run as the head.
  const runNodes = [...nodes.values()].filter((n) => n.kind === 'run');
  const runsByTopic = new Map<string, KelpNode[]>();
  for (const r of runNodes) (runsByTopic.get(r.topic) ?? runsByTopic.set(r.topic, []).get(r.topic)!).push(r);

  const keepRun = new Set<number>();
  for (const [, runs] of runsByTopic) {
    runs.sort((x, y) => x.runId - y.runId);
    const latest = runs[runs.length - 1].runId;
    const seen = new Set<string>();
    for (const r of runs) {
      const keys = runFindingKeys.get(r.runId) ?? new Set<string>();
      let introducesNew = false;
      for (const k of keys) if (!seen.has(k)) introducesNew = true;
      for (const k of keys) seen.add(k);
      if (introducesNew || r.runId === latest) keepRun.add(r.runId);
    }
  }

  const keptNodes = [...nodes.values()].filter((n) => n.kind === 'finding' || keepRun.has(n.runId));
  const keptIds = new Set(keptNodes.map((n) => n.id));
  const keptEdges = edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target));
  return { nodes: keptNodes, edges: keptEdges };
}
