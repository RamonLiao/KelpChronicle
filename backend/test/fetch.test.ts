import { test } from 'node:test';
import assert from 'node:assert';
import { mapGithubRelease, parseReleases, parseRssFeed, fetchCandidates, parseHnSearch, searchCandidates, dedupeByKey } from '../src/fetch.js';

// Minimal fake Response for injected fetch — only the bits fetchCandidates uses.
function fakeRes(body: unknown, { ok = true, text = false } = {}) {
  return {
    ok,
    json: async () => body,
    text: async () => (text ? (body as string) : JSON.stringify(body)),
  } as unknown as Response;
}

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

// --- Monkey: parseReleases must never emit a malformed key from bad input ---
// WHY: GitHub can return an error object or entries missing tag_name. A Finding
// with key `gh:repo@undefined` would corrupt cross-run dedup, so such input
// must be dropped, not mapped.
test('parseReleases drops non-array and malformed entries', () => {
  assert.deepStrictEqual(parseReleases('a/b', { message: 'rate limited' }), []);
  assert.deepStrictEqual(parseReleases('a/b', null), []);
  const mixed = [{ tag_name: 'v1', name: 'ok', body: '', html_url: 'u' }, { name: 'no-tag' }, 42, null];
  const keys = parseReleases('a/b', mixed).map((f) => f.key);
  assert.deepStrictEqual(keys, ['gh:a/b@v1']);
});

// --- RSS mapping ---
// WHY: RSS fallback shares the stable-key contract. key=rss:<guid>; entries
// without a guid/link have no stable identity and must be dropped.
test('parseRssFeed maps items to rss: keyed Findings', () => {
  const xml = `<rss><channel>
    <item><guid>g-1</guid><title>First</title><link>https://l1</link><description>d1</description></item>
    <item><title>no guid no link</title></item>
    <item><link>https://l2</link><title><![CDATA[Second]]></title></item>
  </channel></rss>`;
  const out = parseRssFeed(xml);
  assert.deepStrictEqual(out.map((f) => f.key), ['rss:g-1', 'rss:https://l2']);
  assert.strictEqual(out[0].title, 'First');
  assert.strictEqual(out[1].title, 'Second'); // CDATA + link-as-guid fallback
});

// WHY: RSS guid is often an opaque UUID, not a URL. Using it as sourceUrl
// produces a dead link. sourceUrl must stay empty unless a real URL exists.
test('parseRssFeed never puts a non-URL guid into sourceUrl', () => {
  const xml = `<rss><channel>
    <item><guid>urn:uuid:abc-123</guid><title>opaque</title></item>
  </channel></rss>`;
  const [f] = parseRssFeed(xml);
  assert.strictEqual(f.key, 'rss:urn:uuid:abc-123');
  assert.strictEqual(f.sourceUrl, '');
});

// WHY (red team): a hostile RSS feed can inject `javascript:` as <link>.
// sourceUrl must reject any non-http(s) scheme so the UI can't render an XSS link.
test('parseRssFeed rejects javascript: and other unsafe link schemes', () => {
  const xml = `<rss><channel>
    <item><guid>g</guid><title>evil</title><link>javascript:alert(1)</link></item>
  </channel></rss>`;
  const [f] = parseRssFeed(xml);
  assert.strictEqual(f.sourceUrl, '');
});

// WHY: feeds emit `&amp;` in URLs/titles; leaving it un-decoded yields a wrong
// URL and literal `&amp;` in the UI. Encodes the decode contract.
test('parseRssFeed decodes XML entities in title and link', () => {
  const xml = `<rss><channel>
    <item><guid>g</guid><title>A &amp; B &lt;tag&gt;</title><link>https://x?a=1&amp;b=2</link></item>
  </channel></rss>`;
  const [f] = parseRssFeed(xml);
  assert.strictEqual(f.title, 'A & B <tag>');
  assert.strictEqual(f.sourceUrl, 'https://x?a=1&b=2');
});

// Monkey: an out-of-range numeric entity must not RangeError-sink the feed.
// WHY: one malformed item shouldn't drop every valid item in the same feed.
test('parseRssFeed survives out-of-range numeric entities', () => {
  const xml = `<rss><channel>
    <item><guid>g1</guid><title>bad &#x110000; ok</title><link>https://l</link></item>
    <item><guid>g2</guid><title>good</title><link>https://l2</link></item>
  </channel></rss>`;
  const out = parseRssFeed(xml);
  assert.deepStrictEqual(out.map((f) => f.key), ['rss:g1', 'rss:g2']);
  assert.strictEqual(out[0].title, 'bad &#x110000; ok'); // literal kept, no throw
});

// Monkey: a feed with 100k items must not blow up parse — cap at 200.
// WHY: bounds CPU/memory against a hostile/runaway feed.
test('parseRssFeed caps item count', () => {
  const one = '<item><guid>g</guid><title>t</title><link>https://l</link></item>';
  const xml = `<rss><channel>${one.repeat(100000)}</channel></rss>`;
  assert.strictEqual(parseRssFeed(xml).length, 200);
});

// --- Integration: GitHub→RSS fallback gating (no real network) ---
// WHY: RSS must fire ONLY when GitHub yields nothing, or it would duplicate the
// primary feed. This pins the gating that the dedup contract depends on.
test('fetchCandidates does NOT hit RSS when GitHub returns results', async () => {
  let rssCalls = 0;
  const fetchImpl = (async (url: string) => {
    if (url.includes('api.github.com')) {
      return fakeRes([{ tag_name: 'v1', name: 'R', body: '', html_url: 'u' }]);
    }
    rssCalls++;
    return fakeRes('<rss></rss>', { text: true });
  }) as unknown as typeof fetch;
  const out = await fetchCandidates({ fetchImpl, repos: ['a/b'], rssFeeds: ['https://feed'] });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(rssCalls, 0);
});

test('fetchCandidates falls back to RSS only when GitHub is empty', async () => {
  const fetchImpl = (async (url: string) => {
    if (url.includes('api.github.com')) return fakeRes(null, { ok: false }); // all repos fail
    return fakeRes('<rss><channel><item><guid>g1</guid><title>T</title><link>https://l</link></item></channel></rss>', { text: true });
  }) as unknown as typeof fetch;
  const out = await fetchCandidates({ fetchImpl, repos: ['a/b'], rssFeeds: ['https://feed'] });
  // key is namespaced by feed URL so opaque guids can't collide across feeds.
  assert.deepStrictEqual(out.map((f) => f.key), ['rss:https://feed#g1']);
});

// WHY: identical opaque guid in two different feeds must NOT dedup to one key.
test('parseRssFeed namespaces keys by feedId to avoid cross-feed collision', () => {
  const item = `<rss><channel><item><guid>dup</guid><title>t</title><link>https://l</link></item></channel></rss>`;
  const a = parseRssFeed(item, 'https://feedA');
  const b = parseRssFeed(item, 'https://feedB');
  assert.notStrictEqual(a[0].key, b[0].key);
  assert.strictEqual(a[0].key, 'rss:https://feedA#dup');
});

// Monkey: every dep throws / returns garbage — must degrade to [] not throw.
test('fetchCandidates never throws when everything fails', async () => {
  const fetchImpl = (async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;
  const out = await fetchCandidates({ fetchImpl, repos: ['a/b', 'c/d'], rssFeeds: ['https://feed'] });
  assert.deepStrictEqual(out, []);
});

// --- HN Algolia mapping ---
// WHY: HN key must be the stable objectID so the same story dedupes across runs.
test('parseHnSearch maps a hit with a stable hn:<objectID> key', () => {
  const out = parseHnSearch({ hits: [{ objectID: '42', title: 'Walrus is great', url: 'https://blog/x', story_text: '' }] });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].key, 'hn:42');
  assert.strictEqual(out[0].title, 'Walrus is great');
  assert.strictEqual(out[0].sourceUrl, 'https://blog/x');
});

// WHY: a hostile HN url (javascript:) must NOT become a clickable sourceUrl;
// it falls back to the safe HN item permalink.
test('parseHnSearch rejects non-http url, falls back to HN permalink', () => {
  const out = parseHnSearch({ hits: [{ objectID: '7', title: 't', url: 'javascript:alert(1)' }] });
  assert.strictEqual(out[0].sourceUrl, 'https://news.ycombinator.com/item?id=7');
});

// WHY: malformed payloads (no hits array, missing objectID) must drop quietly,
// never crash recall/diff downstream.
test('parseHnSearch drops malformed hits and non-arrays', () => {
  assert.deepStrictEqual(parseHnSearch({}), []);
  assert.deepStrictEqual(parseHnSearch({ hits: [{ title: 'no id' }] }), []);
});

// WHY: a search-triggered run fans out search→repos→releases AND queries HN;
// both feed the same candidate pool, so the agent discovers topic-relevant
// content beyond the 3 curated repos.
test('searchCandidates fans GitHub search → releases and adds HN hits', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    if (url.includes('/search/repositories')) return fakeRes({ items: [{ full_name: 'acme/foo' }] });
    if (url.includes('/repos/acme/foo/releases')) return fakeRes([{ tag_name: 'v1', name: 'Foo v1', body: 'b', html_url: 'https://gh/foo' }]);
    if (url.includes('hn.algolia.com')) return fakeRes({ hits: [{ objectID: '9', title: 'Foo on HN', url: 'https://hn/foo' }] });
    return fakeRes([], { ok: false });
  }) as unknown as typeof fetch;

  const out = await searchCandidates('foo', { fetchImpl });
  const keys = out.map((f) => f.key).sort();
  assert.deepStrictEqual(keys, ['gh:acme/foo@v1', 'hn:9']);
  // topic is URL-encoded into the query
  assert.ok(calls.some((u) => u.includes('q=foo')));
});

// WHY: the topic goes into a query string — special chars must be encoded so a
// topic like 'a&b' can't break the URL or smuggle params.
test('searchCandidates url-encodes the topic', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => { calls.push(url); return fakeRes({ items: [] }); }) as unknown as typeof fetch;
  await searchCandidates('a&b c', { fetchImpl });
  assert.ok(calls.some((u) => u.includes('a%26b%20c')));
  assert.ok(!calls.some((u) => u.includes('a&b c')));
});

// WHY: one failing source must not kill the run — a bad GitHub search still
// lets HN results through, and vice versa.
test('searchCandidates skips a failing source, keeps the other', async () => {
  const fetchImpl = (async (url: string) => {
    if (url.includes('/search/repositories')) throw new Error('boom');
    if (url.includes('hn.algolia.com')) return fakeRes({ hits: [{ objectID: '1', title: 'x', url: 'https://x' }] });
    return fakeRes([], { ok: false });
  }) as unknown as typeof fetch;
  const out = await searchCandidates('t', { fetchImpl });
  assert.deepStrictEqual(out.map((f) => f.key), ['hn:1']);
});

// WHY: merging curated + search pools can repeat a release; dedupeByKey keeps
// the first occurrence so a node never double-leafs.
test('dedupeByKey keeps first per key', () => {
  const a = { key: 'gh:r@1', title: 'A', summary: '', sourceUrl: '' };
  const b = { key: 'gh:r@1', title: 'B', summary: '', sourceUrl: '' };
  const out = dedupeByKey([a, b]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].title, 'A');
});
