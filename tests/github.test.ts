import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentsUrl, fetchBytes, fetchDirectory } from '../src/github.js';

test('GitHub paths and refs are encoded independently', () => {
  const url = new URL(contentsUrl('owner/repo', 'private/a b.md.age', 'feature/a'));
  assert.equal(url.pathname, '/repos/owner/repo/contents/private/a%20b.md.age');
  assert.equal(url.searchParams.get('ref'), 'feature/a');
  assert.throws(() => contentsUrl('https://evil.test', 'x'));
  assert.throws(() => contentsUrl('o/r', '../x'));
});
test('raw fetch uses no credentials and never relies on a JSON base64 content field', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    assert.equal(init?.credentials, 'omit');
    assert.equal((init?.headers as Record<string, string>).Accept, 'application/vnd.github.raw+json');
    return new Response(new Uint8Array([0, 1, 255]));
  });
  assert.deepEqual(await fetchBytes('o/r', 'file.age'), new Uint8Array([0, 1, 255]));
});
test('rate limits produce actionable messages', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 429 }));
  await assert.rejects(fetchDirectory('o/r'), /limited/);
});
