import { encrypt, decrypt, type EncryptionSecret, type DecryptionSecret } from './crypto.js';
export type CryptoRequest = { kind: 'encrypt'; bytes: Uint8Array; secret: EncryptionSecret } | { kind: 'decrypt'; bytes: Uint8Array; secret: DecryptionSecret };
const scope = globalThis as unknown as { onmessage: (event: MessageEvent<CryptoRequest>) => void; postMessage: (data: unknown, transfer?: Transferable[]) => void };
scope.onmessage = async (event) => {
  const request = event.data;
  try {
    const bytes = request.kind === 'encrypt' ? await encrypt(request.bytes, request.secret) : await decrypt(request.bytes, request.secret);
    scope.postMessage({ bytes }, [bytes.buffer as ArrayBuffer]);
  } catch {
    scope.postMessage({ error: request.kind === 'decrypt' ? 'Could not unlock this file. Check the password or private identity; the file may also be damaged or use another encryption method.' : 'Encryption failed. Check the public recipient or password.' });
  } finally {
    request.bytes.fill(0);
  }
};
