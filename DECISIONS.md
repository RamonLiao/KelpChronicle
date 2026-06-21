# Recall — Decisions

## Task 0: Dependency-compatibility spike (the GATE) — 2026-06-20

### Verdict: **MODE-B** (MemWal lives in the backend; frontend is memwal-free, talks to backend over HTTP + does wallet-connect + gRPC reads only)

Chosen as a free decision, **not** forced by a conflict — the spike proved the
historical conflict no longer exists at current versions. MODE-A (memwal in the
browser) would also work. MODE-B wins because it (a) matches the planned tier
architecture (backend holds the delegate key + runs the agent loop), (b) is the
plan's documented safe default, (c) keeps the delegate key out of the browser.

### Pinned versions

| Package | Version | Notes |
|---|---|---|
| `@mysten/sui` | **`2.19.0`** | Single deduped copy on disk — do not bump ad hoc |
| `@mysten/dapp-kit-react` | `2.1.3` | → `@mysten/dapp-kit-core@1.6.1` |
| `@mysten-incubation/memwal` | `0.0.7` | `MEMWAL_TYPESCRIPT_COMPATIBILITY_VERSION=0.0.4`, `SUPPORTED_RELAYER_API_MAJOR=1` |
| `@mysten/seal` (via memwal) | `1.2.1` | also dedupes to sui 2.19.0 |

### Evidence (static analysis — version GATE passed without the live probe)

- `npm ls @mysten/sui --all`: MemWal (via `@mysten/seal`) **and** dApp Kit
  (via `dapp-kit-core`, `slush-wallet`, `wallet-standard`) all **dedupe to one
  `@mysten/sui@2.19.0`**. `find node_modules -path '*/@mysten/sui/package.json'`
  → exactly one copy on disk. No two-major conflict → no cross-realm realm split.
- `index.d.ts`: main entry **"Does NOT import account.js (which requires
  @mysten/sui)."** The remember/recall/restore path is delegate-key + HTTP only,
  zero SuiClient. `MemWalConfig` = `{ key, accountId?, serverUrl?, namespace? }`.
- `types.d.ts:294-296`: account ops accept a **pre-configured injected SuiClient
  ("e.g. from dapp-kit's useSuiClient()") "for browser environments where
  @mysten/sui v2.x removed SuiClient."** ← this dependency-injection is the fix
  for issues #300/#302. The old "SuiClient not found" can't happen when the
  client is passed in.

### Gotcha recorded

- **MemWal is ESM-only** (`exports` has only `import`/`types`, no `require`).
  The backend (`backend/package.json`) **must** set `"type": "module"`, else
  tsx/node CJS resolution dies with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The spike
  hit this and fixed it by setting `"type": "module"`.

### MemWal API surface confirmed (for Task 7 wrapper)

- `MemWal.create({ key, accountId, serverUrl, namespace })` — static factory.
- `rememberAndWait(text, namespace?, opts?)` → terminal result with `blob_id`.
- `recall({ query, limit?, namespace?, topK?, maxDistance? })` → `RecallResult`.
- `restore(namespace, limit)` → `RestoreResult` (persistence demo beat).
- Account/delegate-key provisioning: `@mysten-incubation/memwal/account`
  (`createAccount`, `generateDelegateKey`, `addDelegateKey`) — needs sui peer.

### Open / manual prep (Step 3/4 live probe deferred)

The static GATE is decisive, so feature work is unblocked. The live round-trip
probe (`spike/check.ts`) still needs human prep before it can run:

- [ ] Provision MemWal account + delegate key at the playground
      (memory.walrus.xyz). Then: `MEMWAL_KEY=0x.. MEMWAL_ACCOUNT_ID=0x.. MEMWAL_RELAYER=https://.. npx tsx spike/check.ts`
- [ ] **Confirm relayer URL.** SDK default = `https://relayer.memwal.ai/`;
      plan assumed staging `https://relayer-staging.memory.walrus.xyz`. Confirm
      the correct testnet relayer from the playground/docs and set `MEMWAL_RELAYER`.
- [ ] **Confirm `MEMWAL_PACKAGE_ID`** (plan placeholder `0xcf6ad7…229c6`) from docs.
- [ ] Record observed indexing latency (#303) when the round-trip runs (Task 7 step 2).

## Task 10: HTTP endpoints auth is deliberately out-of-scope (demo) — 2026-06-21

`/run` `/memory` `/restore` ship **unauthenticated** by design. Two independent
reviews (codex + background security review) flagged this HIGH:
- `/run` is a funded sink — any caller spends the backend signer's gas.
- `agent` is trusted from the request body → attestation "agent" label is spoofable.
- `/memory` has no per-agent scope → cross-tenant read.

**Why tolerated for the demo:** MODE-B backend is demo-local (single operator,
CORS-restricted origin); single-flight caps concurrent gas to 1 in-flight tx;
the honest-badge story already says MemWal = TEE relayer + delegate key (NOT
trustless), so a spoofable agent label doesn't overclaim. Same disposition as the
earlier codex namespace/agent-filter finding (account-scoped private namespace).

**MUST-FIX before any public/multi-tenant deployment** (not before the demo):
- [ ] Authn on `/run` `/restore`: client signs a challenge with the keypair that
      controls `agent`; verify sig against `agent` before `runAgent`. Or derive
      `agent` from an authenticated session, never trust the body field.
- [ ] Per-principal/IP rate-limit + per-run gas budget / signer circuit-breaker.
- [ ] `/memory`: pass authenticated agent as a mandatory filter into `recallArtifacts`
      (or per-agent MemWal namespace); reject wildcard/empty topic without agent scope.

## Frontend Task 14: multi-wallet memory↔attestation scoping mismatch (demo-tolerated) — 2026-06-21

Dual-review (codex Round 1, finding #3) flagged: `App.tsx` queries `/attestations`
with the **connected wallet** (`account.address`), but `/memory` is **topic-scoped,
not agent-scoped**. If the wallet switches while topic-based artifacts from a prior
agent are still on screen, `projectGraph` can backfill agent B's `digest/blobId`
onto agent A's run node (attestations keyed by `runId`, which is a per-agent/namespace
counter → collisions possible across agents).

**Why tolerated for the demo:** same root cause + same disposition as the Task 10
auth gap — demo is single-operator / single-wallet, `/memory` is not agent-scoped
by design yet. No wrong data surfaces with one wallet.

**MUST-FIX before public/multi-tenant deployment** (couples with Task 10 fix):
- [ ] Make `/memory` agent-scoped (per-agent MemWal namespace or mandatory agent
      filter), so artifacts and attestations always share one agent. Then the
      frontend mismatch disappears for free.
- [ ] Until then, frontend could guard by filtering `artifacts` to
      `a.agent === account.address` before projection — cheap, but only meaningful
      once `/memory` returns multiple agents' data.
