# Walrus Research Agent — Design Spec

> Date: 2026-06-19
> Working codename: **Recall** (a research agent that remembers)
> Status: Design — approved direction, pending spec review → writing-plans
> Track: Sui Overflow 2026 — **Walrus Track** (AI agents + agentic workflows powered by Walrus as a verifiable data & memory layer)

---

## 0. Relationship to WalCoop

This is a **new, separate project**. The existing WalCoop data-marketplace
(`feat/pipeline-integration`) is **frozen and untouched**. Recall reuses
WalCoop's *conceptual* DNA (verifiable artifacts on Walrus, on-chain trust,
clean web2-style UX) but is a fresh codebase aligned to the Walrus track rubric.

---

## 1. Why this project (rubric alignment)

The Walrus track is **not** "use Walrus as storage." It is explicitly:

> AI agents / agentic workflows that use **Walrus as a verifiable data & memory
> layer** — memory that persists across sessions, data that is portable,
> persistent, and not platform-locked.

Recall hits the rubric's named priorities:

| Rubric priority | How Recall hits it |
|---|---|
| Long-term memory via persistent verifiable memory (MemWal) | Agent's research memory lives in MemWal (Walrus blobs + Seal + on-chain account) |
| Long-running monitoring workflow | Agent tracks the Walrus/Sui ecosystem across repeated runs over time |
| Artifact-driven workflow (generate → store → **reuse**) | Each run produces a report artifact, stored to Walrus, **recalled and reused** on the next run |
| Interfaces to inspect/debug/manage agent memory on Walrus | The Memory sidebar IS that interface |
| "Working systems, not demos" | The agent genuinely diffs prior memory and only researches the delta |
| Verifiable (our own on-chain logic) | A thin `recall::attestation` Move module anchors a hash of every run's artifact on-chain (§5.4) — verifiability is provable, not just claimed |

**Meta narrative (the hook):** *"I built an agent that tracks the Walrus
ecosystem — and its memory lives on Walrus."* Self-referential, judge-resonant.

---

## 2. Scope — Phase A only (this spec)

A→B→C is a roadmap. **This spec covers Phase A only.** B/C are north-star;
Phase A must leave architectural seams for them but implements none of them.

- **Phase A (this spec):** single research agent with growing, verifiable
  memory on Walrus (via MemWal). Chat console + Memory sidebar UI. Demonstrates
  "remembers → only researches the delta → memory persists across session/device."
- **Phase B (roadmap, not built):** multi-agent collaboration over a *shared*
  MemWal namespace (e.g. Researcher + Critic reading/writing the same memory).
- **Phase C (roadmap, not built):** agent data marketplace — agents pay (Seal-gated)
  to read each other's memory, revenue-shared back (WalCoop's settlement DNA).

**Seams to preserve for B/C** (design constraints, not features):
- Memory is scoped by `namespace`; agent identity is an explicit field on every
  artifact. → B can point a second agent at the same namespace; C can gate by identity.
- Report artifacts use a **versioned, self-describing JSON schema** (see §5.3) so
  another agent (B) or a buyer (C) can consume them without our app's context.
- Access to a namespace flows through MemWal's on-chain account/Seal model — the
  hook C needs for paid access already exists; we just don't charge in Phase A.
- **Run attestations** (§5.4) are immutable on-chain objects keyed by `agent` +
  `runId` + `walrusBlobId`. C settles payment *against* an attestation; B verifies
  a peer agent's artifact *against* its attestation hash. The seam is the object.

---

## 3. Personas / roles

WalCoop's three human roles collapse. Phase A has **one human + one agent**:

- **Operator (human):** gives the agent a tracking topic, triggers runs, inspects
  memory. The only UI user.
- **Recall (agent):** autonomous worker. On each run: recall prior memory → diff →
  research only the delta → write a new report artifact → store to Walrus/MemWal.

No role-switcher, no PublisherCap/ProviderCap/Brand mental model. That entire
WalCoop capability lattice is gone in Phase A.

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Browser (React + dApp Kit)                                │
│  ┌───────────────────────┐   ┌──────────────────────────┐│
│  │ Chat console          │   │ Memory sidebar           ││
│  │ - topic / run trigger │   │ - artifact cards         ││
│  │ - agent step trace    │   │ - "✓ on Walrus" badges   ││
│  │ - run-compare view    │   │ - expand → blobId/content││
│  └───────────────────────┘   └──────────────────────────┘│
└───────────────┬───────────────────────────────┬──────────┘
                │ (wallet sign: account/delegate)│ reads
                ▼                                 ▼
┌─────────────────────────────┐        MemWal relayer (hosted,
│ Agent backend (Node/tsx)    │        testnet staging endpoint)
│  - run loop / orchestration │───────► remember / recall / restore
│  - LLM analysis (toy/real)  │        (embedding, Seal, Walrus,
│  - web/ecosystem fetch      │         vector index)
│  - MemWal SDK client        │
└─────────────────────────────┘
                                        On-chain (Sui testnet, gRPC):
                                        - memwal::account (MemWal identity,
                                          Seal access control)
                                        - recall::attestation (OURS — immutable
                                          per-run hash anchor, §5.4)
```

- **Frontend** (new, React + Vite + `@mysten/dapp-kit-react`): chat console +
  memory sidebar. Direction-2 UX (web2 feel + on-chain trust badges).
- **Agent backend** (new, Node + tsx, mirrors WalCoop's `backend/` shape): runs
  the agent loop, calls the LLM, fetches ecosystem data, talks to MemWal SDK.
- **MemWal** (hosted relayer, testnet staging): the memory layer. We do **not**
  self-host. SDK `@mysten-incubation/memwal`.
- **Sui testnet (gRPC only — JSON-RPC is removed as of 2026-04):**
  - MemWal's `memwal::account` (identity + Seal access — theirs).
  - **`recall::attestation` (ours)** — a minimal Move package; one immutable
    object per run anchoring the artifact hash (§5.4). This is the project's
    own on-chain logic and the basis of the honest "verifiable" claim.

### Why a backend (not browser-only)
LLM keys, ecosystem fetching, and the run loop don't belong in the browser. The
backend holds the agent's delegate key and orchestrates; the browser signs
account/delegate setup and renders memory. (Same split rationale as WalCoop.)

---

## 5. Memory model (MemWal)

### 5.1 Primitives used
- One `MemWalAccount` (Sui shared object) per operator address.
- One `DelegateKey` held by the backend to act via the relayer.
- One `namespace` per tracked topic, e.g. `walrus-ecosystem`. Memory isolation =
  `owner + namespace`. (B will share this namespace across agents.)

### 5.2 Core calls
- `rememberAndWait(text)` — store a report artifact (use the **AndWait** variant;
  never bare `remember` then immediate `recall`, see §8 risk #303).
- `recall({ query, topK, namespace })` — semantic search over prior memory.
- `restore(namespace)` — rebuild the index from Walrus (used for the
  "persistence across session/device" demo moment).

### 5.3 Artifact schema (versioned, self-describing)
Every stored memory is a JSON report with a stable envelope so B/C can consume it:

```json
{
  "schema": "recall.report.v1",
  "agent": "<agent-identity-string>",
  "namespace": "walrus-ecosystem",
  "runId": "<monotonic run number>",
  "createdAtMs": 0,
  "topic": "new Walrus ecosystem projects",
  "findings": [{ "title": "...", "summary": "...", "sourceUrl": "...", "key": "<stable-dedup-key>" }],
  "priorRunIds": ["..."]
}
```

`findings[].key` is the **dedup key** that powers the "only research the delta"
behavior (§6). `createdAtMs`/`runId` are stamped by the backend (never via
`Date.now()` inside any workflow script — pass timestamps in).

### 5.4 On-chain attestation (`recall::attestation` — our Move module)
A minimal Move package. Each completed run anchors its artifact on-chain so the
"verifiable" claim is provable independently of the centralized MemWal relayer.

```move
module recall::attestation;

public struct RunAttestation has key, store {
    id: UID,
    agent: address,          // which agent produced this (B/C identity seam)
    namespace: vector<u8>,   // topic memory scope
    run_id: u64,
    artifact_hash: vector<u8>, // keccak256 of the canonical artifact JSON
    walrus_blob_id: vector<u8>,
    created_at_ms: u64,      // from Clock, not host time
}

// Anchor a run. Object is FROZEN after creation → immutable public receipt.
public fun attest(
    agent: address, namespace: vector<u8>, run_id: u64,
    artifact_hash: vector<u8>, walrus_blob_id: vector<u8>,
    clock: &Clock, ctx: &mut TxContext,
) {
    let att = RunAttestation {
        id: object::new(ctx), agent, namespace, run_id,
        artifact_hash, walrus_blob_id,
        created_at_ms: clock.timestamp_ms(),
    };
    transfer::freeze_object(att);     // immutable, anyone can read & verify
    event::emit(Attested { agent, run_id, artifact_hash });
}
```

- **Object model:** `key + store`, frozen immediately → an immutable audit record
  (same pattern as WalCoop's `UsageRecord`). No shared-object contention, no admin.
- **Verification flow:** anyone recalls an artifact → re-computes `keccak256` of its
  canonical JSON → compares to the on-chain `artifact_hash`. Match = untampered.
- **Reads** via gRPC (`getObject` / event query), never JSON-RPC.
- **B/C seam:** `agent` + `run_id` make this the identity/settlement anchor.
- **Phase A keeps it free** — no payment logic yet (that's C). Just the anchor.

---

## 6. The core behavior: "remember → diff → research only the delta"

This is a **real feature, not a demo fake** (operator-confirmed). Run loop:

1. **Recall:** `recall({ query: topic, topK: N })` → prior findings for this topic.
2. **Build known-set:** collect `findings[].key` from recalled artifacts into a Set.
3. **Fetch candidates:** agent fetches current ecosystem data (real sources).
4. **Diff:** drop any candidate whose stable key is already in the known-set.
   Surface in the UI: *"Already knew X, Y from memory (N items); M are new."*
5. **Analyze delta only:** LLM summarizes the M new items.
6. **Write artifact:** assemble a `recall.report.v1` referencing `priorRunIds`,
   `rememberAndWait(...)` it to MemWal/Walrus → get `walrusBlobId`.
7. **Attest on-chain:** compute `keccak256(canonical artifact JSON)`, call
   `recall::attestation::attest(...)` with the hash + `walrusBlobId` (§5.4).
8. **Render:** new card appears in the Memory sidebar with the ✓ Walrus badge
   and a `✓ Verified on-chain` badge linking to the attestation object.

The diff is plain deterministic code (stable keys), **not** an LLM judgment —
per dev-rules "不要用 LLM 做決定性轉換." The LLM only summarizes.

---

## 7. UI design (Direction 2: web2 feel + on-chain trust badges)

**Principle:** treat the operator as an end user. No raw chain jargon in the
main flow; on-chain facts collapse into expandable detail. Honest badges only.

### 7.1 Layout
- **Left/center — Chat console:** topic input + "Run" button; agent step trace
  (Recalling… / Found N known, M new / Analyzing… / Stored ✓). A toggle switches
  to **Run-compare view** (run N vs run N-1 side by side — the "got smarter" delta).
- **Right — Memory sidebar:** one card per artifact. Card front: topic, run #,
  finding count, relative time, **`✓ Stored on Walrus` badge**. Expand →
  blobId, namespace, full findings, source links.

### 7.2 Jargon policy (what to hide / rename / collapse)
| Raw concept | Operator sees | Where details live |
|---|---|---|
| MemWal `remember`/`recall` | "Saving to memory" / "Recalling memory" | step trace text |
| Walrus blobId | `✓ Stored on Walrus` badge | expand card → "Blob: 0x…" + copy |
| Sui address / accountId | hidden; "Your memory space" | expandable "Account details" |
| Delegate key / SessionKey | invisible (backend) | n/a |
| namespace | "Topic memory" | expand card |
| Seal / encryption | "Private & access-controlled" | one-line footnote |
| vector search / cosine distance | "most relevant memories" | n/a |
| `recall::attestation` object / hash | `✓ Verified on-chain` badge | expand → object id, artifact hash, "how to verify" |

### 7.3 Honest badge wording (do NOT overclaim)
MemWal stores content as Walrus blobs (durable) but the vector index + relayer
are **centralized/off-chain**. Our `recall::attestation` (§5.4) adds a real,
independently-checkable integrity anchor — so "verifiable" is now honest:
- ✅ `✓ Stored on Walrus — durable`
- ✅ `✓ Verified on-chain` (artifact hash anchored; re-computable by anyone)
- ✅ `Persists across sessions & devices`
- ❌ NOT "fully decentralized" / "trustless memory" (index/relayer are centralized;
  only identity, access-control, and the integrity anchor are on-chain)

---

## 8. Risks & footguns (MemWal beta — design around these)

| # | Risk | Mitigation (baked into design) |
|---|---|---|
| #303 | `recall()` empty for minutes after `remember()` (indexing latency) | **Demo pre-seeds run 1 off-stage**; live demo only recalls already-indexed memory. Always use `rememberAndWait`. Never store-then-immediately-recall on stage. |
| #300/#302 | `createAccount`/`addDelegateKey` break on `@mysten/sui` v2.6+ | **Pin `@mysten/sui`** to a MemWal-compatible version; verify account ops at project init. |
| #295 | Seal SessionKey 5-min TTL → silent auth failure in long ops | Keep run loop short; refresh key per run; surface a clear error, not a hang. |
| #296/#291/#292 | Undocumented rate/size limits; no pagination/metadata filter | Test demo data volume early; keep per-artifact size modest; one namespace per topic. |
| general | Beta, centralized relayer/index | Don't pitch as production decentralization; badges per §7.3. |

### 8.1 Dependency-compatibility spike (HARD PREREQUISITE — plan step 0)
The architectural risk that can sink the project: `@mysten/dapp-kit-react` and
`@mysten-incubation/memwal` may pin **conflicting `@mysten/sui` versions**
(MemWal breaks on v2.6+, #300/#302; dApp Kit may *require* ≥2.6). Resolve
**before writing any feature code**:
1. Install both SDKs + `@mysten/sui`; run `tsc` and one real `createAccount`/
   `addDelegateKey` op against testnet staging.
2. If they coexist → pin the working `@mysten/sui` and proceed.
3. If they conflict → **fall back architecture:** move all MemWal SDK calls
   (account/delegate/remember/recall) **entirely into the backend** with its own
   pinned `@mysten/sui`; the frontend uses dApp Kit only for wallet connect +
   reading attestation objects via gRPC. No MemWal SDK in the browser.

This decision gates the whole build; it is plan step 0, not a footnote.

---

## 8b. Security / threat model

Phase A has autonomous memory writes + a delegate key — per project red-team
rules, the adversarial surface (≤5 vectors) and defenses:

| Vector | Threat | Defense |
|---|---|---|
| Delegate-key leak (backend compromise) | Attacker reads/writes the agent's whole memory | Key scoped to **one namespace**; rotate per deploy; backend rate-limits writes; key never reaches the browser (§8.1 fallback reinforces this) |
| Memory poisoning | Agent stores a malicious/wrong finding → pollutes every future run's diff | Every `findings[]` requires a `sourceUrl`; on-chain attestation hash makes any later tampering detectable; run-compare view surfaces anomalies |
| Namespace confusion | Writing to / reading from the wrong topic scope | Namespace is a **fixed backend mapping**, never passed from the browser |
| Attestation forgery / replay | Fake "verified" badge without a real anchor | Badge resolves the actual on-chain object via gRPC and re-checks the hash client-side; no object or hash-mismatch → no badge |
| Relayer outage mid-run | Partial/corrupt artifact stored | Artifact assembled fully before `rememberAndWait`; attest only after store succeeds; failed store → no attestation, clean abort (§10) |

---

## 9. Demo

The full beat-by-beat demo script lives in `tasks/demo-script-recall.md`.
Summary: pre-seeded memory → live "what's new?" run shows recall + delta-only
research → new artifact stored to Walrus → **kill app / new device → memory
persists** (the killer beat) → tease Phase B (second agent, same namespace).

---

## 10. Error handling

- **MemWal unreachable / relayer error:** toast "Memory service unavailable —
  retry"; agent run aborts cleanly, no hang. (WalCoop lesson: backend down →
  toast, never freeze.)
- **recall returns empty (cold/indexing):** UI shows "No prior memory yet —
  this is run 1," treats every candidate as new. Never blocks.
- **Account/delegate setup fails (#300/#302):** explicit setup-failed screen
  with the pinned-version hint, not a silent dead button.
- **LLM/fetch failure:** partial report allowed; artifact marks `findings` it got;
  never store a corrupt envelope.

---

## 11. Testing

- **Unit (pure, no IO):** the diff/dedup logic (§6 step 4) — known-set vs
  candidates → correct delta. This is the business-critical determinism;
  test it in isolation (WalCoop lesson: pure fns in an IO-free module).
- **Move unit (`sui move test`):** `recall::attestation` — attest creates a frozen
  object with correct fields; hash round-trips; event emitted. Run before any commit
  touching `.move` (project rule). Review via `move-code-quality` → `sui-security-guard`,
  **not** the generic reviewer (project routing).
- **Integration:** backend ↔ MemWal staging — remember → (wait) → recall round-trip
  returns the stored artifact; `restore` rebuilds. Backend → `attest` tx → read the
  attestation back via gRPC and re-verify the hash matches the artifact.
- **Monkey (per project rule):** empty topic, huge report, duplicate runs (delta
  must be empty on a no-change re-run), recall during indexing window, relayer
  down mid-run, `@mysten/sui` version mismatch, tampered artifact (hash mismatch →
  no `✓ Verified on-chain` badge), attestation for a non-existent object id.

---

## 12. Tech stack

- **Move:** `recall::attestation` package (Move 2024 edition). `sui move build`/`test`
  before commit. Deploy testnet → keep `UpgradeCap`.
- Frontend: React 18 + Vite + TypeScript + `@mysten/dapp-kit-react` (mirror WalCoop).
- Backend: Node + tsx, Express + cors (mirror WalCoop `backend/`).
- Memory: `@mysten-incubation/memwal` (TS SDK) → testnet staging relayer
  (`relayer-staging.memory.walrus.xyz`, `MEMWAL_PACKAGE_ID=0xcf6ad7…229c6`).
- **Data access: gRPC only** (`@mysten/sui/grpc` `SuiGrpcClient`). JSON-RPC is
  removed (2026-04) — do not use. SDK naming: `@mysten/sui` (not `.js`),
  `Transaction` (not `TransactionBlock`).
- Pin `@mysten/sui` per the §8.1 spike result.
- LLM: start with a toy summarizer; swap to a real model if time allows (the
  envelope/diff/attestation don't depend on which).

---

## 13. Open items for the implementation plan

- **§8.1 dependency spike is plan step 0** — its outcome (coexist vs backend-only
  MemWal) shapes the frontend architecture; resolve before anything else.
- New project location/repo layout (sibling dir vs subdir — decide at plan time).
- Real ecosystem data source(s) for "Walrus projects" (registry? RSS? curated list?).
- Whether to wire a real LLM in Phase A or ship toy + stretch-goal real.
- `recall::attestation`: confirm `keccak256` availability in Move stdlib (`sui::hash`)
  and define the **canonical JSON serialization** both backend and verifier use
  (must be byte-identical or the hash check fails).
