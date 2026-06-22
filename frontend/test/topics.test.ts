import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTopics, writeTopics } from '../src/lib/topics.ts';

test('legacy single ?topic=X migrates to [X]', () => {
  assert.deepEqual(parseTopics('?topic=Walrus', 'fallback'), ['Walrus']);
});

test('multiple repeated ?topic= params parse in order', () => {
  assert.deepEqual(parseTopics('?topic=Walrus&topic=Seal', 'fallback'), ['Walrus', 'Seal']);
});

test('empty search yields the fallback', () => {
  assert.deepEqual(parseTopics('', 'Walrus ecosystem'), ['Walrus ecosystem']);
});

test('duplicates deduped, whitespace trimmed, blanks dropped', () => {
  assert.deepEqual(parseTopics('?topic=A&topic=%20A%20&topic=&topic=B', 'f'), ['A', 'B']);
});

test('writeTopics replaces any topic/topics params with repeated topic= (comma-safe)', () => {
  const u = new URL('https://x/?topic=old&topics=stale');
  writeTopics(u, ['a, b', 'c']); // a topic containing a comma must survive
  assert.deepEqual(parseTopics(u.search, 'f'), ['a, b', 'c']);
});
