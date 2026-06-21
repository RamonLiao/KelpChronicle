import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApi, ApiError } from '../src/lib/api.ts';

function fakeFetch(status: number, body: unknown) {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
}

test('run posts topic+agent and returns RunResult', async () => {
  let captured: any;
  const fetch = (async (url: string, init: any) => { captured = { url, init }; return { ok: true, status: 200, json: async () => ({ artifact: { runId: 6 }, blobId: 'b', attestationDigest: 'd', knownHit: 5, freshCount: 3 }) }; }) as any;
  const api = makeApi('http://x', fetch);
  const r = await api.run('Walrus', '0x6');
  assert.equal(captured.url, 'http://x/run');
  assert.equal(captured.init.method, 'POST');
  assert.deepEqual(JSON.parse(captured.init.body), { topic: 'Walrus', agent: '0x6' });
  assert.equal(r.freshCount, 3);
});

test('non-2xx throws ApiError with status (409 single-flight)', async () => {
  const api = makeApi('http://x', fakeFetch(409, { error: 'a run is already in progress' }) as any);
  await assert.rejects(() => api.run('t', '0x6'), (e: ApiError) => e instanceof ApiError && e.status === 409);
});

test('getMemory GETs encoded topic and returns array', async () => {
  let captured: any;
  const fetch = (async (url: string) => { captured = url; return { ok: true, status: 200, json: async () => [] }; }) as any;
  const api = makeApi('http://x', fetch);
  const r = await api.getMemory('a b&c');
  assert.equal(captured, 'http://x/memory?topic=a%20b%26c');
  assert.deepEqual(r, []);
});

test('502 on memory throws ApiError', async () => {
  const api = makeApi('http://x', fakeFetch(502, { error: 'memory service error' }) as any);
  await assert.rejects(() => api.getMemory('t'), (e: ApiError) => e.status === 502);
});
