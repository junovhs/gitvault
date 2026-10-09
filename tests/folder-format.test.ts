import assert from 'node:assert/strict';
import { test } from 'node:test';
import { packFolder, unpackFolder, MAX_FOLDER_BYTES, MAX_FOLDER_CONTAINER } from '../src/folder-format.js';
import { encrypt, decrypt } from '../src/crypto.js';
import { generateIdentity, identityToRecipient } from 'age-encryption';
const utf8 = new TextEncoder();

test('folder container preserves private paths, binary content and empty files', () => {
  const original = [{ path: 'plans/strategy.md', bytes: utf8.encode('# Private') }, { path: 'binary.bin', bytes: new Uint8Array([0, 255, 128]) }, { path: 'empty.txt', bytes: new Uint8Array() }];
  assert.deepEqual(unpackFolder(packFolder(original)), original);
});
test('standard age encryption hides both internal names and contents', async () => {
  const identity = await generateIdentity(); const recipient = await identityToRecipient(identity);
  const original = [{ path: 'confidential-names-only-inside/strategy.md', bytes: utf8.encode('private-folder-test-content') }];
  const cipher = await encrypt(packFolder(original), { recipient });
  assert.ok(!new TextDecoder().decode(cipher).includes('confidential-names-only-inside'));
  assert.deepEqual(unpackFolder(await decrypt(cipher, { identity })), original);
});
test('folder format rejects traversal, aliases and file-directory collisions', () => {
  const file = (path: string) => ({ path, bytes: new Uint8Array() });
  for (const paths of [['../escape'], ['a', 'a/b'], ['a.md', 'A.md'], ['Caf\u00e9', 'Cafe\u0301'], ['NUL.txt']]) assert.throws(() => packFolder(paths.map(file)));
});
test('folder format rejects unbounded input before decoding files', () => {
  assert.throws(() => packFolder(Array.from({ length: 129 }, (_, i) => ({ path: i + '.txt', bytes: new Uint8Array() }))), /128/);
  assert.throws(() => packFolder([{ path: 'large', bytes: new Uint8Array(MAX_FOLDER_BYTES + 1) }]), /8 MiB/);
  assert.throws(() => unpackFolder(new Uint8Array(MAX_FOLDER_CONTAINER + 1)), /12 MiB/);
});
test('folder format accepts no malformed encodings or unsupported versions', () => {
  const raw = (data: unknown) => utf8.encode(JSON.stringify(data));
  assert.throws(() => unpackFolder(raw({ format: 'gitvault-folder', version: 2, files: [] })), /Unsupported/);
  assert.throws(() => unpackFolder(raw({ format: 'gitvault-folder', version: 1, files: [{ path: 'a', data: 'not base64!' }] })), /encoding/);
  assert.throws(() => unpackFolder(raw({ format: 'gitvault-folder', version: 1, files: [{ path: '../escape', data: '' }] })), /Unsafe/);
});
