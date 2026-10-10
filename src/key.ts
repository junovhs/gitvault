import { Encrypter, Decrypter, armor, generateIdentity, identityToRecipient, webauthn } from 'age-encryption';
import { bech32 } from '@scure/base';
import { utf8, text } from './crypto.js';

/**
 * Your key: one standard age identity. Files are encrypted to its public recipient, so the
 * age CLI can always open them with the recovery file. A phone or device passkey only unwraps
 * the identity for this tab (WebAuthn PRF over the browser's own hybrid/QR transport); it is
 * never the only copy. The identity is held in memory and never written to storage in plaintext.
 */
export type UnlockerKind = 'phone' | 'device';
export type Unlocker = { kind: UnlockerKind; credential: string; envelope: string; added: string };
export type StoredKey = { v: 1; recipient: string; created: string; unlockers: Unlocker[] };
export type PendingKey = { identity: string; recipient: string; file: string };

const STORE = 'gitvault.key.v1';
const RECIPIENT = /^age1[02-9ac-hj-np-z]{58}$/;
const CREDENTIAL = /^AGE-PLUGIN-FIDO2PRF-1[02-9AC-HJ-NP-Z]+$/;
let identity: string | null = null;
const listeners = new Set<() => void>();
function changed(): void { for (const fn of listeners) fn(); }
export function onKeyChange(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }

export function loadKey(): StoredKey | null {
  try {
    const raw = localStorage.getItem(STORE); if (!raw || raw.length > 65536) return null;
    const k = JSON.parse(raw) as StoredKey;
    if (k?.v !== 1 || !RECIPIENT.test(k.recipient) || !Array.isArray(k.unlockers)) return null;
    k.unlockers = k.unlockers.filter(u => (u.kind === 'phone' || u.kind === 'device') && CREDENTIAL.test(u.credential) && typeof u.envelope === 'string' && u.envelope.length < 8192);
    return k;
  } catch { return null; }
}
function saveKey(k: StoredKey): void { localStorage.setItem(STORE, JSON.stringify(k)); changed(); }
export function forgetKey(): void { identity = null; localStorage.removeItem(STORE); changed(); }
export function isUnlocked(): boolean { return identity !== null; }
export function unlockedIdentity(): string { if (!identity) throw new Error('Your key is locked.'); return identity; }
export function lockKey(): void { if (identity) { identity = null; changed(); } }

export function parseIdentity(content: string): string {
  const found = content.split(/\r?\n/).find(line => line.trim().startsWith('AGE-SECRET-KEY-'))?.trim();
  if (!found) throw new Error('That file does not contain an age private key (AGE-SECRET-KEY-...).');
  return found;
}
/** Same layout as `age-keygen` and `gitvault keygen`, so every age tool accepts it. */
export function recoveryFile(secret: string, recipient: string, created = new Date()): string {
  return '# GitVault recovery key. Anyone with this file can read your private files.\n# Keep it offline and out of every Git repository.\n# created: ' + created.toISOString() + '\n# public key: ' + recipient + '\n' + secret + '\n';
}
export async function createKey(): Promise<PendingKey> {
  const secret = await generateIdentity(); const recipient = await identityToRecipient(secret);
  return { identity: secret, recipient, file: recoveryFile(secret, recipient) };
}
/** Setup completes only after the user hands back the exact recovery file they saved. */
export async function confirmRecovery(pending: PendingKey, saved: string): Promise<void> {
  if (parseIdentity(saved) !== pending.identity) throw new Error('That is not the recovery key created just now. Choose the file you saved.');
  identity = pending.identity;
  saveKey({ v: 1, recipient: pending.recipient, created: new Date().toISOString(), unlockers: [] });
}
/** Unlock with a recovery file. On a device with no key yet, this also sets the key up here. */
export async function unlockWithRecovery(content: string): Promise<void> {
  const secret = parseIdentity(content); const recipient = await identityToRecipient(secret);
  const stored = loadKey();
  if (stored && stored.recipient !== recipient) throw new Error('That recovery key belongs to a different GitVault key than the one on this device.');
  identity = secret;
  if (!stored) saveKey({ v: 1, recipient, created: new Date().toISOString(), unlockers: [] }); else changed();
}

export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials;
}
function cborHead(major: number, n: number): number[] { return n <= 23 ? [(major << 5) | n] : n <= 0xff ? [(major << 5) | 24, n] : [(major << 5) | 25, n >> 8, n & 0xff]; }
/** Encodes a credential exactly like age-encryption's createCredential, which cannot pass WebAuthn hints. */
export function encodeCredential(credId: Uint8Array, rpId: string, transports: string[]): string {
  const rp = utf8.encode(rpId);
  const bytes = [...cborHead(0, 1), ...cborHead(2, credId.length), ...credId, ...cborHead(3, rp.length), ...rp, ...cborHead(4, transports.length)];
  for (const t of transports) { const b = utf8.encode(t); bytes.push(...cborHead(3, b.length), ...b); }
  return bech32.encode('AGE-PLUGIN-FIDO2PRF-', bech32.toWords(new Uint8Array(bytes)), false).toUpperCase();
}
async function createCredential(kind: UnlockerKind): Promise<string> {
  if (!passkeysSupported()) throw new Error('This browser cannot use passkeys here. Your recovery key still works.');
  const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
  const options = {
    rp: { name: 'GitVault', id: location.hostname },
    user: { name: kind === 'phone' ? 'GitVault key (phone)' : 'GitVault key (this device)', displayName: 'GitVault key', id: random(16) },
    pubKeyCredParams: [-8, -7, -257].map(alg => ({ type: 'public-key' as const, alg })),
    authenticatorSelection: { residentKey: 'required' as const, requireResidentKey: true, userVerification: 'required' as const, authenticatorAttachment: kind === 'phone' ? 'cross-platform' as const : 'platform' as const },
    // WebAuthn L3 hints: go straight to the phone QR (hybrid) or to Touch ID / Windows Hello.
    hints: [kind === 'phone' ? 'hybrid' : 'client-device'],
    extensions: { prf: {} },
    challenge: random(32),
  } as PublicKeyCredentialCreationOptions;
  const cred = await navigator.credentials.create({ publicKey: options }) as PublicKeyCredential | null;
  if (!cred) throw new Error('No passkey was created.');
  if (!(cred.getClientExtensionResults() as { prf?: { enabled?: boolean } }).prf?.enabled) {
    throw new Error(kind === 'phone' ? 'That phone or passkey provider did not offer the PRF encryption feature. iPhone needs iOS 18.4+; Android needs Google Password Manager.' : 'This device\'s passkeys do not offer the PRF encryption feature. Try your phone instead.');
  }
  const transports = (cred.response as AuthenticatorAttestationResponse).getTransports?.() ?? [];
  return encodeCredential(new Uint8Array(cred.rawId), location.hostname, transports);
}
/** Two approvals: one creates the passkey, one wraps your key with its PRF output. */
export async function addUnlocker(kind: UnlockerKind): Promise<void> {
  const stored = loadKey(); const secret = unlockedIdentity();
  if (!stored) throw new Error('Set up your key first.');
  const credential = await createCredential(kind);
  const e = new Encrypter(); e.addRecipient(new webauthn.WebAuthnRecipient({ identity: credential }));
  const plain = utf8.encode(secret); let envelope: string;
  try { envelope = armor.encode(await e.encrypt(plain)); } finally { plain.fill(0); }
  const latest = loadKey() ?? stored;
  saveKey({ ...latest, unlockers: [...latest.unlockers, { kind, credential, envelope, added: new Date().toISOString() }] });
}
export function removeUnlocker(index: number): void {
  const stored = loadKey(); if (!stored) return;
  stored.unlockers.splice(index, 1); saveKey(stored);
}
export async function unlockWithPasskey(unlocker: Unlocker): Promise<void> {
  const stored = loadKey(); if (!stored) throw new Error('No key is set up on this device.');
  const d = new Decrypter(); d.addIdentity(new webauthn.WebAuthnIdentity({ identity: unlocker.credential }));
  const plain = await d.decrypt(armor.decode(unlocker.envelope));
  let secret: string;
  try { secret = parseIdentity(text.decode(plain)); } finally { plain.fill(0); }
  if (await identityToRecipient(secret) !== stored.recipient) throw new Error('This passkey unlocked a different key. Use your recovery key.');
  identity = secret; changed();
}
