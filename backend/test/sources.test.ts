import { test } from 'node:test';
import assert from 'node:assert';
import { resolveSources } from '../src/sources.js';

// WHY: keyword (substring) match, not exact string — 'Walrus ecosystem' and
// 'sui walrus' must both reach the curated walrus repos so the existing
// 30-finding demo topic keeps growing leaves without an exact-string label.
test('keyword match is case-insensitive substring', () => {
  const s = resolveSources('Walrus ecosystem');
  assert.ok(s.repos.includes('MystenLabs/walrus'));
});

// WHY: multiple matched entries union their sources (and dedupe), so a
// cross-cutting topic pulls every relevant feed at once.
test('multiple matches union repos and dedupe', () => {
  const s = resolveSources('sui walrus');
  assert.ok(s.repos.includes('MystenLabs/walrus'));    // walrus entry
  assert.ok(s.repos.includes('MystenLabs/sui'));       // sui entry
  assert.strictEqual(new Set(s.repos).size, s.repos.length); // no dupes
});

// WHY: an unmapped topic must yield EMPTY sources so run.ts falls through to
// the search fallback instead of silently reusing a default feed.
test('no keyword match yields empty sources', () => {
  const s = resolveSources('zzz nonexistent quux');
  assert.deepStrictEqual(s, { repos: [], rssFeeds: [] });
});

// WHY: repo strings are verbatim canonical full_name — lowercasing would break
// dedup against existing `gh:MystenLabs/...` memory keys.
test('repos preserve canonical casing (never lowercased)', () => {
  const s = resolveSources('walrus');
  assert.ok(s.repos.every((r) => r === r.trim() && /[A-Z]/.test(r.split('/')[0])));
});
