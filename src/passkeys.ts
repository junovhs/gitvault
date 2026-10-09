import { Encrypter, Decrypter, generateIdentity, identityToRecipient, webauthn } from 'age-encryption';
import { ciphertextBytes } from './crypto.js';

export function passkeysAvailable(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials;
}
function requirePasskeys(): void {
  if (!passkeysAvailable()) throw new Error('Passkeys need a compatible browser on HTTPS or localhost. Use password or age identity mode instead.');
}
export async function createPasskey(): Promise<string> {
  requirePasskeys();
  return webauthn.createCredential({ keyName: 'GitVault encryption (experimental)', rpId: location.hostname });
}
export async function createRecoveryKey(): Promise<{ identity: string; recipient: string }> {
  const identity = await generateIdentity();
  return { identity, recipient: await identityToRecipient(identity) };
}

/** Standard age recipient composition: passkey PRF plus an independent X25519 recovery recipient. */
export async function encryptWithPasskey(bytes: Uint8Array, hint: string, recoveryRecipient: string): Promise<Uint8Array> {
  requirePasskeys();
  if (bytes.length > 16 * 1024 * 1024) throw new Error('Passkey prototype limit: 16 MiB per file');
  if (!hint || !recoveryRecipient.startsWith('age1')) throw new Error('Both a passkey and an independent recovery recipient are required');
  const encrypter = new Encrypter();
  encrypter.addRecipient(new webauthn.WebAuthnRecipient({ identity: hint }));
  encrypter.addRecipient(recoveryRecipient);
  return new Uint8Array(await encrypter.encrypt(bytes));
}
export async function decryptWithPasskey(bytes: Uint8Array): Promise<Uint8Array> {
  requirePasskeys();
  const raw = ciphertextBytes(bytes);
  const decrypter = new Decrypter();
  decrypter.addIdentity(new webauthn.WebAuthnIdentity({ rpId: location.hostname }));
  return new Uint8Array(await decrypter.decrypt(raw));
}
