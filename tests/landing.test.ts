import assert from 'node:assert/strict';
import { test } from 'node:test';
import { landingPage } from '../src/landing.js';

test('landing page points to ciphertext, QR and viewer, not secrets', () => {
 const body=landingPage({name:'strategy.md',ciphertextFile:'private/strategy.md.age',repo:'owner/repo',viewer:'https://example.com/',qrFile:'strategy.md.qr.png'});
 assert.match(body, /Encrypted document/);
 assert.match(body, /strategy.md.qr.png/);
 assert.match(body, /file=private%2Fstrategy.md.age/);
 assert.match(body, /password or decryption key/);
 assert.match(body, /\n\n/);
});
