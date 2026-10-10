import { Encrypter, Decrypter, armor } from 'age-encryption';

export type EncryptionSecret = { passphrase: string } | { recipient: string };
export type DecryptionSecret = { passphrase: string } | { identity: string };
export const utf8 = new TextEncoder();
export const text = new TextDecoder('utf-8', { fatal: true });
const MAX_CIPHERTEXT = 24 * 1024 * 1024;

/** Resource limits are application policy, not changes to the age cryptography. */
export function ciphertextBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length > MAX_CIPHERTEXT) throw new Error('Encrypted file exceeds the 24 MiB prototype limit');
  const prefix = new TextDecoder().decode(bytes.subarray(0, 40));
  const raw = prefix.startsWith('-----BEGIN AGE ENCRYPTED FILE-----') ? armor.decode(text.decode(bytes)) : bytes;
  const header = new TextDecoder().decode(raw.subarray(0, 65536));
  const end = header.indexOf('\n--- ');
  if (!header.startsWith('age-encryption.org/v1\n') || end < 0) throw new Error('Invalid age header or header exceeds the 64 KiB limit');
  // A malicious public file must not be allowed to request arbitrarily expensive scrypt work.
  for (const line of header.slice(0, end).split('\n')) {
    const match = line.match(/^-> scrypt \S+ (\d+)$/);
    if (match && Number(match[1]) > 18) throw new Error('This file requests a scrypt work factor above this app\'s limit (18). Use a trusted desktop age tool.');
  }
  return raw;
}
/** Which unlock methods an age file accepts, read from its public header stanza types. */
export type LockKind = 'password' | 'key' | 'passkey';
export function lockKinds(bytes: Uint8Array): Set<LockKind> {
  const raw = ciphertextBytes(bytes);
  const header = new TextDecoder().decode(raw.subarray(0, 65536));
  const kinds = new Set<LockKind>();
  for (const line of header.slice(0, header.indexOf('\n--- ')).split('\n')) {
    const type = line.match(/^-> (\S+)/)?.[1];
    if (type === 'scrypt') kinds.add('password');
    else if (type === 'X25519') kinds.add('key');
    else if (type === 'age-encryption.org/fido2prf') kinds.add('passkey');
  }
  return kinds;
}
export async function encrypt(bytes: Uint8Array, secret: EncryptionSecret): Promise<Uint8Array> {
  const e = new Encrypter();
  if ('passphrase' in secret) { if (!secret.passphrase) throw new Error('Password is required'); e.setPassphrase(secret.passphrase); }
  else { if (!secret.recipient) throw new Error('Public recipient is required'); e.addRecipient(secret.recipient.trim()); }
  return new Uint8Array(await e.encrypt(bytes));
}
export async function decrypt(bytes: Uint8Array, secret: DecryptionSecret): Promise<Uint8Array> {
  const raw = ciphertextBytes(bytes);
  const d = new Decrypter();
  if ('passphrase' in secret) d.addPassphrase(secret.passphrase);
  else {
    const identity = secret.identity.split(/\r?\n/).find(line => line.trim().startsWith('AGE-SECRET-KEY-'))?.trim();
    if (!identity) throw new Error('Expected an age private identity, not a public recipient');
    d.addIdentity(identity);
  }
  return new Uint8Array(await d.decrypt(raw));
}
