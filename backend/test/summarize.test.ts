import { test } from 'node:test';
import assert from 'node:assert';
import { summarizeFresh } from '../src/summarize.js';
import type { Finding } from '../../shared/src/artifact.js';

const f = (over: Partial<Finding>): Finding => ({
  key: 'k',
  title: 'T',
  summary: 's',
  sourceUrl: 'https://x',
  ...over,
});

test('summary is bounded so a giant blob can never bloat the stored artifact', () => {
  // why: summary text lands in the canonical artifact that gets hashed + stored
  // on Walrus; an unbounded field would make the blob (and re-hash cost) explode.
  const out = summarizeFresh([f({ summary: 'x'.repeat(5000) })]);
  assert.ok(out[0].summary.length <= 500);
  assert.ok(out[0].summary.length > 0);
});

test('whitespace is normalized so the same finding canonicalizes identically', () => {
  // why: canonical bytes must be stable for the Verified badge — stray newlines/
  // tabs from scraped sources must not change the hash for otherwise-equal text.
  const out = summarizeFresh([f({ title: 'A', summary: '  multi\n\tline   text  ' })]);
  assert.equal(out[0].summary, 'A: multi line text');
});

test('identity fields are preserved (only summary is rewritten)', () => {
  // why: key/sourceUrl drive dedup + on-chain provenance; summarizer must not touch them.
  const out = summarizeFresh([f({ key: 'k1', sourceUrl: 'https://src' })]);
  assert.equal(out[0].key, 'k1');
  assert.equal(out[0].sourceUrl, 'https://src');
});

// --- Monkey testing ---

test('empty input returns empty, does not throw', () => {
  assert.deepEqual(summarizeFresh([]), []);
});

test('empty title and summary still produce a non-empty bounded string', () => {
  const out = summarizeFresh([f({ title: '', summary: '' })]);
  assert.ok(out[0].summary.length > 0);
  assert.ok(out[0].summary.length <= 500);
});

test('input array is not mutated (pure)', () => {
  const input = [f({ summary: '  pad  ' })];
  const snapshot = JSON.stringify(input);
  summarizeFresh(input);
  assert.equal(JSON.stringify(input), snapshot);
});
