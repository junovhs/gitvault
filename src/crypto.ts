import { Encrypter, Decrypter, armor } from 'age-encryption';

export type EncryptionSecret = { passphrase: string } | { recipient: string };
export type DecryptionSecret = { passphrase: string } | { identity: string };
export const utf8 = new TextEncoder();
export const text = new TextDecoder('utf-8', { fatal: true });

export function ciphertextBytes(bytes: Uint8Array): Uint8Array {
  const prefix = new TextDecoder().decode(bytes.subarray(0, 40));
  return prefix.startsWith('-----BEGIN AGE ENCRYPTED FILE-----') ? armor.decode(text.decode(bytes)) : bytes;
}
export async function encrypt(bytes: Uint8Array, secret: EncryptionSecret): Promise<Uint8Array> {
  const e = new Encrypter();
  if ('passphrase' in secret) { if (!secret.passphrase) throw new Error('Password is required'); e.setPassphrase(secret.passphrase); }
  else { if (!secret.recipient) throw new Error('Public recipient is required'); e.addRecipient(secret.recipient.trim()); }
  return new Uint8Array(await e.encrypt(bytes));
}
export async function decrypt(bytes: Uint8Array, secret: DecryptionSecret): Promise<Uint8Array> {
  const d = new Decrypter();
  if ('passphrase' in secret) d.addPassphrase(secret.passphrase);
  else {
    const identity = secret.identity.split(/\r?\n/).find(line => line.trim().startsWith('AGE-SECRET-KEY-'))?.trim();
    if (!identity) throw new Error('Expected an age private identity, not a public recipient');
    d.addIdentity(identity);
  }
  return new Uint8Array(await d.decrypt(ciphertextBytes(bytes)));
}
