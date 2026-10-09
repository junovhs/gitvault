import type { CryptoRequest } from './crypto.worker.js';
const active = new Set<() => void>();
export function cancelCrypto(): void { for (const cancel of [...active]) cancel(); }

/** Keep expensive password derivation off the UI thread and allow only one operation at a time. */
export function runCrypto(request: CryptoRequest): Promise<Uint8Array> {
  if (active.size) return Promise.reject(new Error('An encryption operation is already running. Let it finish or navigate away to cancel it.'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./crypto.worker.ts', import.meta.url), { type: 'module' });
    let done = false;
    const finish = (error?: Error, bytes?: Uint8Array) => {
      if (done) return;
      done = true; clearTimeout(timer); active.delete(cancel); worker.terminate();
      if (error) reject(error); else resolve(bytes!);
    };
    const cancel = () => finish(new Error('Operation cancelled'));
    const timer = setTimeout(() => finish(new Error('Operation timed out on this device. Try a desktop browser.')), 90000);
    active.add(cancel);
    worker.onmessage = (event: MessageEvent<{ bytes?: Uint8Array; error?: string }>) => {
      if (event.data.error) finish(new Error(event.data.error));
      else if (event.data.bytes) finish(undefined, new Uint8Array(event.data.bytes));
      else finish(new Error('Unexpected crypto worker response'));
    };
    worker.onerror = () => finish(new Error('Encryption worker could not run. Use a current browser on HTTPS or localhost.'));
    try { worker.postMessage(request); } catch (error) { finish(error instanceof Error ? error : new Error('Could not start encryption worker')); }
  });
}
