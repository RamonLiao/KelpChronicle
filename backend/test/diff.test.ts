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
  const candidates = [
    { key: 'a', title: '', summary: '', sourceUrl: '' },
    { key: 'c', title: '', summary: '', sourceUrl: '' },
  ];
  assert.strictEqual(computeDelta(known, candidates).fresh.length, 0);
});

test('dedupes repeated keys within candidates', () => {
  const c = [
    { key: 'x', title: '', summary: '', sourceUrl: '' },
    { key: 'x', title: '', summary: '', sourceUrl: '' },
  ];
  assert.strictEqual(computeDelta(new Set(), c).fresh.length, 1);
});

test('known hit counts each occurrence, even repeated known keys', () => {
  const known = new Set(['a']);
  const c = [
    { key: 'a', title: '', summary: '', sourceUrl: '' },
    { key: 'a', title: '', summary: '', sourceUrl: '' },
    { key: 'b', title: '', summary: '', sourceUrl: '' },
  ];
  const { fresh, knownHit } = computeDelta(known, c);
  assert.deepStrictEqual(fresh.map((f) => f.key), ['b']);
  assert.strictEqual(knownHit, 2);
});
