export interface Finding { key: string; title: string; summary: string; sourceUrl: string }
export interface Artifact {
  schema: 'recall.report.v1';
  agent: string; namespace: string; runId: number; createdAtMs: number;
  topic: string; findings: Finding[]; priorRunIds: string[];
}
export interface RunResult {
  artifact: Artifact; blobId: string; attestationDigest: string;
  knownHit: number; freshCount: number;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ApiError'; }
}

async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as any)?.error ?? `HTTP ${res.status}`);
  return body as T;
}

export function makeApi(base: string, fetchImpl: typeof fetch = fetch) {
  return {
    run: (topic: string, agent: string) =>
      fetchImpl(`${base}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic, agent }),
      }).then((r) => unwrap<RunResult>(r)),
    getMemory: (topic: string) =>
      fetchImpl(`${base}/memory?topic=${encodeURIComponent(topic)}`).then((r) => unwrap<Artifact[]>(r)),
    restore: () =>
      fetchImpl(`${base}/restore`, { method: 'POST' }).then((r) => unwrap<{ ok: true }>(r)),
  };
}

const BASE = (import.meta as any).env?.VITE_BACKEND ?? 'http://localhost:8788';
export const api = makeApi(BASE);
