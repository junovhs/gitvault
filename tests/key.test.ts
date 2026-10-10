import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateIdentity, identityToRecipient, webauthn } from 'age-encryption';
import { encodeCredential, parseIdentity, recoveryFile } from '../src/key.js';
import { lockKinds, encrypt } from '../src/crypto.js';
import { parseRepoInput } from '../src/locator.js';

test('credential encoding matches age-encryption\'s own fido2prf identity format', () => {
  const credId = new Uint8Array(70).map((_, i) => i * 7);
  const encoded = encodeCredential(credId, 'junovhs.github.io', ['hybrid', 'internal']);
  assert.match(encoded, /^AGE-PLUGIN-FIDO2PRF-1[02-9AC-HJ-NP-Z]+$/);
  // The library's own decoder accepts it and recovers the exact fields.
  const identity = new webauthn.WebAuthnIdentity({ identity: encoded }) as unknown as { credId: Uint8Array; rpId: string; transports: string[] };
  assert.deepEqual([...identity.credId], [...credId]);
  assert.equal(identity.rpId, 'junovhs.github.io');
  assert.deepEqual(identity.transports, ['hybrid', 'internal']);
});

test('recovery files are standard age identity files', async () => {
  const secret = await generateIdentity(); const recipient = await identityToRecipient(secret);
  const file = recoveryFile(secret, recipient, new Date(0));
  assert.equal(parseIdentity(file), secret);
  assert.ok(file.split('\n').filter(l => l && !l.startsWith('#')).every(l => l === secret));
  assert.throws(() => parseIdentity('# public key: ' + recipient), /does not contain an age private key/);
});

test('lock kinds are read from the public age header', async () => {
  const recipient = await identityToRecipient(await generateIdentity());
  assert.deepEqual([...lockKinds(await encrypt(new Uint8Array([1]), { recipient }))], ['key']);
  assert.deepEqual([...lockKinds(await encrypt(new Uint8Array([1]), { passphrase: 'a long test passphrase' }))], ['password']);
  assert.throws(() => lockKinds(new TextEncoder().encode('age-encryption.org/v1\n-> scrypt AAAAAAAAAAAAAAAAAAAAAA 31\nAAAA\n--- AAAA\n')), /work factor/);
});

test('repo input accepts names and pasted GitHub URLs, and nothing else', () => {
  assert.deepEqual(parseRepoInput('junovhs/gitvault'), { repo: 'junovhs/gitvault' });
  assert.deepEqual(parseRepoInput(' https://github.com/junovhs/gitvault/ '), { repo: 'junovhs/gitvault' });
  assert.deepEqual(parseRepoInput('github.com/junovhs/gitvault.git'), { repo: 'junovhs/gitvault' });
  assert.deepEqual(parseRepoInput('git@github.com:junovhs/gitvault.git'), { repo: 'junovhs/gitvault' });
  assert.deepEqual(parseRepoInput('https://github.com/a/b/tree/main/docs/private'), { repo: 'a/b', ref: 'main', dir: 'docs/private' });
  assert.deepEqual(parseRepoInput('https://github.com/a/b/blob/dev/private/plan.md.age'), { repo: 'a/b', ref: 'dev', dir: 'private' });
  for (const bad of ['', 'gitvault', 'https://evil.example/a/b', 'a/b/issues', '../x/y', 'a/..']) assert.equal(parseRepoInput(bad), null, bad);
});
