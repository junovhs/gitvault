import { Encrypter, Decrypter } from 'age-encryption';

/** File format: interoperable age ciphertext. Never implement a custom cipher. */
export async function encrypt(bytes: Uint8Array, secret: { passphrase: string } | { recipient: string }): Promise<Uint8Array> {
  const encoder = new Encrypter();
  if ('passphrase' in secret) encoder.setPassphrase(secret.passphrase);
  else encoder.addRecipient(secret.recipient);
  return new Uint8Array(await encoder.encrypt(bytes));
}

export async function decrypt(bytes: Uint8Array, secret: { passphrase: string } | { identity: string }): Promise<Uint8Array> {
  const decoder = new Decrypter();
  if ('passphrase' in secret) decoder.addPassphrase(secret.passphrase);
  else decoder.addIdentity(secret.identity);
  return new Uint8Array(await decoder.decrypt(bytes));
}

export const utf8 = new TextEncoder();
export const text = new TextDecoder('utf-8', { fatal: true });
