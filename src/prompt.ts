/** Read a password without echoing it or putting it in command-line arguments. */
export async function passwordPrompt(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('No interactive terminal. Set GITVAULT_PASSPHRASE in the process environment; never commit it.');
  return new Promise((resolve, reject) => {
    let value = '';
    const previous = process.stdin.isRaw;
    const finish = (error?: Error) => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(previous);
      process.stdin.pause();
      process.stderr.write('\n');
      if (error) reject(error); else resolve(value);
      value = '';
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003' || char === '\u0004') { finish(new Error('Cancelled')); return; }
        if (char === '\r' || char === '\n') { finish(); return; }
        if (char === '\u007f' || char === '\b') value = Array.from(value).slice(0, -1).join('');
        else if (char >= ' ' && char !== '\u007f') value += char;
      }
    };
    process.stderr.write(label);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}
