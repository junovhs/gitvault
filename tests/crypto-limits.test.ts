import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ciphertextBytes, decrypt, utf8 } from '../src/crypto.js';

test('reject malicious scrypt work factors before starting key derivation', async () => {
  const hostile = utf8.encode('age-encryption.org/v1\n-> scrypt AAAAAAAAAAAAAAAAAAAAAA 31\nAAAA\n--- AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n');
  assert.throws(() => ciphertextBytes(hostile), /work factor/);
  await assert.rejects(decrypt(hostile, { passphrase: 'test' }), /work factor/);
});
test('reject non-age data and excessively large headers', () => {
  assert.throws(() => ciphertextBytes(utf8.encode('not an age file')), /header/);
  assert.throws(() => ciphertextBytes(utf8.encode('age-encryption.org/v1\n' + 'A'.repeat(70000) + '\n--- MAC\n')), /header/);
});
