import { StringDecoder } from 'node:string_decoder';

type SecretResult = { value: string } | { error: Error };

/** Stateful terminal input parser. Never logs or echoes secret bytes. */
export class SecretInput {
  private decoder = new StringDecoder('utf8');
  private value = '';
  private escaped: 'none' | 'escape' | 'csi' | 'ss3' = 'none';
  private finished = false;

  push(chunk: Buffer): SecretResult | null {
    if (this.finished) return null;
    for (const char of this.decoder.write(chunk)) {
      if (char === '\u0003' || char === '\u0004') { this.clear(); return { error: new Error('Cancelled') }; }
      if (this.escaped === 'escape') { this.escaped = char === '[' ? 'csi' : char === 'O' ? 'ss3' : 'none'; continue; }
      if (this.escaped === 'csi') { if (char >= '@' && char <= '~') this.escaped = 'none'; continue; }
      if (this.escaped === 'ss3') { this.escaped = 'none'; continue; }
      if (char === '\u001b') { this.escaped = 'escape'; continue; }
      if (char === '\r' || char === '\n') {
        const value = this.value; this.clear(); return { value };
      }
      if (char === '\u007f' || char === '\b') this.value = Array.from(this.value).slice(0, -1).join('');
      else if (char >= ' ') this.value += char;
      if (this.value.length > 4096) { this.clear(); return { error: new Error('Password input exceeds the 4096-character limit') }; }
    }
    return null;
  }
  clear(): void {
    this.value = ''; this.decoder = new StringDecoder('utf8'); this.escaped = 'none'; this.finished = true;
  }
}
