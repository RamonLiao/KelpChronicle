# Recall — Walrus Research Agent

Sui Overflow 2026 · Walrus Track (project 07).

An AI research agent that tracks the Sui/Walrus ecosystem and stores its findings
as **verifiable memory on Walrus** (via MemWal). Each run recalls prior memory and
researches only the *new* delta; each run's artifact hash is anchored on-chain by a
thin `recall::attestation` Move module. Meta-narrative: *an agent that tracks Walrus,
remembering on Walrus.*

## Status
Design complete; implementation not started. **Start at Plan Task 0 (dependency spike).**

## Docs
- Spec: `docs/specs/2026-06-19-memwal-research-agent-design.md`
- Plan: `docs/plans/2026-06-19-recall-walrus-agent.md` (16 tasks, spike-gated, TDD)
- Demo script + working notes: `tasks/` (not committed)

## Layout (created by Plan Task 1)
- `move/` — `recall::attestation` package
- `backend/` — Node/tsx agent loop + MemWal + attest (port :8788)
- `frontend/` — React + Vite + dApp Kit (chat console + memory sidebar)
- `shared/` — canonical artifact JSON + keccak256 (the hash contract)

## Prerequisites (human)
- MemWal account + delegate key from https://memory.walrus.xyz playground.
- Resolve the `@mysten/sui` pin via Task 0 spike before any feature code.
