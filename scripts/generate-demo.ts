import { mkdir, writeFile } from 'node:fs/promises';
import { armor } from 'age-encryption';
import QRCode from 'qrcode';
import { encrypt, decrypt } from '../src/crypto.js';
import { landingPage } from '../src/landing.js';
import { viewerUrl } from '../src/locator.js';

// Intentionally public test data. NEVER replace this with real private content.
const password = 'gitvault-demo-not-a-secret';
const plaintext = '# You unlocked it.\n\nThis document was encrypted in a public GitHub repository.\n\n## The private side of a public repo\n\n- GitHub stored only the encrypted copy.\n- You followed the landing-page link.\n- Your browser decrypted the document locally.\n\n**No clone. No account. Just your key.**\n\nThis is an intentionally public demo. Its password is published, so this sample provides no confidentiality.\n';
const encrypted = await encrypt(new TextEncoder().encode(plaintext), { passphrase: password });
if (new TextDecoder().decode(await decrypt(encrypted, { passphrase: password })) !== plaintext) throw new Error('Demo roundtrip failed');
const repo = 'junovhs/gitvault'; const file = 'examples/private/welcome.md.age'; const viewer = 'https://junovhs.github.io/gitvault/';
const normal = viewerUrl(viewer, repo, file, 'main'); const url = new URL(normal); const params = new URLSearchParams(url.hash.slice(1)); params.set('demo', '1'); url.hash = params.toString();
const landing = '# Try GitVault\n\n> **PUBLIC DEMO.** This is not a real secret. The password is `'+password+'`. The hosted viewer must be deployed before its link works; you can also download the .age file and use a local viewer.\n\n' + landingPage({ name: 'welcome.md', ciphertextFile: file, repo, viewer, qrFile: 'welcome.md.qr.svg', ref: 'main' }).replaceAll(normal, url.href);
await mkdir('examples/private', { recursive: true });
await writeFile(file, armor.encode(encrypted) + '\n');
await writeFile('examples/private/welcome.md', landing);
await writeFile('examples/private/welcome.md.qr.svg', await QRCode.toString(url.href, { type: 'svg', margin: 4, width: 256, errorCorrectionLevel: 'M' }));
console.log('Generated and roundtrip-verified the public demo. No real secrets were used.');
