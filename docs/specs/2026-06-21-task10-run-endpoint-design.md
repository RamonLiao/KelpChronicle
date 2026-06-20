# Task 10 — Backend HTTP API (`/run`, `/memory`, `/restore`)

> 2026-06-21. Spec for the HTTP layer wrapping `runAgent` (Task 9). Plan ref:
> `docs/plans/2026-06-19-recall-walrus-agent.md` Task 10. Supersedes the inline
> draft there (which lacked input validation, DoS guard, and error-leak defense).

## Goal

Expose the agent run loop over HTTP so the frontend Console (Task 12) can trigger
a run and render memory. Three endpoints on the existing Express app in
`backend/src/server.ts`.

## Why this needs more than the plan draft

`POST /run` is **not** a cheap read. Each call:
1. spends real testnet gas (signer key, `defaultExecutor`), and
2. writes a blob to Walrus via the MemWal relayer.

So it is a state-mutating, cost-bearing, **public** endpoint. It is a core API
handler → Red Team Protocol applies.

## Red Team — attack vectors & defenses

| # | Vector | Draft gap | Defense |
|---|--------|-----------|---------|
| 1 | `agent` unvalidated → flows into `buildAttestTx` (frozen-object owner) + namespace; bad/empty value → on-chain tx fails or attests to garbage | none | `isSuiAddress(agent)` — `0x` + 64 lowercased hex; reject 400 |
| 2 | Economic DoS — repeated `/run` drains signer gas + floods namespace | none | **single-flight lock**: one run at a time; concurrent calls → 409. Full rate-limit deferred (YAGNI for demo). |
| 3 | Error detail leak — `String(e)` returned to client may expose relayer URL / signer / stack | `detail: String(e)` echoed | full error to server log only; client gets generic message |
| 4 | Unbounded `topic` → oversized blob / slow hash | trim only | length cap (200 chars); over → 400 |

## Architecture

**Handler/transport split.** Route logic lives in injectable functions that take
their collaborators as deps (mirrors `run.ts` `RunDeps` and `memory.ts` default-client
convention), so handlers are unit-testable without binding a port.

```
backend/src/
  routes.ts   (new)  — pure-ish handlers + single-flight lock + validation
  server.ts   (mod)  — express wire-up; mounts handlers
```

`routes.ts` exports a factory `makeRoutes(deps)` where
`deps = { run, recall, restore }` defaulting to the real `runAgent` /
`recallArtifacts` / `restoreMemory`. Returns `{ runHandler, memoryHandler, restoreHandler }`.

The single-flight lock is module-scoped state inside the factory closure
(a `boolean inFlight`), not global — one lock per `makeRoutes` instance, so tests
get a fresh lock.

## Endpoints

### `POST /run { topic: string, agent: string }`
- validate `topic`: non-empty after trim, ≤ 200 chars → else 400 `{error:'topic required'}` / `{error:'topic too long'}`
- validate `agent`: `isSuiAddress` → else 400 `{error:'invalid agent address'}`
- single-flight: if `inFlight` → 409 `{error:'a run is already in progress'}`
- else set `inFlight=true`, `await run(topic, agent, Date.now())`, return Task 9
  `RunResult` shape (`artifact`, `blobId`, `attestationDigest`, `knownHit`, `freshCount`); `finally` clears lock
- on throw: log full error server-side; 502 `{error:'memory/agent service error'}` (no detail)

### `GET /memory?topic=<string>`
- `await recall(String(topic ?? ''))` → `Artifact[]`
- on throw: log; 502 `{error:'memory service error'}`

### `POST /restore`
- `await restore()` → `{ok:true}`
- on throw: log; 502 `{error:'restore failed'}`

## `isSuiAddress`

Use `@mysten/sui/utils` `isValidSuiAddress` if present (verify the symbol before
use, per lessons); else local regex `/^0x[0-9a-f]{64}$/` against the lowercased
input. Normalize (lowercase) before both validation and passing downstream so the
attested owner is canonical.

## Testing (`backend/src/routes.test.ts`, node:test)

Inject fake deps; assert the **intent**, not just shape:

- happy path: valid topic+agent → 200, body === fake `run` return; `run` called with `(topic, agent, <number>)`
- bad agent (non-hex / wrong length / mixed-case-only) → 400, `run` NOT called (no gas spent — the WHY)
- empty / whitespace topic → 400; over-200-char topic → 400; `run` NOT called
- concurrent: two `runHandler` calls while first's `run` is pending → second 409; first still resolves
- `run` throws → 502, response body has no `detail` / no raw error string (leak guard — the WHY)
- lock released after throw: a failing run does not wedge the endpoint (next call proceeds)
- `/memory` and `/restore` throw → 502 generic
- **monkey**: missing body, body not JSON-shaped, `agent` uppercase hex, topic = 200 vs 201 chars (boundary)

## Out of scope

- IP/token rate-limit (deferred; single-flight covers demo)
- auth (endpoints are demo-local; CORS already restricts origin)
- streaming step-trace (frontend derives trace from `knownHit`/`freshCount`)
