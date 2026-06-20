// Chain config — isolated module so pure-function tests never pull env/IO.
// recall::attestation published to testnet (immutable package, tx Czy75K6uYfT4DGV6NoMot9wTfzJEQEpb8Ke8jGFoqK28).

export const SUI_NETWORK = process.env.SUI_NETWORK ?? 'testnet';

// Immutable on-chain — safe as a default. Override via env for other networks/redeploys.
export const RECALL_PACKAGE_ID =
  process.env.RECALL_PACKAGE_ID ??
  '0x29954144279209ff5cac9e81f921ca8ad523cd5c4c2fc8093b5bfd75c63d33a4';

export const RECALL_MODULE = 'attestation';
export const RECALL_ATTEST_TARGET = `${RECALL_PACKAGE_ID}::${RECALL_MODULE}::attest` as const;

// MemWal — still placeholder until account is provisioned (blocks Task 7+).
export const MEMWAL_PACKAGE_ID =
  process.env.MEMWAL_PACKAGE_ID ?? '0xcf6ad7000000000000000000000000000000000000000000000000000000229c6';
