# recall — Published Packages

## testnet (2026-06-20)

| Field | Value |
|-------|-------|
| Package ID | `0x29954144279209ff5cac9e81f921ca8ad523cd5c4c2fc8093b5bfd75c63d33a4` |
| Version | 1 (Immutable) |
| Module | `attestation` |
| UpgradeCap | `0x0faa152951d3be2d2927c777aaefcc8044cea163477131d8f21c5b09e2fc9efc` |
| UpgradeCap owner | `0x1509b5fdf09296b2cf749a710e36da06f5693ccd5b2144ad643b3a895abcbc4c` |
| Publish tx | `Czy75K6uYfT4DGV6NoMot9wTfzJEQEpb8Ke8jGFoqK28` |
| Checkpoint | 350556156 |
| Gas used | ~0.0107 SUI |

Entry: `attestation::attest(agent, namespace, run_id, artifact_hash, walrus_blob_id, clock, ctx)`
→ freezes `RunAttestation`, emits `Attested`. `artifact_hash` must be 32 bytes (keccak256).

Consumed by `backend/src/config.ts` (`RECALL_PACKAGE_ID`, override via env).
