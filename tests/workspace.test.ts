import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isConcealedFolder, workspaceItem } from '../src/workspace.js';

test('concealed folder is a single private-folder item leading to the correct viewer', () => {
  const entry = { name: 'private-notes.gvfolder.age', path: 'private/private-notes.gvfolder.age', type: 'file', size: 700 };
  assert.equal(isConcealedFolder(entry), true);
  const item = workspaceItem('example/repo', 'feature/private', entry);
  assert.equal(item.label, 'private-notes');
  assert.equal(item.detail, 'Private folder · names hidden');
  assert.equal(item.action, 'Unlock');
  assert.equal(item.locked, true);
  assert.equal(item.isFolder, false);
  assert.ok(item.href.startsWith('./folder.html#'));
  const url = new URL('https://example.test/gitvault/' + item.href);
  const params = new URLSearchParams(url.hash.slice(1));
  assert.equal(params.get('repo'), 'example/repo');
  assert.equal(params.get('file'), entry.path);
  assert.equal(params.get('ref'), 'feature/private');
  assert.deepEqual([...params.keys()].sort(), ['file','ref','repo']);
  assert.ok(!item.href.includes('AGE-SECRET-KEY'));
});

test('ordinary documents and public folders retain normal routes', () => {
  const document = workspaceItem('example/repo', '', { name: 'plan.md.age', path: 'private/plan.md.age', type: 'file', size: 125 });
  assert.equal(document.label, 'plan.md');
  assert.equal(document.detail, 'Encrypted document');
  assert.ok(document.href.startsWith('#'));
  assert.ok(!document.href.startsWith('./folder.html'));
  assert.equal(workspaceItem('example/repo', '', { name: 'plan.md.age', path: 'private/plan.md.age', type: 'file', size: 125 }, true).label, 'plan.md.age');
  const directory = workspaceItem('example/repo', 'main', { name: 'src', path: 'src', type: 'dir', size: 0 });
  assert.equal(directory.isFolder, true);
  assert.equal(directory.detail, 'Public folder');
  assert.equal(directory.action, 'Open');
  assert.equal(new URLSearchParams(directory.href.slice(1)).get('dir'), 'src');
});
