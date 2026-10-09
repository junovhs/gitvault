import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encrypt, decrypt, utf8, text } from '../src/crypto.js';

test('age passphrase roundtrip', async () => {
  const plaintext=utf8.encode('# Private note\nhello');
  const encrypted=await encrypt(plaintext,{passphrase:'a deliberately long passphrase for testing'});
  assert.notDeepEqual(encrypted,plaintext);
  assert.equal(text.decode(await decrypt(encrypted,{passphrase:'a deliberately long passphrase for testing'})),'# Private note\nhello');
  await assert.rejects(decrypt(encrypted,{passphrase:'the wrong passphrase'}));
});
