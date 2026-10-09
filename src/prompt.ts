import { SecretInput } from './secret-input.js';

/** Hidden terminal prompt with streaming UTF-8, cancellation and raw-mode cleanup. */
export async function passwordPrompt(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('No interactive terminal. Set GITVAULT_PASSPHRASE in the process environment; never commit it.');
  return new Promise((resolve, reject) => {
    const parser = new SecretInput();
    const previous = Boolean(process.stdin.isRaw);
    let finished = false;
    const finish = (error?: Error, value = '') => {
      if (finished) return;
      finished = true;
      process.stdin.off('data', onData); process.stdin.off('end', onEnd); process.stdin.off('error', onError);
      parser.clear();
      try { process.stdin.setRawMode(previous); } catch { /* The terminal may have been disconnected. */ }
      process.stdin.pause(); process.stderr.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      const result = parser.push(chunk);
      if (result && 'error' in result) finish(result.error);
      else if (result) finish(undefined, result.value);
    };
    const onEnd = () => finish(new Error('Terminal input ended before a password was entered'));
    const onError = (error: Error) => finish(error);
    process.stderr.write(label);
    try {
      process.stdin.setRawMode(true);
      process.stdin.on('data', onData); process.stdin.once('end', onEnd); process.stdin.once('error', onError);
      process.stdin.resume();
    } catch (error) { finish(error instanceof Error ? error : new Error('Could not read terminal input')); }
  });
}
