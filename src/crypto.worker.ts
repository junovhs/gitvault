import { encrypt, decrypt, type EncryptionSecret, type DecryptionSecret } from './crypto.js';
export type CryptoRequest = { kind: 'encrypt'; bytes: Uint8Array; secret: EncryptionSecret } | { kind: 'decrypt'; bytes: Uint8Array; secret: DecryptionSecret };
const scope = globalThis as unknown as { onmessage: (event: MessageEvent<CryptoRequest>) => void; postMessage: (data: unknown, transfer?: Transferable[]) => void };
scope.onmessage = async (event) => {
  const request = event.data;
  try {
    const bytes = request.kind === 'encrypt' ? await encrypt(request.bytes, request.secret) : await decrypt(request.bytes, request.secret);
    scope.postMessage({ bytes }, [bytes.buffer as ArrayBuffer]);
  } catch {
    scope.postMessage({ error: request.kind === 'decrypt' ? 'That didn\u2019t unlock it. Check the password or key; the file may also be damaged.' : 'Locking failed. Check the public key or password.' });
  } finally {
    request.bytes.fill(0);
  }
};
