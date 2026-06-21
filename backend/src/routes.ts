// HTTP route handlers for the agent loop, kept transport-agnostic: each handler takes a
// plain input and returns { status, body }, so server.ts can adapt them to Express while
// tests drive them directly with injected fakes (mirrors run.ts RunDeps / memory.ts deps).
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { runAgent, type RunResult } from './run.js';
import { recallArtifacts, restoreMemory } from './memory.js';
import { makeAttestIndex } from './attestIndex.js';
import type { Artifact } from '../../shared/src/artifact.js';

export interface RouteDeps {
  run: (topic: string, agent: string, nowMs: number) => Promise<RunResult>;
  recall: (query: string) => Promise<Artifact[]>;
  restore: () => Promise<void>;
  attestIndex: (agent: string, namespace: string) => Promise<Record<string, { blobId: string; digest: string }>>;
  now: () => number;
}

export interface RouteResult {
  status: number;
  body: unknown;
}

const TOPIC_MAX = 200;
const ZERO_ADDRESS = normalizeSuiAddress('0x0');

export function makeRoutes(deps: Partial<RouteDeps> = {}) {
  const run = deps.run ?? runAgent;
  const recall = deps.recall ?? recallArtifacts;
  const restore = deps.restore ?? restoreMemory;
  const attestIndex = deps.attestIndex ?? makeAttestIndex();
  const now = deps.now ?? (() => Date.now());
  let inFlight = false; // single-flight: serializes the one signer (avoids gas-coin equivocation)

  return {
    async runHandler(input: { topic?: unknown; agent?: unknown }): Promise<RouteResult> {
      const topic = String(input?.topic ?? '').trim();
      if (!topic) return { status: 400, body: { error: 'topic required' } };
      if (topic.length > TOPIC_MAX) return { status: 400, body: { error: 'topic too long' } };

      const rawAgent = String(input?.agent ?? '').trim();
      if (!rawAgent) return { status: 400, body: { error: 'invalid agent address' } };
      const agent = normalizeSuiAddress(rawAgent);
      // isValidSuiAddress accepts the all-zero address, which "" / "0" / "0x" collapse to —
      // reject it so an empty agent can never attest to 0x0.
      if (!isValidSuiAddress(agent) || agent === ZERO_ADDRESS) {
        return { status: 400, body: { error: 'invalid agent address' } };
      }

      if (inFlight) return { status: 409, body: { error: 'a run is already in progress' } };
      inFlight = true;
      try {
        const result = await run(topic, agent, now());
        return { status: 200, body: result };
      } catch (e) {
        console.error('[/run] agent failed:', e);
        return { status: 502, body: { error: 'memory/agent service error' } };
      } finally {
        inFlight = false;
      }
    },

    async memoryHandler(input: { topic?: unknown }): Promise<RouteResult> {
      try {
        return { status: 200, body: await recall(String(input?.topic ?? '')) };
      } catch (e) {
        console.error('[/memory] failed:', e);
        return { status: 502, body: { error: 'memory service error' } };
      }
    },

    async attestationsHandler(input: { agent?: unknown; namespace?: unknown }): Promise<RouteResult> {
      const agent = normalizeSuiAddress(String(input?.agent ?? '').trim());
      if (!isValidSuiAddress(agent) || agent === ZERO_ADDRESS) {
        return { status: 400, body: { error: 'invalid agent address' } };
      }
      try {
        return { status: 200, body: await attestIndex(agent, String(input?.namespace ?? '')) };
      } catch (e) {
        console.error('[/attestations] failed:', e);
        return { status: 502, body: { error: 'attestation index error' } };
      }
    },

    async restoreHandler(): Promise<RouteResult> {
      try {
        await restore();
        return { status: 200, body: { ok: true } };
      } catch (e) {
        console.error('[/restore] failed:', e);
        return { status: 502, body: { error: 'restore failed' } };
      }
    },
  };
}
