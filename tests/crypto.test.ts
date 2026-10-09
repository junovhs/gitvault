import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { encrypt, decrypt, utf8, text } from '../src/crypto.js';

test('age password roundtrip and wrong-password rejection', async () => {
  const original = '# Private note\nhello';
  const passphrase = 'a deliberately long passphrase for testing';
  const encrypted = await encrypt(utf8.encode(original), { passphrase });
  assert.notDeepEqual(encrypted, utf8.encode(original));
  assert.equal(text.decode(await decrypt(encrypted, { passphrase })), original);
  await assert.rejects(decrypt(encrypted, { passphrase: 'the wrong passphrase' }));
});
test('recipient mode roundtrips binary data and detects tampering', async () => {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  const bytes = new Uint8Array([0, 255, 128, 0, 10]);
  const encrypted = await encrypt(bytes, { recipient });
  assert.deepEqual(await decrypt(encrypted, { identity }), bytes);
  encrypted[encrypted.length - 1] ^= 1;
  await assert.rejects(decrypt(encrypted, { identity }));
});
