import assert from 'node:assert/strict';
import { test } from 'node:test';
import { landingPage } from '../src/landing.js';

test('landing page points to ciphertext, QR and viewer, never secrets', () => {
  const body = landingPage({ name: 'strategy.md', ciphertextFile: 'private/strategy.md.age', repo: 'owner/repo', viewer: 'https://example.com/', qrFile: 'strategy.md.qr.svg' });
  assert.match(body, /document is encrypted/);
  assert.match(body, /strategy.md.qr.svg/);
  assert.match(body, /file=private%2Fstrategy.md.age/);
  assert.match(body, /no password or decryption key/);
  assert.match(body, /\n\n/);
});
test('escape attacker-controlled file labels', () => {
  const body = landingPage({ name: '<script>alert(1)</script>[x](https://evil.test)', ciphertextFile: 'private/a.age', repo: 'o/r', viewer: 'https://example.com/', qrFile: 'a.svg' });
  assert.ok(!body.includes('<script>'));
  assert.ok(!body.includes('[x](https://evil.test)'));
});
