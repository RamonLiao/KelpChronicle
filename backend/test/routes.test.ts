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
    run: async (_t, _a, _n) => { calls.run++; return okResult; },
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
  let runCalls = 0;
  const { d } = deps({ run: async () => { runCalls++; return gate.promise; } });
  const routes = makeRoutes(d);
  const first = routes.runHandler({ topic: 't', agent: AGENT });
  const second = await routes.runHandler({ topic: 't', agent: AGENT }); // first still pending
  assert.equal(second.status, 409);
  assert.equal(runCalls, 1); // second never invoked run (single-flight held)
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
