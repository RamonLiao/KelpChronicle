# Recall — Walrus Research Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single AI research agent that tracks the Walrus/Sui ecosystem, stores its findings as verifiable memory on Walrus (via MemWal), anchors each run's artifact hash on-chain (`recall::attestation`), and on each run recalls prior memory to research only the delta.

**Architecture:** Three tiers in a new sibling repo. (1) A minimal Move package `recall::attestation` anchoring per-run artifact hashes as immutable objects. (2) A Node/tsx backend holding the MemWal delegate key, running the agent loop (recall → diff → summarize → remember → attest) over a GitHub-API-primary / RSS-secondary ecosystem feed. (3) A React+Vite frontend (dApp Kit) with a chat console + memory sidebar, web2-feel UX with honest on-chain trust badges.

**Tech Stack:** Move 2024; Node + tsx + Express; React 18 + Vite + TypeScript + `@mysten/dapp-kit-react`; `@mysten-incubation/memwal`; `@mysten/sui` (gRPC, pinned per spike); GitHub REST API; toy summarizer (real LLM = stretch).

## Global Constraints

- **New standalone repo:** `/Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Sui_Overflow/Tracks/3-Walrus/07-recall/` (lives under the Sui Overflow Walrus track folder, own git history — independent of the WalCoop repo). Relative paths in tasks are relative to that repo root.
- **Data access: gRPC only.** `@mysten/sui/grpc` `SuiGrpcClient`. JSON-RPC is removed (2026-04) — never use it.
- **SDK naming:** `@mysten/sui` (not `.js`); `Transaction` (not `TransactionBlock`).
- **`@mysten/sui` version is pinned per Task 0's spike result** — do not bump it ad hoc.
- **MemWal:** testnet staging relayer `https://relayer-staging.memory.walrus.xyz`, `MEMWAL_PACKAGE_ID=0xcf6ad7…229c6` (confirm exact value from MemWal docs at Task 0). Always `rememberAndWait`, never bare `remember`+immediate `recall`.
- **Determinism rule:** routing, retry, dedup/diff, and any transformation are plain code — never an LLM. The LLM only summarizes.
- **Canonical JSON:** backend hashing and frontend verification MUST use one byte-identical canonical serializer (Task 3). A mismatch silently breaks every "✓ Verified on-chain" badge.
- **Badge honesty:** allowed — "Stored on Walrus", "Verified on-chain", "Persists across sessions & devices". Forbidden — "fully decentralized", "trustless memory".
- **Move review routing:** `.move` changes reviewed via `move-code-quality` → `sui-security-guard`, NOT the generic reviewer. Run `sui move test` before any commit touching `.move`.
- **Commit discipline:** type-check (`npx tsc --noEmit`) / `sui move build` before each commit.

---

### Task 0: Dependency-compatibility spike (THE GATE)

This task decides the whole frontend architecture. No feature code until it resolves.

**Files:**
- Create: `spike/package.json`, `spike/check.ts`

**Interfaces:**
- Produces: a documented decision — **MODE-A** (dApp Kit + MemWal coexist in browser) or **MODE-B** (MemWal SDK backend-only, browser does wallet-connect + gRPC reads only). Every later frontend task branches on this.

- [ ] **Step 1: Init spike sandbox**

```bash
mkdir -p /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Sui_Overflow/Tracks/3-Walrus/07-recall/spike && cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Sui_Overflow/Tracks/3-Walrus/07-recall/spike
npm init -y
npm i @mysten/dapp-kit-react @mysten/sui @mysten-incubation/memwal
```

- [ ] **Step 2: Record the resolved `@mysten/sui` tree**

```bash
npm ls @mysten/sui
```
Expected: note every `@mysten/sui` version pulled (by dApp Kit vs MemWal). If two incompatible majors appear (MemWal needs <2.6 per issues #300/#302, dApp Kit may need ≥2.6), that's the conflict signal.

- [ ] **Step 3: Write a real account-op probe**

```ts
// spike/check.ts — exercises the op MemWal issues #300/#302 break on
import { getFullnodeUrl } from '@mysten/sui/client';
// import MemWal account helpers per docs.memwal.ai api-reference
async function main() {
  // 1. construct MemWal client against staging relayer
  // 2. call createAccount / generateDelegateKey (the ops that break on @mysten/sui v2.6+)
  // 3. log success or the "SuiClient not found" error
}
main().catch((e) => { console.error('SPIKE FAIL:', e); process.exit(1); });
```

- [ ] **Step 4: Run the probe on testnet staging**

Run: `npx tsx spike/check.ts`
Expected: either clean success (→ MODE-A viable) or the `SuiClient not found` / version error (→ MODE-B required).

- [ ] **Step 5: Write the decision to the repo**

Create `/Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Sui_Overflow/Tracks/3-Walrus/07-recall/DECISIONS.md` with: chosen MODE, the exact pinned `@mysten/sui` version, and the MemWal `MEMWAL_PACKAGE_ID` / relayer URL confirmed from docs. **MODE-B is the safe default if anything is ambiguous.**

- [ ] **Step 6: Commit**

```bash
cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Sui_Overflow/Tracks/3-Walrus/07-recall && git add . && git commit -m "chore: dependency spike — decide MemWal/dApp Kit integration mode"
```

---

### Task 1: Repo scaffold (Move + backend + frontend skeletons)

**Files:**
- Create: `move/Move.toml`, `move/sources/.gitkeep`, `backend/package.json`, `backend/tsconfig.json`, `frontend/` (vite scaffold), root `.gitignore`, `README.md`

**Interfaces:**
- Produces: three buildable empty subprojects. Backend `npm run dev` boots an Express server on `:8788`; frontend `npm run dev` boots Vite; `sui move build` succeeds on an empty module.

- [ ] **Step 1: Move package init**

```bash
cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Sui_Overflow/Tracks/3-Walrus/07-recall && mkdir move && cd move
sui move new recall
```
Edit `move/Move.toml` → set edition `"2024"`, package name `recall`, address `recall = "0x0"`.

- [ ] **Step 2: Verify empty Move builds**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Sui_Overflow/Tracks/3-Walrus/07-recall/move && sui move build`
Expected: builds with no modules (or a trivial placeholder), no errors.

- [ ] **Step 3: Backend skeleton (mirror WalCoop backend shape)**

```bash
cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Sui_Overflow/Tracks/3-Walrus/07-recall && mkdir backend && cd backend && npm init -y
npm i express cors @mysten/sui@<PINNED> @mysten-incubation/memwal
npm i -D tsx typescript @types/express @types/cors @types/node
```
Create `backend/src/server.ts`:
```ts
import express from 'express';
import cors from 'cors';
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors({ origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',') }));
app.get('/health', (_req, res) => res.json({ ok: true }));
const PORT = Number(process.env.PORT ?? 8788);
app.listen(PORT, () => console.log(`Recall backend on :${PORT}`));
```
Add `"dev": "node --import tsx src/server.ts"` to `backend/package.json` scripts.

- [ ] **Step 4: Verify backend boots**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Sui_Overflow/Tracks/3-Walrus/07-recall/backend && npm run dev` then `curl localhost:8788/health`
Expected: `{"ok":true}`.

- [ ] **Step 5: Frontend scaffold**

```bash
cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Sui_Overflow/Tracks/3-Walrus/07-recall && npm create vite@latest frontend -- --template react-ts
cd frontend && npm i @mysten/dapp-kit-react @mysten/sui@<PINNED> @tanstack/react-query
```
(If MODE-B: do NOT add `@mysten-incubation/memwal` to frontend.)

- [ ] **Step 6: Verify frontend builds**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_Sui_Overflow/Tracks/3-Walrus/07-recall/frontend && npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add . && git commit -m "chore: scaffold move + backend + frontend skeletons"
```

---

### Task 2: Canonical artifact JSON + hashing (pure, shared core)

This is the byte-identical contract between backend hashing and frontend verification. Build it first and freeze it — everything downstream depends on it.

**Files:**
- Create: `shared/src/artifact.ts`, `shared/src/canonical.ts`, `shared/test/canonical.test.ts`

**Interfaces:**
- Produces:
  - `interface Finding { key: string; title: string; summary: string; sourceUrl: string }`
  - `interface Artifact { schema: 'recall.report.v1'; agent: string; namespace: string; runId: number; createdAtMs: number; topic: string; findings: Finding[]; priorRunIds: string[] }`
  - `canonicalize(a: Artifact): string` — deterministic JSON (sorted keys, no whitespace, findings sorted by `key`).
  - `artifactHashHex(a: Artifact): string` — `keccak256` of `canonicalize` output, lowercase hex no `0x`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { canonicalize, artifactHashHex } from '../src/canonical.js';
import type { Artifact } from '../src/artifact.js';

const base: Artifact = {
  schema: 'recall.report.v1', agent: '0xabc', namespace: 'walrus-ecosystem',
  runId: 2, createdAtMs: 1718000000000, topic: 't',
  findings: [
    { key: 'b', title: 'B', summary: 's', sourceUrl: 'u2' },
    { key: 'a', title: 'A', summary: 's', sourceUrl: 'u1' },
  ],
  priorRunIds: ['1'],
};

test('canonical output is key-sorted and finding-sorted, whitespace-free', () => {
  const c = canonicalize(base);
  assert.ok(!/\s/.test(c), 'no whitespace');
  // findings reordered by key → "a" before "b"
  assert.ok(c.indexOf('"key":"a"') < c.indexOf('"key":"b"'));
  // top-level keys sorted: agent before topic
  assert.ok(c.indexOf('"agent"') < c.indexOf('"topic"'));
});

test('reordering findings does not change the hash', () => {
  const shuffled: Artifact = { ...base, findings: [...base.findings].reverse() };
  assert.strictEqual(artifactHashHex(base), artifactHashHex(shuffled));
});

test('changing a finding changes the hash', () => {
  const tampered: Artifact = { ...base, findings: [{ ...base.findings[0], summary: 'x' }, base.findings[1]] };
  assert.notStrictEqual(artifactHashHex(base), artifactHashHex(tampered));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd shared && node --import tsx --test test/canonical.test.ts`
Expected: FAIL — module not found / functions undefined.

- [ ] **Step 3: Implement**

```ts
// shared/src/artifact.ts
export interface Finding { key: string; title: string; summary: string; sourceUrl: string }
export interface Artifact {
  schema: 'recall.report.v1'; agent: string; namespace: string;
  runId: number; createdAtMs: number; topic: string;
  findings: Finding[]; priorRunIds: string[];
}
```
```ts
// shared/src/canonical.ts
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import type { Artifact } from './artifact.js';

function sortObj(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortObj);
  if (v && typeof v === 'object') {
    return Object.keys(v as object).sort().reduce((acc, k) => {
      (acc as Record<string, unknown>)[k] = sortObj((v as Record<string, unknown>)[k]);
      return acc;
    }, {} as Record<string, unknown>);
  }
  return v;
}

export function canonicalize(a: Artifact): string {
  const withSortedFindings = { ...a, findings: [...a.findings].sort((x, y) => x.key < y.key ? -1 : x.key > y.key ? 1 : 0) };
  return JSON.stringify(sortObj(withSortedFindings));
}

export function artifactHashHex(a: Artifact): string {
  return bytesToHex(keccak_256(new TextEncoder().encode(canonicalize(a))));
}
```
Install dep: `npm i @noble/hashes` in `shared/`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd shared && node --import tsx --test test/canonical.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add shared && git commit -m "feat(shared): canonical artifact JSON + keccak256 hashing"
```

---

### Task 3: `recall::attestation` Move module

**Files:**
- Create: `move/sources/attestation.move`, `move/tests/attestation_tests.move`

**Interfaces:**
- Produces: `recall::attestation::attest(agent, namespace, run_id, artifact_hash, walrus_blob_id, clock, ctx)` creating a frozen `RunAttestation` and emitting `Attested`. The `artifact_hash` here is the keccak256 bytes from Task 2 (frontend/backend pass it in; Move does not recompute the JSON).

- [ ] **Step 1: Write the failing Move test**

```move
#[test_only]
module recall::attestation_tests;
use recall::attestation;
use sui::clock;
use sui::test_scenario as ts;

#[test]
fun attest_creates_frozen_record() {
    let admin = @0xA;
    let mut sc = ts::begin(admin);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    attestation::attest(
        admin, b"walrus-ecosystem", 2,
        b"deadbeef", b"blob123",
        &clk, ts::ctx(&mut sc),
    );
    clk.destroy_for_testing();
    // next tx: the frozen object is readable by anyone
    ts::next_tx(&mut sc, admin);
    ts::end(sc);
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd move && sui move test`
Expected: FAIL — module `attestation` not found.

- [ ] **Step 3: Implement the module**

```move
module recall::attestation;

use sui::clock::Clock;
use sui::event;

public struct RunAttestation has key, store {
    id: UID,
    agent: address,
    namespace: vector<u8>,
    run_id: u64,
    artifact_hash: vector<u8>,
    walrus_blob_id: vector<u8>,
    created_at_ms: u64,
}

public struct Attested has copy, drop {
    agent: address,
    run_id: u64,
    artifact_hash: vector<u8>,
}

public fun attest(
    agent: address,
    namespace: vector<u8>,
    run_id: u64,
    artifact_hash: vector<u8>,
    walrus_blob_id: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let att = RunAttestation {
        id: object::new(ctx),
        agent, namespace, run_id, artifact_hash, walrus_blob_id,
        created_at_ms: clock.timestamp_ms(),
    };
    event::emit(Attested { agent, run_id, artifact_hash });
    transfer::freeze_object(att);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd move && sui move test`
Expected: PASS.

- [ ] **Step 5: Move review (project routing — NOT generic reviewer)**

Run `move-code-quality` then `sui-security-guard` on `move/sources/attestation.move`. Fix findings inline.

- [ ] **Step 6: Build + commit**

```bash
cd move && sui move build
git add move && git commit -m "feat(move): recall::attestation immutable per-run hash anchor"
```

---

### Task 4: Deploy attestation + record package id

**Files:**
- Create: `move/PUBLISH.md` (records package id + UpgradeCap id)
- Modify: `backend/src/config.ts` (create)

**Interfaces:**
- Produces: `RECALL_PACKAGE_ID` env/config consumed by backend (Task 8) and frontend verify (Task 13).

- [ ] **Step 1: Publish to testnet**

Run: `cd move && sui client publish --gas-budget 100000000`
Record the package id and `UpgradeCap` object id into `move/PUBLISH.md`.

- [ ] **Step 2: Wire config**

```ts
// backend/src/config.ts
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}
export const RECALL_PACKAGE_ID = req('RECALL_PACKAGE_ID');
export const MEMWAL_RELAYER = process.env.MEMWAL_RELAYER ?? 'https://relayer-staging.memory.walrus.xyz';
export const NAMESPACE = process.env.NAMESPACE ?? 'walrus-ecosystem';
```
(Test isolation — keep this in its own module so pure-fn tests never import it. WalCoop lesson.)

- [ ] **Step 3: Commit**

```bash
git add move/PUBLISH.md backend/src/config.ts && git commit -m "chore: publish recall package to testnet, wire package id"
```

---

### Task 5: Diff/dedup engine (pure, no IO)

**Files:**
- Create: `backend/src/diff.ts`, `backend/test/diff.test.ts`

**Interfaces:**
- Consumes: `Finding` from `shared`.
- Produces: `computeDelta(known: Set<string>, candidates: Finding[]): { fresh: Finding[]; knownHit: number }`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { computeDelta } from '../src/diff.js';

test('drops candidates whose key is already known', () => {
  const known = new Set(['a', 'b']);
  const candidates = [
    { key: 'a', title: '', summary: '', sourceUrl: '' },
    { key: 'c', title: '', summary: '', sourceUrl: '' },
  ];
  const { fresh, knownHit } = computeDelta(known, candidates);
  assert.deepStrictEqual(fresh.map((f) => f.key), ['c']);
  assert.strictEqual(knownHit, 1);
});

test('no-change re-run yields empty delta', () => {
  const known = new Set(['a', 'c']);
  const candidates = [{ key: 'a', title: '', summary: '', sourceUrl: '' }, { key: 'c', title: '', summary: '', sourceUrl: '' }];
  assert.strictEqual(computeDelta(known, candidates).fresh.length, 0);
});

test('dedupes repeated keys within candidates', () => {
  const c = [{ key: 'x', title: '', summary: '', sourceUrl: '' }, { key: 'x', title: '', summary: '', sourceUrl: '' }];
  assert.strictEqual(computeDelta(new Set(), c).fresh.length, 1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && node --import tsx --test test/diff.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// backend/src/diff.ts
import type { Finding } from '../../shared/src/artifact.js';
export function computeDelta(known: Set<string>, candidates: Finding[]): { fresh: Finding[]; knownHit: number } {
  const seen = new Set<string>();
  const fresh: Finding[] = [];
  let knownHit = 0;
  for (const c of candidates) {
    if (known.has(c.key)) { knownHit++; continue; }
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    fresh.push(c);
  }
  return { fresh, knownHit };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && node --import tsx --test test/diff.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/diff.ts backend/test/diff.test.ts && git commit -m "feat(backend): deterministic delta/dedup engine"
```

---

### Task 6: Ecosystem fetcher (GitHub API primary, RSS secondary)

**Files:**
- Create: `backend/src/fetch.ts`, `backend/test/fetch.test.ts`

**Interfaces:**
- Produces: `fetchCandidates(): Promise<Finding[]>` — GitHub releases/new repos for the Walrus ecosystem mapped to `Finding` with a **stable `key`** (e.g. `gh:<repo>@<release-tag>`); RSS entries as fallback (`key = rss:<guid>`).

- [ ] **Step 1: Write the failing test (pure mapping fn)**

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { mapGithubRelease } from '../src/fetch.js';

test('maps a github release to a Finding with a stable key', () => {
  const f = mapGithubRelease({ repo: 'MystenLabs/walrus', tag_name: 'v1.2.0', name: 'Walrus 1.2', body: 'notes', html_url: 'https://x' });
  assert.strictEqual(f.key, 'gh:MystenLabs/walrus@v1.2.0');
  assert.strictEqual(f.sourceUrl, 'https://x');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && node --import tsx --test test/fetch.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement mapping + fetch**

```ts
// backend/src/fetch.ts
import type { Finding } from '../../shared/src/artifact.js';

export interface GhRelease { repo: string; tag_name: string; name: string; body: string; html_url: string }

export function mapGithubRelease(r: GhRelease): Finding {
  return { key: `gh:${r.repo}@${r.tag_name}`, title: r.name || r.tag_name, summary: (r.body || '').slice(0, 1000), sourceUrl: r.html_url };
}

const REPOS = ['MystenLabs/walrus', 'MystenLabs/walrus-sites', 'MystenLabs/MemWal']; // curated seed list

export async function fetchCandidates(): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const repo of REPOS) {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, {
        headers: { 'Accept': 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
      });
      if (!res.ok) continue;
      const rels = (await res.json()) as Array<Omit<GhRelease, 'repo'>>;
      for (const r of rels) out.push(mapGithubRelease({ ...r, repo }));
    } catch { /* skip repo, RSS fallback below covers gaps */ }
  }
  // RSS fallback omitted here for brevity of the pure test; add walrus blog RSS parse → key `rss:<guid>` if out is empty.
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && node --import tsx --test test/fetch.test.ts`
Expected: PASS.

- [ ] **Step 5: Manual live smoke**

Run a one-off `node --import tsx -e "import('./src/fetch.js').then(m=>m.fetchCandidates().then(r=>console.log(r.length, r[0])))"`.
Expected: ≥1 real Finding from GitHub. (If rate-limited, set `GITHUB_TOKEN`.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/fetch.ts backend/test/fetch.test.ts && git commit -m "feat(backend): walrus ecosystem fetcher (github + rss)"
```

---

### Task 7: MemWal client wrapper

**Files:**
- Create: `backend/src/memory.ts`

**Interfaces:**
- Produces:
  - `recallArtifacts(query: string): Promise<Artifact[]>` — `recall` → parse stored JSON back into `Artifact[]`.
  - `rememberArtifact(a: Artifact): Promise<{ blobId: string }>` — `rememberAndWait(canonicalize(a))` → return Walrus blobId.
  - `restoreMemory(): Promise<void>` — `restore(namespace)` for the persistence demo beat.

- [ ] **Step 1: Implement wrapper (per docs.memwal.ai api-reference, exact init from Task 0)**

```ts
// backend/src/memory.ts
import { MemWal } from '@mysten-incubation/memwal';
import { MEMWAL_RELAYER, NAMESPACE } from './config.js';
import { canonicalize, type Artifact } from '../../shared/src/canonical.js';

// key + accountId provisioned via Task 0 / playground; injected via env
function client() {
  return MemWal.create({ key: process.env.MEMWAL_KEY!, accountId: process.env.MEMWAL_ACCOUNT_ID!, serverUrl: MEMWAL_RELAYER, namespace: NAMESPACE });
}

export async function recallArtifacts(query: string): Promise<Artifact[]> {
  const { results } = await client().recall({ query, topK: 20, namespace: NAMESPACE });
  return results.map((r) => JSON.parse(r.text) as Artifact).filter((a) => a.schema === 'recall.report.v1');
}

export async function rememberArtifact(a: Artifact): Promise<{ blobId: string }> {
  const job = await client().rememberAndWait(canonicalize(a));
  return { blobId: (job as { blob_id: string }).blob_id };
}

export async function restoreMemory(): Promise<void> {
  await client().restore(NAMESPACE, 100);
}
```

- [ ] **Step 2: Integration smoke against staging**

Run a one-off: `rememberArtifact` a tiny artifact → wait → `recallArtifacts` returns it.
Expected: round-trips. **Account for indexing latency (#303): allow buffer / poll; never assert immediately.**
Document observed latency in `DECISIONS.md`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/memory.ts && git commit -m "feat(backend): MemWal memory wrapper (recall/remember/restore)"
```

---

### Task 8: Toy summarizer

**Files:**
- Create: `backend/src/summarize.ts`, `backend/test/summarize.test.ts`

**Interfaces:**
- Produces: `summarizeFresh(fresh: Finding[]): Finding[]` — returns findings with a normalized `summary` (toy: truncate + prefix). Real-LLM swap is a later stretch with the same signature.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { summarizeFresh } from '../src/summarize.js';
test('summary is non-empty and bounded', () => {
  const out = summarizeFresh([{ key: 'k', title: 'T', summary: 'x'.repeat(5000), sourceUrl: 'u' }]);
  assert.ok(out[0].summary.length <= 500);
  assert.ok(out[0].summary.length > 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && node --import tsx --test test/summarize.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// backend/src/summarize.ts
import type { Finding } from '../../shared/src/artifact.js';
export function summarizeFresh(fresh: Finding[]): Finding[] {
  return fresh.map((f) => ({ ...f, summary: `${f.title}: ${f.summary.replace(/\s+/g, ' ').trim()}`.slice(0, 500) }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && node --import tsx --test test/summarize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/summarize.ts backend/test/summarize.test.ts && git commit -m "feat(backend): toy summarizer (real-LLM-swappable)"
```

---

### Task 9: Agent run loop + on-chain attest

**Files:**
- Create: `backend/src/run.ts`, `backend/src/attest.ts`

**Interfaces:**
- Consumes: `recallArtifacts`, `fetchCandidates`, `computeDelta`, `summarizeFresh`, `rememberArtifact`, `artifactHashHex`, attestation package.
- Produces: `runAgent(topic: string, agent: string, nowMs: number): Promise<{ artifact: Artifact; blobId: string; attestationDigest: string; knownHit: number; freshCount: number }>`.

- [ ] **Step 1: Implement attest tx builder (gRPC, Transaction)**

```ts
// backend/src/attest.ts
import { Transaction } from '@mysten/sui/transactions';
import { fromHex } from '@mysten/sui/utils';
import { RECALL_PACKAGE_ID } from './config.js';
// signer + SuiGrpcClient construction per Task 0 pinned SDK
export function buildAttestTx(p: { agent: string; namespace: string; runId: number; artifactHashHex: string; blobId: string }): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${RECALL_PACKAGE_ID}::attestation::attest`,
    arguments: [
      tx.pure.address(p.agent),
      tx.pure.vector('u8', Array.from(new TextEncoder().encode(p.namespace))),
      tx.pure.u64(p.runId),
      tx.pure.vector('u8', Array.from(fromHex(p.artifactHashHex))),
      tx.pure.vector('u8', Array.from(new TextEncoder().encode(p.blobId))),
      tx.object('0x6'), // Clock
    ],
  });
  return tx;
}
```

- [ ] **Step 2: Implement the run loop**

```ts
// backend/src/run.ts
import { recallArtifacts, rememberArtifact } from './memory.js';
import { fetchCandidates } from './fetch.js';
import { computeDelta } from './diff.js';
import { summarizeFresh } from './summarize.js';
import { artifactHashHex, type Artifact } from '../../shared/src/canonical.js';
import { buildAttestTx } from './attest.js';
import { NAMESPACE } from './config.js';
// import signAndExecute (gRPC) per Task 0

export async function runAgent(topic: string, agent: string, nowMs: number) {
  const prior = await recallArtifacts(topic);
  const known = new Set(prior.flatMap((a) => a.findings.map((f) => f.key)));
  const candidates = await fetchCandidates();
  const { fresh, knownHit } = computeDelta(known, candidates);
  const summarized = summarizeFresh(fresh);
  const runId = prior.reduce((m, a) => Math.max(m, a.runId), 0) + 1;
  const artifact: Artifact = {
    schema: 'recall.report.v1', agent, namespace: NAMESPACE, runId,
    createdAtMs: nowMs, topic, findings: summarized,
    priorRunIds: prior.map((a) => String(a.runId)),
  };
  const { blobId } = await rememberArtifact(artifact);
  const tx = buildAttestTx({ agent, namespace: NAMESPACE, runId, artifactHashHex: artifactHashHex(artifact), blobId });
  const { digest } = await /* signAndExecute */ executeAttest(tx);
  return { artifact, blobId, attestationDigest: digest, knownHit, freshCount: fresh.length };
}
```

- [ ] **Step 3: Live e2e — one full run on testnet**

Run a one-off invoking `runAgent('new Walrus ecosystem projects', '<addr>', Date.now())`.
Expected: returns a blobId + attestation digest; the attestation object is queryable via gRPC and its `artifact_hash` equals `artifactHashHex(artifact)`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/run.ts backend/src/attest.ts && git commit -m "feat(backend): agent run loop with on-chain attestation"
```

---

### Task 10: Backend HTTP API

**Files:**
- Modify: `backend/src/server.ts`

**Interfaces:**
- Produces:
  - `POST /run { topic }` → run summary (Task 9 return shape).
  - `GET /memory` → `Artifact[]` (recall current memory for the sidebar).
  - `POST /restore` → triggers `restoreMemory` (persistence demo beat).

- [ ] **Step 1: Add routes**

```ts
import { runAgent } from './run.js';
import { recallArtifacts, restoreMemory } from './memory.js';
app.post('/run', async (req, res) => {
  const topic = String(req.body?.topic ?? '').trim();
  if (!topic) return res.status(400).json({ error: 'topic required' });
  try { res.json(await runAgent(topic, req.body.agent, Date.now())); }
  catch (e) { res.status(502).json({ error: 'memory/agent service error', detail: String(e) }); }
});
app.get('/memory', async (req, res) => {
  try { res.json(await recallArtifacts(String(req.query.topic ?? ''))); }
  catch (e) { res.status(502).json({ error: String(e) }); }
});
app.post('/restore', async (_req, res) => { await restoreMemory(); res.json({ ok: true }); });
```

- [ ] **Step 2: Manual smoke**

Run: `curl -XPOST localhost:8788/run -H 'content-type: application/json' -d '{"topic":"new Walrus ecosystem projects","agent":"0x..."}'`
Expected: JSON with `blobId`, `attestationDigest`, `freshCount`, `knownHit`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/server.ts && git commit -m "feat(backend): /run /memory /restore endpoints"
```

---

### Task 11: Frontend shell + wallet connect + dApp Kit (gRPC)

**Files:**
- Create: `frontend/src/dapp-kit.ts`, `frontend/src/main.tsx` (modify), `frontend/src/lib/api.ts`

**Interfaces:**
- Produces: dApp Kit `SuiGrpcClient` configured for testnet (mirror WalCoop `dapp-kit.ts`); `api.run/getMemory/restore` HTTP clients to the backend.

- [ ] **Step 1: dApp Kit config (gRPC, testnet)**

Copy WalCoop's `frontend/src/dapp-kit.ts` pattern verbatim (gRPC, `SuiGrpcClient`, testnet/mainnet, autoConnect). Adjust storageKey to `recall_dappkit`.

- [ ] **Step 2: API client**

```ts
// frontend/src/lib/api.ts
const BASE = import.meta.env.VITE_BACKEND ?? 'http://localhost:8788';
export const api = {
  run: (topic: string, agent: string) => fetch(`${BASE}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic, agent }) }).then((r) => r.json()),
  getMemory: (topic: string) => fetch(`${BASE}/memory?topic=${encodeURIComponent(topic)}`).then((r) => r.json()),
  restore: () => fetch(`${BASE}/restore`, { method: 'POST' }).then((r) => r.json()),
};
```

- [ ] **Step 3: Verify tsc + boots, wallet connects**

Run: `cd frontend && npx tsc --noEmit && npm run dev`
Expected: page loads, ConnectButton connects a testnet wallet.

- [ ] **Step 4: Commit**

```bash
git add frontend/src && git commit -m "feat(frontend): shell, gRPC dapp-kit, backend api client"
```

---

### Task 12: Chat console + Memory sidebar (web2 UX, honest badges)

> UI work — per project frontend rule, may be delegated to Gemini CLI with the existing-code + style prompt. Claude wires state/API. Keep jargon policy (spec §7.2) and badge honesty (§7.3).

**Files:**
- Create: `frontend/src/components/Console.tsx`, `frontend/src/components/MemorySidebar.tsx`, `frontend/src/components/Badges.tsx`, `frontend/src/App.tsx` (modify)

**Interfaces:**
- Consumes: `api.run/getMemory`.
- Produces: console that triggers `/run` and renders the step trace (`Recalling… / N known, M new / Saving… / Stored ✓`); sidebar listing artifacts with `✓ Stored on Walrus` + `✓ Verified on-chain` (Task 13) badges, expandable to blobId/findings/namespace.

- [ ] **Step 1: Build Console + step trace from `/run` result** (renders `knownHit`/`freshCount` as "knew N, M new").
- [ ] **Step 2: Build MemorySidebar from `/memory`** (card front: topic, run #, finding count, relative time; expand → details with collapsed chain facts per §7.2).
- [ ] **Step 3: Empty/error states** — no memory → "Run 1, nothing remembered yet"; backend down → toast, no freeze (WalCoop lesson).
- [ ] **Step 4: Verify** `npx tsc --noEmit`, manual click-through.
- [ ] **Step 5: Commit** `feat(frontend): chat console + memory sidebar`.

---

### Task 13: On-chain verification badge

**Files:**
- Create: `frontend/src/lib/verify.ts`
- Modify: `frontend/src/components/Badges.tsx`

**Interfaces:**
- Consumes: dApp Kit gRPC client, `artifactHashHex` from `shared`.
- Produces: `verifyArtifact(a: Artifact, attestationObjectId: string): Promise<boolean>` — read the attestation object via gRPC, compare its `artifact_hash` to `artifactHashHex(a)`. Drives whether `✓ Verified on-chain` renders.

- [ ] **Step 1: Implement verify (re-hash client-side, compare to chain)**

```ts
// frontend/src/lib/verify.ts
import { artifactHashHex, type Artifact } from '../../../shared/src/canonical.js';
// SuiGrpcClient from dapp-kit
export async function verifyArtifact(client: any, a: Artifact, attestationObjectId: string): Promise<boolean> {
  const obj = await client.core.getObject({ objectId: attestationObjectId, include: { json: true } });
  const onChainHashBytes: number[] | string = obj?.json?.artifact_hash; // gRPC json: vector<u8> as base64 OR flattened — normalize both (WalCoop lesson)
  const onChainHex = normalizeVecU8ToHex(onChainHashBytes);
  return onChainHex === artifactHashHex(a);
}
```

- [ ] **Step 2: Test the normalize helper** (base64 vs number[] both → same hex). Unit test in `frontend/test`.
- [ ] **Step 3: Wire badge** — green `✓ Verified on-chain` only on `true`; mismatch → no badge (Monkey: tampered artifact).
- [ ] **Step 4: Verify** tsc + manual: a real run's card shows the badge; hand-tamper a finding in devtools → badge disappears.
- [ ] **Step 5: Commit** `feat(frontend): on-chain artifact verification badge`.

---

### Task 14: Run-compare view + persistence (restore) UI

**Files:**
- Create: `frontend/src/components/RunCompare.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `/memory` (run N vs N-1), `api.restore`.
- Produces: toggle showing two runs side by side highlighting the delta; a "reconnect/restore" path proving memory persists.

- [ ] **Step 1: Build side-by-side run-compare** (diff fresh findings between consecutive runIds).
- [ ] **Step 2: Restore flow** — on fresh load / explicit button, call `/restore` then `/memory`; sidebar repopulates (demo beat 4).
- [ ] **Step 3: Verify** tsc + manual: reload with cleared local state → memory returns from Walrus.
- [ ] **Step 4: Commit** `feat(frontend): run-compare + restore persistence view`.

---

### Task 15: E2E + Monkey testing

**Files:**
- Create: `TESTING.md` (records results)

- [ ] **Step 1: Happy path e2e** — pre-seed run 1 (off-stage, account for #303 latency) → run 2 shows recall + delta → new card + both badges → reload/restore → memory persists.
- [ ] **Step 2: Monkey (project rule):**
  - empty topic → 400, UI guards.
  - huge report / many findings → still stores; note size vs MemWal limits (#296).
  - no-change re-run → delta empty, no new misleading "new" claims.
  - recall during indexing window → "run 1 / nothing yet", never blocks.
  - relayer down mid-run → toast, clean abort, no attestation written.
  - tampered artifact (devtools) → `✓ Verified on-chain` disappears.
  - attestation for non-existent object id → verify returns false, no badge.
  - SessionKey TTL expiry mid-run (#295) → clear error, not a hang.
- [ ] **Step 3: Record outcomes in `TESTING.md`; file follow-ups for any MemWal limit hit.**
- [ ] **Step 4: Commit** `test: e2e + monkey results`.

---

## Self-Review

**Spec coverage:** §1 rubric → Tasks 9/13 (delta + verify). §2 seams → attestation `agent`/`runId` (Task 3). §4 architecture → Tasks 1/9/11. §5 memory model → Tasks 2/7. §5.4 attestation → Tasks 3/4/13. §6 run loop → Tasks 5/9. §7 UX → Tasks 12/13/14. §8 risks → Task 0 (spike), Task 7 step 2 (#303), Task 15 (monkey). §8b threat model → Task 15 monkey cases. §10 errors → Tasks 10/12. §11 testing → Tasks 2/3/5/8/15. §12 stack → all. §13 open items → Task 0 (pin/MEMWAL ids), Task 2 (canonical JSON + keccak source), data source decided (GitHub+RSS, Task 6), LLM decided (toy, Task 8).

**Placeholder scan:** `<PINNED>` in Tasks 1/backend deps is intentional — resolved by Task 0 and recorded in DECISIONS.md; not a code placeholder. MemWal init exact args (Task 7) and signAndExecute (Task 9) reference Task 0's resolved SDK pin — flagged, not vague. RSS fallback in Task 6 left as a documented stretch within the pure-tested mapping. No silent TODOs.

**Type consistency:** `Finding`/`Artifact` defined once in `shared` (Task 2), imported everywhere. `computeDelta` signature stable across Tasks 5/9. `artifactHashHex` used identically in backend (Task 9) and frontend (Task 13). `runAgent` return shape consumed verbatim by Task 10.
