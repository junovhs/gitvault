import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeRelative, confined, viewerUrl } from '../src/paths.js';

test('reject unsafe paths', () => {
  for (const p of ['../secret', '/etc/passwd', 'a/../b', '', 'a//b', './x']) assert.throws(() => safeRelative(p));
});
test('normalize separator and stay confined', () => {
  assert.equal(safeRelative('private/strategy.md'), 'private/strategy.md');
  assert.ok(confined('/tmp/example', 'private/strategy.md').endsWith('/private/strategy.md'));
});
test('viewer URL never carries a secret', () => {
  const url = new URL(viewerUrl('https://example.com/vault/', 'owner/repo', 'private/strategy.md.age'));
  assert.equal(url.searchParams.get('repo'), 'owner/repo');
  assert.equal(url.searchParams.get('file'), 'private/strategy.md.age');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['file', 'repo']);
});
