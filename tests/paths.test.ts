import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeRelative, confined, viewerUrl } from '../src/paths.js';
import { validRepo } from '../src/locator.js';

test('reject traversal, control characters, Windows paths and Git internals', () => {
  for (const p of ['../secret', '/etc/passwd', 'a/../b', '', 'a//b', './x', 'C:/temp', 'a\\b', 'a\0b', 'a\nb', '.git/config', 'x/.GIT/config', 'a./b']) assert.throws(() => safeRelative(p), undefined, p);
});
test('confine valid files', () => {
  assert.equal(safeRelative('private/strategy.md'), 'private/strategy.md');
  assert.ok(confined('/tmp/example', 'private/strategy.md').endsWith('/private/strategy.md'));
  assert.ok(validRepo('owner/repo'));
  assert.ok(!validRepo('owner/repo/extra'));
});
test('viewer URL carries only public pointers in a fragment', () => {
  const url = new URL(viewerUrl('https://example.com/vault/?old=1', 'owner/repo', 'private/strategy.md.age', 'main'));
  assert.equal(url.search, '');
  const params = new URLSearchParams(url.hash.slice(1));
  assert.equal(params.get('repo'), 'owner/repo');
  assert.equal(params.get('file'), 'private/strategy.md.age');
  assert.deepEqual([...params.keys()].sort(), ['file', 'ref', 'repo']);
  assert.throws(() => viewerUrl('javascript:alert(1)', 'o/r', 'file.age'));
  assert.throws(() => viewerUrl('http://example.com', 'o/r', 'file.age'));
});
