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

// WHY: a hostile/garbage CURATED_SOURCES env must fall back to the seed, never
// crash boot — matches the project's poisoned-input-doesn't-crash ethos.
test('malformed CURATED_SOURCES env falls back to seed', () => {
  const prev = process.env.CURATED_SOURCES;
  try {
    process.env.CURATED_SOURCES = '{not json';
    assert.ok(resolveSources('walrus').repos.includes('MystenLabs/walrus'));
    process.env.CURATED_SOURCES = '{"a":1}'; // not an array
    assert.ok(resolveSources('walrus').repos.includes('MystenLabs/walrus'));
    // arrays present but elements wrong-typed — must fall back, NOT crash in
    // kw.toLowerCase() / the rssFeeds for-of (regression: shallow Array.isArray gap).
    process.env.CURATED_SOURCES = '[{"match":[null],"repos":[]}]';
    assert.doesNotThrow(() => resolveSources('walrus'));
    assert.ok(resolveSources('walrus').repos.includes('MystenLabs/walrus'));
    process.env.CURATED_SOURCES = '[{"match":["x"],"repos":[],"rssFeeds":123}]';
    assert.doesNotThrow(() => resolveSources('x'));
    assert.ok(resolveSources('walrus').repos.includes('MystenLabs/walrus'));
  } finally {
    if (prev === undefined) delete process.env.CURATED_SOURCES;
    else process.env.CURATED_SOURCES = prev;
  }
});

// WHY: extreme topics (empty, very long, emoji/CJK, special chars) must not throw.
test('extreme topics resolve without throwing', () => {
  for (const t of ['', ' '.repeat(500), '海象 🦭 walrus', 'a&b#c?d', '../../etc']) {
    assert.doesNotThrow(() => resolveSources(t));
  }
});
