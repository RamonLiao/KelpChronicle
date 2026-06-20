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
  const withSortedFindings = {
    ...a,
    findings: [...a.findings].sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0)),
  };
  return JSON.stringify(sortObj(withSortedFindings));
}

export function artifactHashHex(a: Artifact): string {
  return bytesToHex(keccak_256(new TextEncoder().encode(canonicalize(a))));
}
