# Task 10 — `/run` `/memory` `/restore` Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the Task 9 `runAgent` loop and memory recall/restore over HTTP, hardened per the Red Team spec.

**Architecture:** Route logic lives in `routes.ts` as a `makeRoutes(deps)` factory returning transport-agnostic handlers that take plain inputs and return `{status, body}` — no Express `req`/`res` inside, so they unit-test without binding a port. `server.ts` is a thin adapter mapping Express req→input and result→res. Single-flight lock is a closure boolean per factory instance.

**Tech Stack:** TypeScript (ESM, `"type":"module"`), Express 4, `@mysten/sui` 2.19.0 utils, `node:test` + `node:assert`, `tsx`.

## Global Constraints

- Test runner: `cd backend && node --import tsx --test test/<name>.test.ts`. Tests live in `backend/test/`, import source as `../src/<x>.js` (note `.js` ESM suffix on TS imports).
- Spec: `docs/specs/2026-06-21-task10-run-endpoint-design.md`. All four Red Team defenses are required.
- `runAgent` signature (Task 9, `src/run.ts`): `runAgent(topic: string, agent: string, nowMs: number, deps?) => Promise<RunResult>` where `RunResult = { artifact, blobId, attestationDigest, knownHit, freshCount }`.
- Address validation: `normalizeSuiAddress` + `isValidSuiAddress` from `@mysten/sui/utils`. **Empty/`"0"`/`"0x"` normalize to the zero address and pass `isValidSuiAddress` — must be rejected explicitly** (reject empty raw input AND normalized === zero address).
- topic cap: 200 chars after trim.
- Error responses leak no detail: full error to `console.error` server-side, generic message to client.

## File Structure

- `backend/src/routes.ts` (new) — `makeRoutes(deps)` factory; validation, single-flight lock, the three handlers.
- `backend/src/server.ts` (modify) — mount handlers as Express routes via thin adapter.
- `backend/test/routes.test.ts` (new) — handler unit tests with injected fake deps.

---

### Task 1: `routes.ts` factory + handlers (TDD)

**Files:**
- Create: `backend/src/routes.ts`
- Test: `backend/test/routes.test.ts`

**Interfaces:**
- Consumes: `runAgent` / `RunResult` from `./run.js`; `recallArtifacts`, `restoreMemory` from `./memory.js`; `normalizeSuiAddress`, `isValidSuiAddress` from `@mysten/sui/utils`.
- Produces:
  - `export interface RouteDeps { run; recall; restore; now }` (all optional via `Partial`).
  - `export interface RouteResult { status: number; body: unknown }`.
  - `export function makeRoutes(deps?: Partial<RouteDeps>): { runHandler(input:{topic?:unknown;agent?:unknown}): Promise<RouteResult>; memoryHandler(input:{topic?:unknown}): Promise<RouteResult>; restoreHandler(): Promise<RouteResult> }`.

- [ ] **Step 1: Write the failing test**

Create `backend/test/routes.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { makeRoutes, type RouteDeps } from '../src/routes.js';
import type { RunResult } from '../src/run.js';
import type { Artifact } from '../../shared/src/artifact.js';

const AGENT = '0x' + 'a'.repeat(64);
const okResult: RunResult = {
  artifact: { schema: 'recall.report.v1', agent: AGENT, namespace: 'recall', runId: 1, createdAtMs: 0, topic: 't', findings: [], priorRunIds: [] } as Artifact,
  blobId: 'blob-1', attestationDigest: 'DIG', knownHit: 0, freshCount: 0,
};

// A run we can hold open to test the single-flight lock deterministically.
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function deps(over: Partial<RouteDeps> = {}): { d: Partial<RouteDeps>; calls: { run: number } } {
  const calls = { run: 0 };
  const d: Partial<RouteDeps> = {
    run: async (t, a, n) => { calls.run++; return okResult; },
    recall: async () => [okResult.artifact],
    restore: async () => {},
    now: () => 123,
    ...over,
  };
  return { d, calls };
}

test('happy path: valid topic+agent → 200 with RunResult, run called with normalized args', async () => {
  let seen: unknown[] = [];
  const { d } = deps({ run: async (t, a, n) => { seen = [t, a, n]; return okResult; } });
  const r = await makeRoutes(d).runHandler({ topic: '  walrus  ', agent: AGENT });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, okResult);
  assert.deepEqual(seen, ['walrus', AGENT, 123]); // topic trimmed, now injected
});

test('non-padded short address 0x6 is accepted and normalized (regex would wrongly reject)', async () => {
  let sawAgent = '';
  const { d } = deps({ run: async (_t, a) => { sawAgent = a; return okResult; } });
  const r = await makeRoutes(d).runHandler({ topic: 't', agent: '0x6' });
  assert.equal(r.status, 200);
  assert.equal(sawAgent, '0x' + '0'.repeat(63) + '6'); // padded canonical, never bare 0x6
});

test('empty/zero agent → 400, run NOT called (would otherwise attest to 0x0)', async () => {
  for (const agent of ['', '0x', '0', '0x0', '0x' + '0'.repeat(64)]) {
    const { d, calls } = deps();
    const r = await makeRoutes(d).runHandler({ topic: 't', agent });
    assert.equal(r.status, 400, `agent=${JSON.stringify(agent)}`);
    assert.equal(calls.run, 0);
  }
});

test('bad agent (non-hex / over-length) → 400, run NOT called', async () => {
  for (const agent of ['hello', '0xZZ', '0x' + 'a'.repeat(65)]) {
    const { d, calls } = deps();
    const r = await makeRoutes(d).runHandler({ topic: 't', agent });
    assert.equal(r.status, 400, `agent=${JSON.stringify(agent)}`);
    assert.equal(calls.run, 0);
  }
});

test('empty/whitespace topic and over-200-char topic → 400, run NOT called', async () => {
  for (const topic of ['', '   ', 'x'.repeat(201)]) {
    const { d, calls } = deps();
    const r = await makeRoutes(d).runHandler({ topic, agent: AGENT });
    assert.equal(r.status, 400, `topic len=${String(topic).length}`);
    assert.equal(calls.run, 0);
  }
  // boundary: exactly 200 is allowed
  const { d } = deps();
  assert.equal((await makeRoutes(d).runHandler({ topic: 'x'.repeat(200), agent: AGENT })).status, 200);
});

test('single-flight: second concurrent run → 409 while first pending; first still resolves', async () => {
  const gate = deferred<RunResult>();
  const { d, calls } = deps({ run: async () => gate.promise });
  const routes = makeRoutes(d);
  const first = routes.runHandler({ topic: 't', agent: AGENT });
  const second = await routes.runHandler({ topic: 't', agent: AGENT }); // first still pending
  assert.equal(second.status, 409);
  assert.equal(calls.run, 1); // second never invoked run
  gate.resolve(okResult);
  assert.equal((await first).status, 200);
});

test('lock released after throw: a failing run does not wedge the endpoint', async () => {
  let mode: 'throw' | 'ok' = 'throw';
  const { d } = deps({ run: async () => { if (mode === 'throw') throw new Error('boom'); return okResult; } });
  const routes = makeRoutes(d);
  const fail = await routes.runHandler({ topic: 't', agent: AGENT });
  assert.equal(fail.status, 502);
  mode = 'ok';
  assert.equal((await routes.runHandler({ topic: 't', agent: AGENT })).status, 200); // not stuck at 409
});

test('run throws → 502 generic, body leaks no raw error string', async () => {
  const { d } = deps({ run: async () => { throw new Error('relayer https://secret.internal down'); } });
  const r = await makeRoutes(d).runHandler({ topic: 't', agent: AGENT });
  assert.equal(r.status, 502);
  assert.equal(JSON.stringify(r.body).includes('secret.internal'), false);
});

test('/memory returns recall result; throw → 502 generic', async () => {
  const ok = await makeRoutes(deps().d).memoryHandler({ topic: 't' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, [okResult.artifact]);
  const bad = await makeRoutes(deps({ recall: async () => { throw new Error('x'); } }).d).memoryHandler({ topic: 't' });
  assert.equal(bad.status, 502);
});

test('/restore returns ok; throw → 502 generic', async () => {
  assert.deepEqual((await makeRoutes(deps().d).restoreHandler()).body, { ok: true });
  const bad = await makeRoutes(deps({ restore: async () => { throw new Error('x'); } }).d).restoreHandler();
  assert.equal(bad.status, 502);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --import tsx --test test/routes.test.ts`
Expected: FAIL — cannot find module `../src/routes.js`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/routes.ts`:

```ts
// HTTP route handlers for the agent loop, kept transport-agnostic: each handler takes a
// plain input and returns { status, body }, so server.ts can adapt them to Express while
// tests drive them directly with injected fakes (mirrors run.ts RunDeps / memory.ts deps).
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { runAgent, type RunResult } from './run.js';
import { recallArtifacts, restoreMemory } from './memory.js';
import type { Artifact } from '../../shared/src/artifact.js';

export interface RouteDeps {
  run: (topic: string, agent: string, nowMs: number) => Promise<RunResult>;
  recall: (query: string) => Promise<Artifact[]>;
  restore: () => Promise<void>;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --import tsx --test test/routes.test.ts`
Expected: PASS — all tests pass (10 test blocks).

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes.ts backend/test/routes.test.ts
git commit -m "feat(backend): /run /memory /restore route handlers (validated, single-flight)"
```

---

### Task 2: Wire handlers into `server.ts` + smoke

**Files:**
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: `makeRoutes` from `./routes.js`.

- [ ] **Step 1: Add routes to server.ts**

Replace the body of `backend/src/server.ts` (keep existing express/cors/health setup) so it reads:

```ts
import express from 'express';
import cors from 'cors';
import { makeRoutes } from './routes.js';

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors({ origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',') }));

app.get('/health', (_req, res) => res.json({ ok: true }));

const routes = makeRoutes(); // one instance → one shared single-flight lock for the process

app.post('/run', async (req, res) => {
  const { status, body } = await routes.runHandler({ topic: req.body?.topic, agent: req.body?.agent });
  res.status(status).json(body);
});

app.get('/memory', async (req, res) => {
  const { status, body } = await routes.memoryHandler({ topic: req.query?.topic });
  res.status(status).json(body);
});

app.post('/restore', async (_req, res) => {
  const { status, body } = await routes.restoreHandler();
  res.status(status).json(body);
});

const PORT = Number(process.env.PORT ?? 8788);
app.listen(PORT, () => console.log(`Recall backend on :${PORT}`));
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke — validation paths (no signer needed)**

Start server detached (per lessons, NOT run_in_background):
```bash
cd backend && nohup node --import tsx src/server.ts > /tmp/recall-be.log 2>&1 &
sleep 1 && lsof -iTCP:8788 -sTCP:LISTEN
```
Then probe the paths that don't touch the chain/relayer:
```bash
curl -s -XPOST localhost:8788/run -H 'content-type: application/json' -d '{"topic":"","agent":"0x6"}'      # → 400 topic required
curl -s -XPOST localhost:8788/run -H 'content-type: application/json' -d '{"topic":"t","agent":"hello"}'   # → 400 invalid agent address
curl -s -XPOST localhost:8788/run -H 'content-type: application/json' -d '{"topic":"t","agent":""}'        # → 400 invalid agent address (zero-addr guard)
curl -s localhost:8788/health                                                                              # → {"ok":true}
```
Expected: the three `/run` calls return HTTP 400 with the matching `error` message; health returns ok. (A full happy-path `/run` needs `RECALL_SIGNER_KEY` + MemWal account — that is Task 9 Step 3 live e2e, still blocked, out of scope here.)

Kill the server: `kill $(lsof -tiTCP:8788 -sTCP:LISTEN)`

- [ ] **Step 4: Commit**

```bash
git add backend/src/server.ts
git commit -m "feat(backend): mount /run /memory /restore endpoints"
```

---

## Self-Review

**Spec coverage:**
- Red Team #1 (agent validation) → Task 1 Step 3 (`isValidSuiAddress` + zero-addr guard) + tests for empty/zero/non-hex/short.
- Red Team #2 (single-flight / equivocation) → Task 1 lock + concurrent 409 test + lock-release-after-throw test.
- Red Team #3 (error leak) → generic 502 + `console.error`; test asserts body excludes secret string.
- Red Team #4 (topic cap) → 200-char bound + boundary test (200 ok / 201 reject).
- 3 endpoints + handler/transport split → Task 1 (handlers) + Task 2 (Express adapter).
- Finality-latency semantic → documented in spec; no code change needed (inherited from `defaultExecutor.waitForTransaction`).

**Placeholder scan:** none — all steps carry real code/commands.

**Type consistency:** `RouteDeps`/`RouteResult`/`makeRoutes` names identical across Task 1 def, Task 1 test imports, Task 2 import. `RunResult` imported from `./run.js` matches Task 9. `recall` typed `(query:string)=>Promise<Artifact[]>` matches `recallArtifacts`.

## Post-implementation

After both tasks: run the dual-review (`/dual-review`) per dev-rules before marking Task 10 done, then update `tasks/progress.md`.
