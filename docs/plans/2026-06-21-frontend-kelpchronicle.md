# KelpChronicle Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the KelpChronicle dApp frontend — a full-bleed procedural kelp-forest canvas with draggable HUD windows, wired to the existing backend `/run` `/memory` `/restore` endpoints, demonstrating Walrus-persisted agent memory.

**Architecture:** Single-page React app. The graph is a **pure projection** of the server's `/memory` response (never persisted client-side) so cross-device restore works for free. A 2D `<canvas>` renders a `d3-force` graph styled as procedural seaweed (run = stem, finding = bud). Control surfaces are independent draggable/resizable/collapsible glass windows over the canvas.

**Tech Stack:** Vite + React 19 + `@mysten/dapp-kit-react` 2.1.3 (+ `/ui` for `ConnectButton`) + `@mysten/dapp-kit-core` 1.6.1 + `@mysten/sui` `SuiGrpcClient` (testnet) + `@tanstack/react-query` 5 + `d3-force` + `d3-quadtree`. Tests: `node --import tsx --test` (mirrors backend/shared).

## Global Constraints

- **Golden rule:** the graph state is ALWAYS a pure projection of `/memory`. NEVER persist run/finding data to localStorage. localStorage holds ONLY UI prefs (key `recall_panels`). (Spec §1).
- **Visual language (spec §1.5) — locked:** Display font **Playfair Display**; data/ledger font **Spline Sans Mono**. Palette: `--abyss:#020B0E --abyss2:#071E22 --kelp:#5C8F74 --kelp-lit:#7FB894 --herb:#9AB2A2 --amber:#EBB352 --cyan:#4DE5F7`.
- **Glow economy:** ONLY `Stored on Walrus` (amber) and `Verified on-chain` / fresh-delta node (cyan) glow. Everything else matte. On canvas: `ctx.shadowBlur = 10` only when drawing the fresh node; all others `shadowBlur = 0`.
- **Determinism:** routing/validation/projection in code, never the model. `projectGraph` is a pure function.
- **Backend base URL:** `import.meta.env.VITE_BACKEND ?? 'http://localhost:8788'`.
- **Network:** testnet. gRPC baseUrl `https://fullnode.testnet.sui.io` (mirrors `backend/src/attest.ts`).
- **agent = connected wallet address**; on-chain signer is the backend `RECALL_SIGNER_KEY`, NOT the wallet (spec §4). Not trustless — honesty-badge wording only.
- **Data gap (spec §2, decision 2026-06-21):** `/memory` returns `Artifact[]` with NO `blobId`/`digest`. Only this session's `/run` `RunResult` carries them. Historical/recalled nodes render matte "Anchored" with a reserved (empty) verifiable slot until Task 13–14 backfill chain data.
- All Sui reads via `SuiGrpcClient` (JSON-RPC is deprecated — lesson 2026-06-11).
- Run backend commands prefixed with `cd <backend-abs-path> &&` (Bash cwd resets each call).

---

## File Structure

```
frontend/
  package.json                      # +deps: d3-force, d3-quadtree, qrcode; +devDeps: tsx, @types/d3-force; +test script
  index.html                        # +Google Fonts (Playfair Display, Spline Sans Mono)
  src/
    main.tsx                        # MODIFY: wrap App in DAppKitProvider + QueryClientProvider
    App.tsx                         # REWRITE: compose canvas + HUDs + empty/error states
    index.css                       # REWRITE: design tokens (palette/fonts) + reset
    lib/
      dapp-kit.ts                   # createDAppKit (grpc testnet, storageKey recall_dappkit)
      api.ts                        # run/getMemory/restore HTTP client + response types
      projectGraph.ts               # PURE: Artifact[] (+live RunResult) -> {nodes, edges}
    hooks/
      useMemory.ts                  # react-query wrapper over api.getMemory
    components/
      KelpCanvas.tsx                # d3-force + procedural seaweed canvas + animation loop
      hud/
        Panel.tsx                   # draggable/resizable/collapsible glass window shell
        RunConsole.tsx              # topic input + Run (wallet=agent, 409 single-flight)
        Inspector.tsx               # node detail + trust badges (glow economy)
        MemoryRestore.tsx           # recall list + Clear local view + Restore + QR
  test/
    projectGraph.test.ts            # pure-fn unit tests
    api.test.ts                     # fetch-mocked client tests
backend/                            # Task 13 only
  src/attestIndex.ts                # query RunAttestation objects -> runId->{blobId,digest}
  src/routes.ts                     # MODIFY: + attestationsHandler
  src/server.ts                     # MODIFY: mount GET /attestations
  test/attestIndex.test.ts
```

---

## Task 1: Design tokens, fonts, base reset

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/index.css` (rewrite)

**Interfaces:**
- Produces: CSS custom properties on `:root` (`--abyss` … `--cyan`, `--font-display`, `--font-mono`) consumed by every component.

- [ ] **Step 1: Add fonts to index.html**

In `<head>` of `frontend/index.html`, before the closing tag:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Spline+Sans+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
```

Also set `<title>KelpChronicle</title>`.

- [ ] **Step 2: Rewrite index.css with tokens + reset**

Replace the entire contents of `frontend/src/index.css`:

```css
:root {
  --abyss: #020B0E;
  --abyss2: #071E22;
  --kelp: #5C8F74;
  --kelp-lit: #7FB894;
  --herb: #9AB2A2;
  --amber: #EBB352;
  --cyan: #4DE5F7;
  --ink: #DFE9E4;
  --border: rgba(154, 178, 162, 0.16);
  --font-display: 'Playfair Display', Georgia, serif;
  --font-mono: 'Spline Sans Mono', ui-monospace, monospace;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body, #root { margin: 0; height: 100%; }
body {
  background: var(--abyss);
  color: var(--ink);
  font-family: var(--font-display);
  overflow: hidden; /* canvas owns the viewport */
}
.mono { font-family: var(--font-mono); }
.label {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--herb);
  opacity: 0.75;
}
```

- [ ] **Step 3: Verify it boots**

Run: `cd frontend && npx tsc --noEmit && npm run dev`
Expected: dev server starts, page background is abyssal black, no console errors. (App.tsx still default scaffold — replaced in Task 12.)

- [ ] **Step 4: Commit**

```bash
cd frontend && git add index.html src/index.css && git commit -m "feat(fe): design tokens, fonts, base reset (KelpChronicle visual language)"
```

---

## Task 2: API client (`lib/api.ts`)

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/test/api.test.ts`
- Modify: `frontend/package.json` (add `tsx` devDep + `test` script)

**Interfaces:**
- Produces:
  - `type Finding = { key: string; title: string; summary: string; sourceUrl: string }`
  - `type Artifact = { schema: 'recall.report.v1'; agent: string; namespace: string; runId: number; createdAtMs: number; topic: string; findings: Finding[]; priorRunIds: string[] }`
  - `type RunResult = { artifact: Artifact; blobId: string; attestationDigest: string; knownHit: number; freshCount: number }`
  - `api.run(topic: string, agent: string): Promise<RunResult>` — throws `ApiError` with `.status` on non-2xx
  - `api.getMemory(topic: string): Promise<Artifact[]>`
  - `api.restore(): Promise<{ ok: true }>`
  - `class ApiError extends Error { status: number }`

- [ ] **Step 1: Add tsx + test script to package.json**

In `frontend/package.json`, add to `devDependencies`: `"tsx": "^4.19.2"`. Add to `scripts`: `"test": "node --import tsx --test test/*.test.ts"`. Then run `cd frontend && npm install`.

- [ ] **Step 2: Write the failing test**

Create `frontend/test/api.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot find module `../src/lib/api.ts`.

- [ ] **Step 4: Implement `lib/api.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
cd frontend && git add package.json package-lock.json src/lib/api.ts test/api.test.ts && git commit -m "feat(fe): typed HTTP api client (run/getMemory/restore) + tests"
```

---

## Task 3: Graph projection (`lib/projectGraph.ts`) — the core pure function

**Files:**
- Create: `frontend/src/lib/projectGraph.ts`
- Create: `frontend/test/projectGraph.test.ts`

**Interfaces:**
- Consumes: `Artifact`, `RunResult` from `lib/api.ts`.
- Produces:
  - `type KelpNode = { id: string; kind: 'run' | 'finding'; runId: number; label: string; fresh: boolean; createdAtMs?: number; blobId?: string; digest?: string; findingKey?: string; summary?: string; sourceUrl?: string }`
  - `type KelpEdge = { source: string; target: string; kind: 'membership' | 'lineage' }`
  - `type KelpGraph = { nodes: KelpNode[]; edges: KelpEdge[] }`
  - `projectGraph(artifacts: Artifact[], live?: RunResult | null): KelpGraph`

**Rules (encode the WHY in tests):**
- Each artifact → one `run` node `id = "run:<runId>"`. Each finding → one `finding` node `id = "finding:<key>"`, deduped across runs (same key reused once — shared knowledge isn't duplicated).
- Membership edge run→finding for every (run, finding). Lineage edge run→prior run for each `priorRunIds` entry that exists in the set (dangling prior ids are skipped, not errors — recall returns top-K, lesson run.ts).
- `fresh`: a finding is fresh iff it belongs to `live.artifact` AND its key is NOT present in any non-live artifact. The live run node is `fresh: true`. Without `live`, nothing is fresh.
- `blobId`/`digest`: set ONLY on the live run node (from `RunResult`); historical run nodes leave them `undefined` (data gap).

- [ ] **Step 1: Write the failing test**

Create `frontend/test/projectGraph.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectGraph } from '../src/lib/projectGraph.ts';
import type { Artifact, RunResult } from '../src/lib/api.ts';

const mk = (runId: number, keys: string[], priors: string[] = []): Artifact => ({
  schema: 'recall.report.v1', agent: '0x6', namespace: 'ns', runId, createdAtMs: runId * 1000,
  topic: 'Walrus', priorRunIds: priors,
  findings: keys.map((k) => ({ key: k, title: `T${k}`, summary: `S${k}`, sourceUrl: `https://x/${k}` })),
});

test('empty input -> empty graph', () => {
  assert.deepEqual(projectGraph([]), { nodes: [], edges: [] });
});

test('one run with two findings -> 1 run node + 2 finding nodes + 2 membership edges', () => {
  const g = projectGraph([mk(1, ['a', 'b'])]);
  assert.equal(g.nodes.filter((n) => n.kind === 'run').length, 1);
  assert.equal(g.nodes.filter((n) => n.kind === 'finding').length, 2);
  assert.equal(g.edges.filter((e) => e.kind === 'membership').length, 2);
});

test('duplicate finding key across runs is reused (one node), both runs link to it', () => {
  const g = projectGraph([mk(1, ['a']), mk(2, ['a', 'b'])]);
  assert.equal(g.nodes.filter((n) => n.id === 'finding:a').length, 1);
  assert.equal(g.edges.filter((e) => e.target === 'finding:a' && e.kind === 'membership').length, 2);
});

test('priorRunIds produce lineage edges; dangling priors skipped', () => {
  const g = projectGraph([mk(1, ['a']), mk(2, ['b'], ['1', '99'])]);
  const lineage = g.edges.filter((e) => e.kind === 'lineage');
  assert.equal(lineage.length, 1);
  assert.deepEqual(lineage[0], { source: 'run:2', target: 'run:1', kind: 'lineage' });
});

test('fresh: live findings whose key is new are fresh; live run node is fresh', () => {
  const prior = mk(1, ['a']);
  const liveArtifact = mk(2, ['a', 'c']); // a is known, c is new
  const live: RunResult = { artifact: liveArtifact, blobId: 'blob9', attestationDigest: '0xdig', knownHit: 1, freshCount: 1 };
  const g = projectGraph([prior, liveArtifact], live);
  assert.equal(g.nodes.find((n) => n.id === 'finding:c')?.fresh, true);
  assert.equal(g.nodes.find((n) => n.id === 'finding:a')?.fresh, false);
  const runNode = g.nodes.find((n) => n.id === 'run:2');
  assert.equal(runNode?.fresh, true);
  assert.equal(runNode?.blobId, 'blob9');
  assert.equal(runNode?.digest, '0xdig');
});

test('without live, no node is fresh and no blobId/digest set', () => {
  const g = projectGraph([mk(1, ['a'])]);
  assert.ok(g.nodes.every((n) => n.fresh === false));
  assert.ok(g.nodes.every((n) => n.blobId === undefined && n.digest === undefined));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot find `../src/lib/projectGraph.ts`.

- [ ] **Step 3: Implement `lib/projectGraph.ts`**

```ts
import type { Artifact, RunResult } from './api.ts';

export interface KelpNode {
  id: string; kind: 'run' | 'finding'; runId: number; label: string; fresh: boolean;
  createdAtMs?: number; blobId?: string; digest?: string;
  findingKey?: string; summary?: string; sourceUrl?: string;
}
export interface KelpEdge { source: string; target: string; kind: 'membership' | 'lineage'; }
export interface KelpGraph { nodes: KelpNode[]; edges: KelpEdge[]; }

export function projectGraph(artifacts: Artifact[], live?: RunResult | null): KelpGraph {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS (all projectGraph + api tests green).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/lib/projectGraph.ts test/projectGraph.test.ts && git commit -m "feat(fe): pure projectGraph (Artifact[]+live -> kelp nodes/edges) + tests"
```

---

## Task 4: dApp Kit config + providers

**Files:**
- Create: `frontend/src/lib/dapp-kit.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/package.json` (deps: `d3-force`, `d3-quadtree`, `qrcode`; devDeps: `@types/d3-force`, `@types/d3-quadtree`, `@types/qrcode`)

**Interfaces:**
- Produces: `dappKit` (a `DAppKit` instance); the grpc client is reachable in components via `useCurrentClient()` from `@mysten/dapp-kit-react`.

- [ ] **Step 1: Install deps**

Run: `cd frontend && npm install d3-force d3-quadtree qrcode && npm install -D @types/d3-force @types/d3-quadtree @types/qrcode`

- [ ] **Step 2: Create `lib/dapp-kit.ts`**

API verified against installed `@mysten/dapp-kit-core` 1.6.1 (`createDAppKit({ networks, createClient, defaultNetwork, autoConnect, storageKey })`) and `@mysten/sui` `SuiGrpcClient({ network, baseUrl })`.

```ts
import { createDAppKit } from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';

const GRPC_URL: Record<string, string> = {
  testnet: 'https://fullnode.testnet.sui.io',
  mainnet: 'https://fullnode.mainnet.sui.io',
};

export const dappKit = createDAppKit({
  networks: ['testnet'] as const,
  defaultNetwork: 'testnet',
  createClient: (network) => new SuiGrpcClient({ network, baseUrl: GRPC_URL[network] ?? GRPC_URL.testnet }),
  autoConnect: true,
  storageKey: 'recall_dappkit',
});
```

- [ ] **Step 3: Wire providers in `main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DAppKitProvider } from '@mysten/dapp-kit-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dappKit } from './lib/dapp-kit.ts';
import App from './App.tsx';
import './index.css';

// react-query throttling (lesson 2026-06-07 / 429): high staleTime, no focus refetch, bounded retry.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DAppKitProvider dAppKit={dappKit}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </DAppKitProvider>
  </StrictMode>,
);
```

> NOTE for implementer: confirm the `DAppKitProvider` prop name against the installed types — `node -e "import('@mysten/dapp-kit-react').then(m=>console.log(Object.getOwnPropertyNames(m)))"` then check `DAppKitProvider`'s props in `node_modules/@mysten/dapp-kit-react/dist/index.d.mts` (it accepts the instance from `createDAppKit`; adjust prop name if it is `instance`/`dappKit` rather than `dAppKit`).

- [ ] **Step 4: Temporary smoke App + verify wallet connects**

Temporarily set `App.tsx` to:

```tsx
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
export default function App() { return <div style={{ padding: 24 }}><ConnectButton /></div>; }
```

Run: `cd frontend && npx tsc --noEmit && npm run dev`
Expected: page shows a Connect button; clicking opens the wallet modal; connecting a testnet wallet succeeds. (App.tsx fully built in Task 12.)

- [ ] **Step 5: Commit**

```bash
cd frontend && git add package.json package-lock.json src/lib/dapp-kit.ts src/main.tsx src/App.tsx && git commit -m "feat(fe): dapp-kit grpc testnet config + providers (wallet connects)"
```

---

## Task 5: Memory hook (`hooks/useMemory.ts`)

**Files:**
- Create: `frontend/src/hooks/useMemory.ts`

**Interfaces:**
- Consumes: `api.getMemory`, `Artifact`.
- Produces: `useMemory(topic: string)` → react-query result `{ data: Artifact[] | undefined, isLoading, isError, refetch }`. Query key `['memory', topic]`. Disabled when `topic` is empty.

- [ ] **Step 1: Implement**

```ts
import { useQuery } from '@tanstack/react-query';
import { api, type Artifact } from '../lib/api.ts';

export function useMemory(topic: string) {
  return useQuery<Artifact[]>({
    queryKey: ['memory', topic],
    queryFn: () => api.getMemory(topic),
    enabled: topic.trim().length > 0,
  });
}
```

- [ ] **Step 2: Verify types**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/hooks/useMemory.ts && git commit -m "feat(fe): useMemory react-query hook (key ['memory',topic])"
```

---

## Task 6: Panel shell (draggable / resizable / collapsible)

**Files:**
- Create: `frontend/src/components/hud/Panel.tsx`

**Interfaces:**
- Produces: `<Panel id title defaultRect collapsible children />` where `id: string` (localStorage key suffix), `defaultRect: { x: number; y: number; w: number; h: number }`. Persists `{x,y,w,h,collapsed}` to `localStorage['recall_panels']` keyed by `id`. ONLY UI prefs — never memory data (Global Constraint).

- [ ] **Step 1: Implement Panel.tsx**

Glass window with a title bar (drag handle), collapse button, and a bottom-right resize handle. Pointer events drive drag/resize; state persisted per `id`.

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';

type Rect = { x: number; y: number; w: number; h: number };
type Stored = Rect & { collapsed: boolean };

function loadAll(): Record<string, Stored> {
  try { return JSON.parse(localStorage.getItem('recall_panels') ?? '{}'); } catch { return {}; }
}
function saveOne(id: string, s: Stored) {
  const all = loadAll(); all[id] = s; localStorage.setItem('recall_panels', JSON.stringify(all));
}

export function Panel({ id, title, defaultRect, children }: {
  id: string; title: string; defaultRect: Rect; children: React.ReactNode;
}) {
  const init = loadAll()[id];
  const [rect, setRect] = useState<Rect>(init ? { x: init.x, y: init.y, w: init.w, h: init.h } : defaultRect);
  const [collapsed, setCollapsed] = useState<boolean>(init?.collapsed ?? false);
  const drag = useRef<{ mode: 'move' | 'resize'; px: number; py: number; r: Rect } | null>(null);

  useEffect(() => { saveOne(id, { ...rect, collapsed }); }, [id, rect, collapsed]);

  const onDown = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { mode, px: e.clientX, py: e.clientY, r: { ...rect } };
  };
  const onMove = useCallback((e: PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (d.mode === 'move') setRect({ ...d.r, x: d.r.x + dx, y: d.r.y + dy });
    else setRect({ ...d.r, w: Math.max(180, d.r.w + dx), h: Math.max(80, d.r.h + dy) });
  }, []);
  const onUp = useCallback(() => { drag.current = null; }, []);
  useEffect(() => {
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [onMove, onUp]);

  return (
    <div style={{
      position: 'absolute', left: rect.x, top: rect.y, width: rect.w,
      height: collapsed ? undefined : rect.h, background: 'var(--abyss2)',
      border: '1px solid var(--border)', borderRadius: 10, backdropFilter: 'blur(3px)',
      boxShadow: '0 8px 30px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div onPointerDown={onDown('move')} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '7px 10px', cursor: 'move', borderBottom: '1px solid var(--border)', userSelect: 'none',
      }}>
        <span className="label">{title}</span>
        <button onClick={() => setCollapsed((c) => !c)} style={{
          background: 'none', border: 'none', color: 'var(--herb)', cursor: 'pointer', fontSize: 12,
        }}>{collapsed ? '▢' : '—'}</button>
      </div>
      {!collapsed && <div style={{ padding: 12, overflow: 'auto', flex: 1 }}>{children}</div>}
      {!collapsed && <div onPointerDown={onDown('resize')} style={{
        position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, cursor: 'nwse-resize',
        background: 'linear-gradient(135deg, transparent 50%, var(--border) 50%)',
      }} />}
    </div>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/hud/Panel.tsx && git commit -m "feat(fe): draggable/resizable/collapsible glass Panel (persists UI prefs only)"
```

---

## Task 7: KelpCanvas — d3-force + procedural seaweed (static render)

**Files:**
- Create: `frontend/src/components/KelpCanvas.tsx`

**Interfaces:**
- Consumes: `KelpGraph` from `projectGraph.ts`.
- Produces: `<KelpCanvas graph onNodeClick />` where `onNodeClick: (node: KelpNode) => void`. Renders the graph on a full-viewport `<canvas>`; exposes node hit-testing for hover/click.

This task delivers the STATIC procedural render (force layout + bezier stems + leaf fronds + bud nodes + glow economy). Animation is Task 8. Not unit-tested (visual) — verify manually + monkey test.

- [ ] **Step 1: Implement the force layout + render loop skeleton**

Full implementation (data IS the kelp — spec §3). Key points: `forceSimulation` with link/charge/center forces; run nodes pinned lower (seabed, higher y) via `forceY`; render stems as quadratic beziers from run→finding, fronds as short parametric leaves along each stem; `ctx.shadowBlur = 10` ONLY for fresh nodes.

```tsx
import { useEffect, useRef } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceX, forceY, type Simulation } from 'd3-force';
import type { KelpGraph, KelpNode } from '../lib/projectGraph.ts';

type SimNode = KelpNode & { x: number; y: number; vx?: number; vy?: number; fy?: number };
type SimLink = { source: SimNode; target: SimNode; kind: string };

const COL = { kelp: '#5C8F74', kelpLit: '#7FB894', cyan: '#4DE5F7', herb: '#9AB2A2' };

export function KelpCanvas({ graph, onNodeClick }: { graph: KelpGraph; onNodeClick: (n: KelpNode) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const hoverRef = useRef<SimNode | null>(null);

  // (re)build simulation when graph identity changes
  useEffect(() => {
    const canvas = canvasRef.current!; const dpr = window.devicePixelRatio || 1;
    const resize = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; };
    resize(); window.addEventListener('resize', resize);

    const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n, x: innerWidth / 2 + Math.random() * 40, y: innerHeight / 2 }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = graph.edges
      .map((e) => ({ source: byId.get(e.source)!, target: byId.get(e.target)!, kind: e.kind }))
      .filter((l) => l.source && l.target);
    nodes.filter((n) => n.kind === 'run').forEach((n) => { n.fy = innerHeight - 80 - n.runId * 6; }); // seabed anchoring
    nodesRef.current = nodes;

    const sim = forceSimulation<SimNode, SimLink>(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(70).strength(0.6))
      .force('charge', forceManyBody().strength(-120))
      .force('x', forceX(innerWidth / 2).strength(0.03))
      .force('y', forceY((d: any) => (d.kind === 'finding' ? innerHeight * 0.35 : innerHeight - 80)).strength(0.05));
    simRef.current = sim;

    const ctx = canvas.getContext('2d')!;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      // edges = curved tendrils
      ctx.lineWidth = 1.4;
      for (const l of links) {
        const mx = (l.source.x + l.target.x) / 2, my = (l.source.y + l.target.y) / 2 - 24;
        ctx.beginPath(); ctx.moveTo(l.source.x, l.source.y);
        ctx.quadraticCurveTo(mx, my, l.target.x, l.target.y);
        ctx.strokeStyle = l.kind === 'lineage' ? 'rgba(127,184,148,0.35)' : 'rgba(92,143,116,0.45)';
        ctx.stroke();
      }
      // nodes
      for (const n of nodes) {
        ctx.beginPath();
        const r = n.kind === 'run' ? 7 : 5;
        ctx.arc(n.x, n.y, n === hoverRef.current ? r + 2 : r, 0, Math.PI * 2);
        if (n.fresh) { ctx.shadowBlur = 10; ctx.shadowColor = COL.cyan; ctx.fillStyle = COL.cyan; }
        else { ctx.shadowBlur = 0; ctx.fillStyle = n.kind === 'run' ? COL.kelpLit : COL.kelp; }
        ctx.fill(); ctx.shadowBlur = 0;
      }
    };
    sim.on('tick', draw);

    const pick = (mx: number, my: number) =>
      nodes.find((n) => Math.hypot(n.x - mx, n.y - my) < 10) ?? null;
    const onClick = (e: MouseEvent) => { const n = pick(e.clientX, e.clientY); if (n) onNodeClick(n); };
    const onHover = (e: MouseEvent) => { hoverRef.current = pick(e.clientX, e.clientY); };
    canvas.addEventListener('click', onClick); canvas.addEventListener('mousemove', onHover);

    return () => {
      sim.stop(); window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', onClick); canvas.removeEventListener('mousemove', onHover);
    };
  }, [graph, onNodeClick]);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, display: 'block' }} />;
}
```

- [ ] **Step 2: Verify render manually**

Temporarily render `<KelpCanvas graph={projectGraph(SAMPLE)} onNodeClick={console.log} />` in App.tsx with a hand-written `SAMPLE: Artifact[]` of 2 runs / 5 findings.
Run: `cd frontend && npm run dev`
Expected: kelp nodes settle into a force layout anchored toward the bottom (seabed); run nodes lower, findings upper; curved tendrils connect them; clicking a node logs it; hovering enlarges it. No fresh glow yet (no live result).

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/KelpCanvas.tsx && git commit -m "feat(fe): KelpCanvas d3-force procedural seaweed render + hit-testing"
```

---

## Task 8: Canvas animation (sway, mouse field, budding, retrieval pulse, marine snow)

**Files:**
- Modify: `frontend/src/components/KelpCanvas.tsx`

**Interfaces:**
- Consumes: same `KelpGraph`; add optional prop `pulseToRunId?: number | null` (triggers a retrieval pulse along that run's stems).
- Produces: continuous `requestAnimationFrame` loop layering the spec §3 animations on the Task 7 render.

Implement the exact formulas from spec §3:
- **Fluid current sway:** offset bezier control points by `Math.sin(time * 0.0012 + depthPhase) * amplitude`; shallower (finding) nodes lag root phase.
- **Mouse sway field:** for control points within 120px of cursor, add `(1 - dist/120) * 0.15 * maxOffset * Math.sin(time)`; cursor stays default (no particle FX).
- **Budding:** new fresh buds scale `0→1` with `cubic-bezier(0.34,1.56,0.64,1)` over ~600ms; tendril grows via dashoffset.
- **Retrieval pulse:** a glowing dot travels the stem bezier (param `t: 0→1`) from seabed run to target when `pulseToRunId` is set.
- **Marine snow:** ~40 low-opacity (0.05–0.1) particles drifting upward, wrapping at top, behind the kelp.

- [ ] **Step 1: Replace the `sim.on('tick', draw)` static draw with a rAF animation loop**

Convert `draw` into a time-parameterized `render(now)` invoked by `requestAnimationFrame`; keep the force sim ticking but drive painting from rAF so sway/snow animate even at rest. Add: a `time` accumulator; mouse position ref updated in `onHover`; a `particles` array for marine snow seeded once; `pulseToRunId` handling. Apply the four formulas above to control-point offsets and bud scale.

(Implementer: this is a visual extension of Task 7's `draw`. The exact code is mechanical given the formulas; keep the glow economy — only fresh buds get `shadowBlur`. Marine snow drawn FIRST, behind edges/nodes.)

- [ ] **Step 2: Verify manually + monkey test (project rule: monkey testing)**

Run: `cd frontend && npm run dev`
Expected: kelp sways gently like a current; moving the mouse near strands bends them slightly but nodes stay clickable (don't flee); marine snow drifts upward; passing a fresh `live` result makes the new bud bloom + glow cyan.
Monkey test: rapidly resize the window, shove the mouse fast across the canvas, run with 0 nodes (no crash) and with 50+ nodes (stays smooth ~60fps).

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/KelpCanvas.tsx && git commit -m "feat(fe): canvas animation — current sway, mouse field, budding, retrieval pulse, marine snow"
```

---

## Task 9: Run Console HUD

**Files:**
- Create: `frontend/src/components/hud/RunConsole.tsx`

**Interfaces:**
- Consumes: `Panel`, `api.run`, `RunResult`, `useCurrentAccount` (from `@mysten/dapp-kit-react`).
- Produces: `<RunConsole topic setTopic onResult />` where `onResult: (r: RunResult) => void`; emits the completed run upward so App can pass it as `live` to the canvas + refetch memory.

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { Panel } from './Panel.tsx';
import { api, ApiError, type RunResult } from '../../lib/api.ts';

const TOPIC_MAX = 200; // mirrors backend

export function RunConsole({ topic, setTopic, onResult }: {
  topic: string; setTopic: (t: string) => void; onResult: (r: RunResult) => void;
}) {
  const account = useCurrentAccount();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<RunResult | null>(null);

  const tooLong = topic.length > TOPIC_MAX;
  const canRun = !!account && topic.trim().length > 0 && !tooLong && !busy;

  const run = async () => {
    if (!account) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.run(topic.trim(), account.address);
      setLast(r); onResult(r);
    } catch (e) {
      const ae = e as ApiError;
      setErr(ae.status === 409 ? 'A run is already in progress.' : 'Agent service error.');
    } finally { setBusy(false); }
  };

  return (
    <Panel id="run" title="New Run" defaultRect={{ x: 24, y: 64, w: 280, h: 200 }}>
      <input value={topic} maxLength={TOPIC_MAX + 1} onChange={(e) => setTopic(e.target.value)}
        placeholder="Research topic…" style={inputStyle} />
      <div className="label" style={{ marginTop: 8 }}>Agent (wallet)</div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--herb)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {account ? account.address : 'connect a wallet to run'}
      </div>
      <button disabled={!canRun} onClick={run} style={{ ...runBtn, opacity: canRun ? 1 : 0.4 }}>
        {busy ? 'Running…' : '▷ Run Agent'}
      </button>
      {tooLong && <div style={errStyle}>Topic too long (max {TOPIC_MAX}).</div>}
      {err && <div style={errStyle}>{err}</div>}
      {last && <div className="mono" style={{ fontSize: 11, marginTop: 8, color: 'var(--kelp-lit)' }}>
        +{last.freshCount} fresh · {last.knownHit} known
      </div>}
    </Panel>
  );
}
const inputStyle: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 12 };
const runBtn: React.CSSProperties = { width: '100%', marginTop: 10, background: 'var(--kelp)', color: '#031', border: 'none', borderRadius: 6, padding: '7px', fontWeight: 600, cursor: 'pointer' };
const errStyle: React.CSSProperties = { color: 'var(--amber)', fontSize: 11, marginTop: 6, fontFamily: 'var(--font-mono)' };
```

- [ ] **Step 2: Verify types**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/hud/RunConsole.tsx && git commit -m "feat(fe): RunConsole HUD (wallet=agent, topic guard, 409 single-flight, fresh/known)"
```

---

## Task 10: Inspector HUD (glow economy + data-gap handling)

**Files:**
- Create: `frontend/src/components/hud/Inspector.tsx`

**Interfaces:**
- Consumes: `Panel`, `KelpNode`.
- Produces: `<Inspector node />` where `node: KelpNode | null`. Trunk node → runId / blobId / digest + badges; bud node → title / summary / sourceUrl. Historical run node (no blobId/digest) → matte "Anchored" + reserved verifiable slot.

- [ ] **Step 1: Implement**

```tsx
import { Panel } from './Panel.tsx';
import type { KelpNode } from '../../lib/projectGraph.ts';

const EXPLORER = (digest: string) => `https://testnet.suivision.xyz/txblock/${digest}`;

export function Inspector({ node }: { node: KelpNode | null }) {
  return (
    <Panel id="inspector" title={node ? (node.kind === 'run' ? `Run #${node.runId}` : 'Finding') : 'Inspector'}
      defaultRect={{ x: typeof window !== 'undefined' ? window.innerWidth - 320 : 600, y: 64, w: 296, h: 280 }}>
      {!node && <div className="mono" style={{ fontSize: 11, color: 'var(--herb)' }}>Click a kelp node.</div>}
      {node?.kind === 'finding' && (
        <div>
          <div style={{ fontSize: 16, marginBottom: 6 }}>{node.label}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--herb)', lineHeight: 1.5 }}>{node.summary}</div>
          {node.sourceUrl && <a href={node.sourceUrl} target="_blank" rel="noreferrer"
            className="mono" style={{ fontSize: 11, color: 'var(--cyan)', display: 'block', marginTop: 8 }}>source ↗</a>}
        </div>
      )}
      {node?.kind === 'run' && (
        <div className="mono" style={{ fontSize: 11, lineHeight: 1.8 }}>
          <div><span style={{ color: 'var(--herb)' }}>runId  </span>{node.runId}</div>
          <div><span style={{ color: 'var(--herb)' }}>blobId </span>{node.blobId ?? '—'}</div>
          <div><span style={{ color: 'var(--herb)' }}>digest </span>{node.digest ? `${node.digest.slice(0, 10)}…` : '—'}</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {node.blobId
              ? <span style={badgeAmber}>✦ Stored on Walrus</span>
              : <span style={badgeMatte}>○ Anchored</span>}
            {node.digest
              ? <a href={EXPLORER(node.digest)} target="_blank" rel="noreferrer" style={badgeCyan}>✓ Verified on-chain ↗</a>
              : <span style={badgeMatte}>○ Verifiable (pending index)</span>}
          </div>
        </div>
      )}
    </Panel>
  );
}
const badge: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 10px', borderRadius: 7, width: 'fit-content', textDecoration: 'none' };
const badgeAmber: React.CSSProperties = { ...badge, color: 'var(--amber)', border: '1px solid rgba(235,179,82,0.4)', background: 'rgba(235,179,82,0.07)', boxShadow: '0 0 14px -4px rgba(235,179,82,0.5)' };
const badgeCyan: React.CSSProperties = { ...badge, color: 'var(--cyan)', border: '1px solid rgba(77,229,247,0.45)', background: 'rgba(77,229,247,0.06)', boxShadow: '0 0 16px -3px rgba(77,229,247,0.6)' };
const badgeMatte: React.CSSProperties = { ...badge, color: 'var(--herb)', border: '1px solid var(--border)', background: 'transparent' };
```

- [ ] **Step 2: Verify types**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/hud/Inspector.tsx && git commit -m "feat(fe): Inspector HUD — glow economy badges, matte Anchored for historical nodes"
```

---

## Task 11: Memory / Restore HUD

**Files:**
- Create: `frontend/src/components/hud/MemoryRestore.tsx`

**Interfaces:**
- Consumes: `Panel`, `api.restore`, `Artifact`, `qrcode`, the `useMemory` refetch.
- Produces: `<MemoryRestore artifacts onClearLocal onRestored topic />` where `onClearLocal: () => void` (① frontend-only hide), `onRestored: () => void` (refetch memory after ②).

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Panel } from './Panel.tsx';
import { api, type Artifact } from '../../lib/api.ts';

export function MemoryRestore({ artifacts, onClearLocal, onRestored }: {
  artifacts: Artifact[]; onClearLocal: () => void; onRestored: () => void;
}) {
  const [qr, setQr] = useState<string>('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { QRCode.toDataURL(window.location.href, { margin: 1, width: 96 }).then(setQr).catch(() => {}); }, []);

  const restore = async () => {
    setBusy(true);
    try { await api.restore(); onRestored(); } finally { setBusy(false); }
  };

  return (
    <Panel id="memory" title="Memory · Restore"
      defaultRect={{ x: 24, y: typeof window !== 'undefined' ? window.innerHeight - 300 : 400, w: 280, h: 260 }}>
      <div className="label">Recalled</div>
      <div style={{ maxHeight: 90, overflow: 'auto', margin: '6px 0' }}>
        {artifacts.length === 0 && <div className="mono" style={{ fontSize: 11, color: 'var(--herb)' }}>none</div>}
        {[...artifacts].sort((a, b) => b.runId - a.runId).map((a) => (
          <div key={a.runId} className="mono" style={{ fontSize: 11, padding: '3px 0', borderLeft: '2px solid var(--kelp)', paddingLeft: 6, marginBottom: 3 }}>
            Run #{a.runId} · {a.findings.length} findings
          </div>
        ))}
      </div>
      <button onClick={onClearLocal} style={btnGhost}>⌫ Clear local view</button>
      <button onClick={restore} disabled={busy} style={btnCyan}>{busy ? 'Restoring…' : '⟳ Restore from Walrus'}</button>
      {qr && <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        <img src={qr} width={64} height={64} alt="open on phone" style={{ borderRadius: 4 }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--herb)' }}>scan to open same memory on another device</span>
      </div>}
    </Panel>
  );
}
const btn: React.CSSProperties = { width: '100%', marginTop: 6, borderRadius: 6, padding: '7px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11 };
const btnGhost: React.CSSProperties = { ...btn, background: 'transparent', border: '1px solid var(--border)', color: 'var(--herb)' };
const btnCyan: React.CSSProperties = { ...btn, background: 'rgba(77,229,247,0.12)', border: '1px solid var(--cyan)', color: 'var(--cyan)' };
```

- [ ] **Step 2: Verify types**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/hud/MemoryRestore.tsx && git commit -m "feat(fe): Memory/Restore HUD — recall list, clear-local (1), restore (2), QR cross-device"
```

---

## Task 12: App composition + empty/error states

**Files:**
- Modify: `frontend/src/App.tsx` (rewrite)

**Interfaces:**
- Consumes: every component above + `useMemory` + `projectGraph` + `ConnectButton`.
- Produces: the assembled page. State: `topic`, `live: RunResult | null`, `selected: KelpNode | null`, `clearedLocally: boolean`.

- [ ] **Step 1: Implement App.tsx**

```tsx
import { useMemo, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { KelpCanvas } from './components/KelpCanvas.tsx';
import { RunConsole } from './components/hud/RunConsole.tsx';
import { Inspector } from './components/hud/Inspector.tsx';
import { MemoryRestore } from './components/hud/MemoryRestore.tsx';
import { useMemory } from './hooks/useMemory.ts';
import { projectGraph, type KelpNode } from './lib/projectGraph.ts';
import type { RunResult } from './lib/api.ts';

const DEFAULT_TOPIC = 'Walrus ecosystem';

export default function App() {
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [live, setLive] = useState<RunResult | null>(null);
  const [selected, setSelected] = useState<KelpNode | null>(null);
  const [clearedLocally, setClearedLocally] = useState(false);

  const memory = useMemory(topic);
  const artifacts = memory.data ?? [];
  const graph = useMemo(
    () => (clearedLocally ? { nodes: [], edges: [] } : projectGraph(artifacts, live)),
    [artifacts, live, clearedLocally],
  );

  return (
    <div>
      <KelpCanvas graph={graph} onNodeClick={setSelected} />
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', pointerEvents: 'none' }}>
        <span style={{ fontSize: 22 }}>Kelp<em style={{ color: 'var(--kelp-lit)' }}>Chronicle</em></span>
        <div style={{ pointerEvents: 'auto' }}><ConnectButton /></div>
      </header>

      {graph.nodes.length === 0 && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontStyle: 'italic', color: 'var(--herb)' }}>
            {memory.isError ? 'Memory service unavailable.' : 'No anchored memory yet — run the agent.'}
          </span>
        </div>
      )}

      <RunConsole topic={topic} setTopic={setTopic} onResult={(r) => { setClearedLocally(false); setLive(r); memory.refetch(); }} />
      <Inspector node={selected} />
      <MemoryRestore artifacts={artifacts} onClearLocal={() => { setClearedLocally(true); setSelected(null); }}
        onRestored={() => { setClearedLocally(false); memory.refetch(); }} />
    </div>
  );
}
```

- [ ] **Step 2: Verify end-to-end (backend running)**

Start backend: `cd <backend-abs> && nohup npm run dev > /tmp/recall-be.log 2>&1 &` then `lsof -iTCP:8788 -sTCP:LISTEN`.
Run: `cd frontend && npx tsc --noEmit && npm run dev`
Expected: canvas with HUDs; connect wallet; with seeded memory, kelp forest renders; **Clear local view** empties it; **Restore from Walrus** regrows it; clicking nodes opens Inspector; topic >200 chars blocked; a second `/run` while one is in flight surfaces the 409 message.

- [ ] **Step 3: Monkey test (project rule)**

Drag every panel off-screen and back; collapse/expand each; resize to minimum; spam Run; switch wallet/disconnect mid-run; reload page (panels restore position, memory re-fetches — NOT from localStorage). Confirm no run/finding data is in `localStorage` (only `recall_panels`, `recall_dappkit`).

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/App.tsx && git commit -m "feat(fe): compose KelpChronicle — canvas + HUDs + empty/error states (graph = /memory projection)"
```

---

## Task 13: Backend attestation index endpoint (enables full ② verifiability)

**Files:**
- Create: `backend/src/attestIndex.ts`
- Modify: `backend/src/routes.ts` (add `attestationsHandler`)
- Modify: `backend/src/server.ts` (mount `GET /attestations`)
- Create: `backend/test/attestIndex.test.ts`

**Interfaces:**
- Produces: `GET /attestations?agent=0x..&namespace=..` → `{ [runId: string]: { blobId: string; digest: string } }`. Queries on-chain `recall::attestation::RunAttestation` objects (source of truth — does NOT touch artifact hash invariant). Follows `routes.ts` injectable-deps pattern so it's testable with a fake.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAttestIndex } from '../src/attestIndex.ts';

test('maps on-chain attestations to runId -> {blobId,digest}', async () => {
  const fakeList = async () => [
    { runId: 1, blobId: 'b1', digest: '0xd1' },
    { runId: 2, blobId: 'b2', digest: '0xd2' },
  ];
  const index = makeAttestIndex({ listAttestations: fakeList });
  const r = await index('0x6', 'ns');
  assert.deepEqual(r, { '1': { blobId: 'b1', digest: '0xd1' }, '2': { blobId: 'b2', digest: '0xd2' } });
});

test('latest digest wins when a runId has multiple attestations', async () => {
  const fakeList = async () => [
    { runId: 1, blobId: 'b1', digest: '0xold' },
    { runId: 1, blobId: 'b1b', digest: '0xnew' },
  ];
  const index = makeAttestIndex({ listAttestations: fakeList });
  const r = await index('0x6', 'ns');
  assert.equal(r['1'].digest, '0xnew');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — cannot find `../src/attestIndex.ts`.

- [ ] **Step 3: Implement `attestIndex.ts`**

```ts
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
    // Implementer: use client.listOwnedObjects / event query for type
    // `${RECALL_PACKAGE_ID}::attestation::RunAttestation`; map each to {runId, blobId, digest}.
    // Filter by matching agent + namespace fields. Return [] on none.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS.

- [ ] **Step 5: Add `attestationsHandler` to routes.ts + mount in server.ts**

In `routes.ts` `RouteDeps` add `attestIndex?: (agent: string, namespace: string) => Promise<Record<string,{blobId:string;digest:string}>>` (default `makeAttestIndex()`), and a handler:

```ts
async attestationsHandler(input: { agent?: unknown; namespace?: unknown }): Promise<RouteResult> {
  const agent = normalizeSuiAddress(String(input?.agent ?? '').trim());
  if (!isValidSuiAddress(agent) || agent === ZERO_ADDRESS) return { status: 400, body: { error: 'invalid agent address' } };
  try { return { status: 200, body: await attestIndex(agent, String(input?.namespace ?? '')) }; }
  catch (e) { console.error('[/attestations] failed:', e); return { status: 502, body: { error: 'attestation index error' } }; }
}
```

In `server.ts` mount: `app.get('/attestations', adapt(routes.attestationsHandler, (req) => ({ agent: req.query.agent, namespace: req.query.namespace })))` (match existing adapter style).

- [ ] **Step 6: Verify + commit**

Run: `cd backend && npm test && npx tsc --noEmit`
Expected: full suite green.
```bash
cd backend && git add src/attestIndex.ts src/routes.ts src/server.ts test/attestIndex.test.ts && git commit -m "feat(be): GET /attestations — on-chain RunAttestation index (runId->blobId/digest)"
```

---

## Task 14: Wire attestation index into the frontend (light up historical nodes)

**Files:**
- Modify: `frontend/src/lib/api.ts` (add `getAttestations`)
- Modify: `frontend/src/lib/projectGraph.ts` (accept an attestation map, backfill blobId/digest on run nodes)
- Modify: `frontend/test/projectGraph.test.ts` (add backfill test)
- Modify: `frontend/src/App.tsx` (fetch + pass the map)

**Interfaces:**
- Consumes: `GET /attestations`.
- Produces: `api.getAttestations(agent, namespace)`; `projectGraph(artifacts, live, attestations?)` where `attestations: Record<string,{blobId;digest}>` backfills any run node lacking blobId/digest → historical nodes now glow `Verified on-chain ↗`.

- [ ] **Step 1: Write the failing projectGraph backfill test**

```ts
test('attestation map backfills blobId/digest onto historical run nodes', () => {
  const g = projectGraph([mk(1, ['a'])], null, { '1': { blobId: 'bb', digest: '0xdd' } });
  const run = g.nodes.find((n) => n.id === 'run:1');
  assert.equal(run?.blobId, 'bb');
  assert.equal(run?.digest, '0xdd');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `projectGraph` ignores 3rd arg.

- [ ] **Step 3: Extend `projectGraph` signature**

Add 3rd param `attestations: Record<string, { blobId: string; digest: string }> = {}`. After building a run node, if it lacks `blobId`/`digest` and `attestations[String(runId)]` exists, set them. (Live result still takes precedence — apply attestation backfill only when fields are still undefined.)

- [ ] **Step 4: Add `api.getAttestations` + wire App.tsx**

In `api.ts`: `getAttestations: (agent, namespace) => fetchImpl(\`${base}/attestations?agent=${encodeURIComponent(agent)}&namespace=${encodeURIComponent(namespace)}\`).then(r => unwrap(...))`.
In App.tsx: a `useQuery(['attestations', agent, namespace])` (enabled when wallet connected); pass its data as the 3rd arg to `projectGraph`. Namespace comes from any recalled artifact's `namespace` (all share one).

- [ ] **Step 5: Run tests + manual verify**

Run: `cd frontend && npm test && npx tsc --noEmit`
Expected: PASS. Manual: after a device switch (② / incognito), historical nodes now show `Verified on-chain ↗` (once Task 13's live query returns rows).

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/lib/api.ts src/lib/projectGraph.ts test/projectGraph.test.ts src/App.tsx && git commit -m "feat(fe): backfill on-chain attestations onto historical kelp nodes (full cross-device verifiability)"
```

---

## Self-Review Notes

- **Spec coverage:** §1 architecture → Tasks 4,5,12 (projection golden rule enforced in App.tsx `useMemo` + Task 6 stores only UI prefs). §1.5 visual language → Task 1 (tokens/fonts) + glow economy in Tasks 7,8,10. §2 layout/HUDs → Tasks 6,9,10,11,12. §3 graph semantics+engine → Tasks 3,7,8. §4 error handling → Tasks 9 (409/topic/wallet), 12 (502/empty). §5 testing → Tasks 2,3 (pure-fn TDD), monkey tests in 8,12. §2 data gap → Tasks 10 (matte) + 13–14 (backfill). §6 out-of-scope respected (auth not built; Task 13 is the only backend addition, scoped to read-only chain query).
- **Type consistency:** `RunResult`/`Artifact`/`Finding` defined in Task 2, consumed identically in 3,9,12. `KelpNode`/`KelpGraph` defined in Task 3, consumed in 7,8,10,12. `projectGraph` signature grows from 2→3 args in Task 14 (back-compatible default).
- **Known implementer judgement points (flagged inline, not placeholders):** dapp-kit `DAppKitProvider` prop name (Task 4 Step 3 — verify against installed `.d.mts`); the on-chain `RunAttestation` query shape (Task 13 Step 3 — object/event field mapping against the deployed package). Both have verification commands; neither blocks the testable core.
```
