# Frontend UI Design Spec — KelpChronicle (Task 11+)

> Status: Approved direction (2026-06-21). Branding per `2026-06-20-branding-design.md` (KelpChronicle / kelp-forest). API shapes per `backend/src/routes.ts` + `shared/src/artifact.ts`.
> Scope: the dApp frontend (Tasks 11–14 surface). Backend endpoints already shipped (Task 10).

---

## 1. North Star & Architecture

**Demo killer:** "Close the app / switch devices — the memory is still there, restored from Walrus."

Two demo modes, one architecture:
- **① Clear local view** — frontend-only visual reset (hides nodes). Safe, stage-controlled opener. Proves *nothing* about persistence by itself.
- **② Cross-device / incognito** — the real GTM proof. A fresh client fetches `/memory` and the whole forest regrows. This is the target.

**Golden rule that makes ② nearly free:**

> The graph state is ALWAYS a pure projection of the server's `/memory` response. The frontend NEVER persists run/finding data to localStorage. localStorage holds ONLY UI prefs (panel layout).

Consequences:
- ② works with zero extra data work — a new client has no local memory to cheat with; it must fetch from the server, whose truth lives in Walrus + on-chain attestation.
- Harder proof available: wipe the backend cache too (restart) → `/restore` rebuilds from Walrus → ② proves "survives device swap AND backend amnesia."
- ① degrades to a frontend toggle layered on top of ②.

**Stack:** Vite + React 19 + `@mysten/dapp-kit-react` 2.x + `@tanstack/react-query` + `@mysten/sui` `SuiGrpcClient` (testnet) + `d3-force` (approved new dep). Single-page SPA. Full-bleed canvas底 + floating glass HUD windows on top.

**Data layer (plan Task 11):** `frontend/src/lib/api.ts` → `api.run(topic, agent)` / `api.getMemory(topic)` / `api.restore()`. `BASE = import.meta.env.VITE_BACKEND ?? 'http://localhost:8788'`.

**Memory truth source:** `useQuery(['memory', topic])` is the single source. The graph is `projectGraph(artifacts)` — a pure function — never independent state.

---

## 2. Layout — A: Full-bleed Canvas + Windowed HUD

The kelp-forest canvas fills the viewport. Control surfaces are independent glass windows over it, each with: drag handle, resize corner, collapse button. Position/size persisted to localStorage key `recall_panels`. Default layout: Console top-left, Inspector right, Memory/Restore bottom-left — user can move/resize/collapse freely so panels never block the graph.

Top bar (minimal): `KelpChronicle` logo + dapp-kit `ConnectButton`.

| Window | Content | Source |
|---|---|---|
| **Kelp Canvas** (full-screen base) | Force-directed kelp forest. Trunk = run, bud = finding. Fresh findings pulse cyan. | `/memory` projection |
| **Run Console** (default top-left) | topic input; agent = connected wallet address (read-only display); ▷ Run button; after run shows `+N fresh · M known`. | `api.run` |
| **Inspector** (default right; opens on node click) | Trunk node → runId / blobId / attestation digest + `Stored on Walrus ◈` / `Verified on-chain ✓ ↗`. Bud node → finding title / summary / sourceUrl ↗. | projected node data |
| **Memory / Restore** (default bottom-left) | recall list (run #, finding count); **Clear local view** (①); **Restore from Walrus** (②); QR code (scan to open same namespace on phone). | `api.restore` + `getMemory` |

Explorer link format: `https://testnet.suivision.xyz/txblock/{attestationDigest}` (suiscan acceptable alt).

---

## 3. Graph Semantics & Engine

**Model (two-tier):**
- **Trunk node = run** (one per `runId`), anchored at the "seabed". Carries `blobId` + attestation digest → hover/inspect shows on-chain verification.
- **Bud node = finding**, grows off its parent run node. Carries `title / summary / sourceUrl` (by finding `key`).
- **Edges:** run → its findings (membership); run → prior runs via `priorRunIds` (lineage trunk growing upward over generations).
- **Fresh vs known:** this run's delta findings (cyan, glowing pulse); known findings reuse existing nodes.

**Engine:**
- Layout via `d3-force` (+ `d3-quadtree`); rendered on a 2D `<canvas>` (stable >50 nodes vs SVG/DOM; demo stays smooth). Chosen over react-flow (a node-editor — fighting it for generative-art styling costs more than it saves).
- **Growth animation:** new fresh node emerges from its parent run's position → springs to its force-resolved spot. Edges are slightly-curved quadratic Béziers (organic tendrils), not straight lines.
- **Pulse:** on recall/restore, a cyan bioluminescent gradient runs along edges from seabed run → fresh buds.
- **Exit (① Clear):** nodes retract toward seabed + fade.
- **Interaction:** hover enlarges + mini tooltip (blobId / epoch / relevance); click opens Inspector.

---

## 4. State & Error Handling (red-team)

- **Run in progress:** single-flight. Disable Run button locally; backend 409 → toast "a run is already in progress".
- **Backend 502** (memory/agent service error) → non-destructive toast; graph keeps current state (never blanks).
- **No wallet connected:** Run disabled, prompt to connect.
- **Empty memory** (first load / pre-restore) → seabed empty state: "No anchored memory yet — run the agent."
- **topic > 200 chars:** blocked client-side (mirrors backend `TOPIC_MAX`).
- **react-query throttling** (lesson 2026-06-07 / 429): high `staleTime`, `refetchOnWindowFocus: false`, limited retry + backoff. Compute request amplification before adding any auto-refetch/polling.
- Single-wallet trap (lesson 2026-06-10): demo uses `agent = connected wallet address`; the on-chain signer is the backend `RECALL_SIGNER_KEY`, NOT the wallet. Spec-noted: agent ≠ signer. Not trustless — honesty-badge wording only (Stored on Walrus / Verified on-chain / Persists across sessions).

---

## 5. Testing Strategy

- **Pure projection extracted:** `frontend/src/lib/projectGraph.ts` — `Artifact[] → { nodes, edges }`. node:test unit tests (no IO/env import-chain side effects, lesson 2026-06-10). Tests encode WHY: delta maps to fresh-flagged buds; `priorRunIds` lineage produces trunk edges (no dropped edges); empty input → empty graph; duplicate finding `key` across runs reuses one node.
- **API client:** fetch-mocked happy / 409 / 502 branches.
- **Graph rendering/animation:** visual, not unit-tested. Manual + monkey test: hammer Run, drag panels off-screen, resize to minimum, rapid node clicks, run with empty/huge memory.

---

## 6. Out of Scope (this spec)

- Endpoint auth / rate-limit / per-agent scoping (DECISIONS Task 10 must-fix; public-deploy gate, not demo).
- Live `/run` happy-path (blocked on MemWal account + `RECALL_SIGNER_KEY`).
- Multi-agent shared namespace UI.
