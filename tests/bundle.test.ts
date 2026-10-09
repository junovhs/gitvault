import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { createBundle } from '../src/bundle.js';

test('GitHub bundle includes ciphertext, landing page and QR only', async () => {
  const ciphertext = new Uint8Array([1, 2, 3, 255]);
  const bundle = await createBundle(ciphertext, { repo: 'owner/repo', output: 'private', name: 'team/strategy.md', viewer: 'https://example.com/vault/', ref: 'main' });
  const files = unzipSync(bundle.zip);
  assert.deepEqual(Object.keys(files).sort(), ['private/team/strategy.md', 'private/team/strategy.md.age', 'private/team/strategy.md.qr.svg']);
  assert.deepEqual(files['private/team/strategy.md.age'], ciphertext);
  assert.match(strFromU8(files['private/team/strategy.md.qr.svg']), /<svg/);
  const landing = strFromU8(files['private/team/strategy.md']);
  assert.match(landing, /\.\/strategy.md.qr.svg/);
  assert.match(landing, /\.\/strategy.md.age/);
  assert.equal(new URL(bundle.url).search, '');
  assert.ok(!Object.keys(files).some(p => /identity|password|plain/.test(p)));
});
test('non-Markdown input receives a Markdown landing page', async () => {
  const bundle = await createBundle(new Uint8Array([1]), { repo: 'o/r', output: 'private', name: 'notes.txt', viewer: 'https://example.com' });
  assert.ok(unzipSync(bundle.zip)['private/notes.txt.md']);
});
test('bundle rejects unsafe output names and non-HTTPS viewer origins', async () => {
  await assert.rejects(createBundle(new Uint8Array(), { repo: 'o/r', output: '../escape', name: 'a.md', viewer: 'https://example.com' }));
  await assert.rejects(createBundle(new Uint8Array(), { repo: 'o/r', output: 'private', name: 'a.md', viewer: 'http://example.com' }));
});
