import { test } from 'node:test';
import assert from 'node:assert';
import { mapGithubRelease } from '../src/fetch.js';

test('maps a github release to a Finding with a stable key', () => {
  const f = mapGithubRelease({
    repo: 'MystenLabs/walrus',
    tag_name: 'v1.2.0',
    name: 'Walrus 1.2',
    body: 'notes',
    html_url: 'https://x',
  });
  assert.strictEqual(f.key, 'gh:MystenLabs/walrus@v1.2.0');
  assert.strictEqual(f.title, 'Walrus 1.2');
  assert.strictEqual(f.sourceUrl, 'https://x');
});

// WHY: the cross-run dedup key must be stable for the SAME release regardless
// of how often we fetch it. If title/body leaked into the key, an edited
// release body would re-surface as "fresh" and pollute the Verified delta.
test('key depends only on repo + tag, not on mutable fields', () => {
  const a = mapGithubRelease({ repo: 'a/b', tag_name: 'v1', name: 'X', body: 'one', html_url: 'u1' });
  const b = mapGithubRelease({ repo: 'a/b', tag_name: 'v1', name: 'Y', body: 'two', html_url: 'u2' });
  assert.strictEqual(a.key, b.key);
});

// WHY: GitHub releases often have an empty `name`; tag must be the fallback
// label so the Finding is never blank in the UI/artifact.
test('falls back to tag_name when name is empty', () => {
  const f = mapGithubRelease({ repo: 'a/b', tag_name: 'v9', name: '', body: '', html_url: 'u' });
  assert.strictEqual(f.title, 'v9');
});

// WHY: release bodies can be huge; artifact canonical JSON must stay bounded,
// so summary is capped. Encodes the 1000-char cap as an intentional contract.
test('truncates body to 1000 chars for summary', () => {
  const big = 'x'.repeat(5000);
  const f = mapGithubRelease({ repo: 'a/b', tag_name: 'v1', name: 'n', body: big, html_url: 'u' });
  assert.strictEqual(f.summary.length, 1000);
});
