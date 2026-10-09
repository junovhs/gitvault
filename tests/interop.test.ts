import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { encrypt, decrypt } from '../src/crypto.js';

const binary = process.env.GITVAULT_AGE_BINARY;
test('official age CLI and GitVault read each other\'s ciphertext (including armor)', { skip: !binary && 'Set GITVAULT_AGE_BINARY=age to enable the reference-implementation check' }, async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'gitvault-interop-')); t.after(() => rm(temp, { recursive: true, force: true }));
  const identity = await generateIdentity(); const recipient = await identityToRecipient(identity);
  const plaintext = Buffer.from('Interoperability test\nUnicode: \u2603\nBinary byte: \0\n');
  const key = path.join(temp, 'identity.txt'); await writeFile(key, identity + '\n', { mode: 0o600 });
  const ours = path.join(temp, 'gitvault.age'); await writeFile(ours, await encrypt(plaintext, { recipient }));
  const restored = execFileSync(binary!, ['--decrypt', '--identity', key, ours]);
  assert.deepEqual(restored, plaintext);
  const original = path.join(temp, 'original.bin'); await writeFile(original, plaintext);
  const armored = execFileSync(binary!, ['--encrypt', '--armor', '--recipient', recipient, original]);
  assert.deepEqual(Buffer.from(await decrypt(armored, { identity })), plaintext);
});
