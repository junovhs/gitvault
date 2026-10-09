import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SecretInput } from '../src/secret-input.js';

test('terminal input preserves UTF-8 split across arbitrary byte chunks', () => {
  const input = new SecretInput(); const password = '  snowman \u2603 and \ud83d\udd11 with spaces  ';
  for (const byte of Buffer.from(password)) assert.equal(input.push(Buffer.from([byte])), null);
  assert.deepEqual(input.push(Buffer.from('\r')), { value: password });
});
test('backspace removes a complete Unicode code point', () => {
  const input = new SecretInput(); assert.equal(input.push(Buffer.from('hello\ud83d\udd11\u007f!')), null);
  assert.deepEqual(input.push(Buffer.from('\n')), { value: 'hello!' });
});
test('arrow-key escapes and bracketed-paste markers do not corrupt a password', () => {
  const input = new SecretInput();
  assert.deepEqual(input.push(Buffer.from('first\u001b[D\u001b[200~ second\u001b[201~\n')), { value: 'first second' });
});
test('cancelled input returns no secret and accepts no further bytes', () => {
  const input = new SecretInput(); const result = input.push(Buffer.from('do-not-return-this\u0003'));
  assert.ok(result && 'error' in result); assert.equal(result.error.message, 'Cancelled');
  assert.equal(input.push(Buffer.from('\n')), null);
});
test('oversized paste is rejected without returning secret material', () => {
  const input = new SecretInput(); const result = input.push(Buffer.from('x'.repeat(4097)));
  assert.ok(result && 'error' in result); assert.match(result.error.message, /limit/);
  assert.equal(input.push(Buffer.from('\n')), null);
});
