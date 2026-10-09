import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { unzipSync, strFromU8 } from 'fflate';
import { encrypt, decrypt } from '../../src/crypto.js';

const password = 'gitvault-demo-not-a-secret';
const note = '# You unlocked it.\n\nThis document was encrypted in a public repository.\n\n## A private side to your public repo\n\n- GitHub stored only the locked copy.\n- Your browser unlocked it locally.\n- The QR was a link, never a key.\n\n**This is a public demo, not a real secret.**';

test('desktop and mobile home pages are usable without horizontal scrolling', async ({ page }) => {
  await mkdir('screenshots', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1050 }); await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Your repo has a private side.' })).toBeVisible();
  await page.screenshot({ path: 'screenshots/desktop-home.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'screenshots/mobile-home.png', fullPage: true });
  await page.getByRole('link', { name: 'Encrypt', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lock it before you publish it.' })).toBeVisible();
});

test('remote password unlock happens in a real browser worker and can be locked again', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const ciphertext = await encrypt(new TextEncoder().encode(note), { passphrase: password });
  await page.route('https://api.github.com/repos/example/repo/contents/**', route => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(ciphertext) }));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('./#repo=example%2Frepo&file=private%2Fwelcome.md.age&demo=1');
  await expect(page.getByRole('button', { name: 'Unlock document', exact: true })).toBeVisible();
  await page.screenshot({ path: 'screenshots/locked-document.png', fullPage: true });
  await page.getByRole('button', { name: 'Use demo password' }).click();
  await page.getByRole('button', { name: 'Unlock document', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'You unlocked it.' })).toBeVisible({ timeout: 90000 });
  await page.screenshot({ path: 'screenshots/unlocked-document.png', fullPage: true });
  await page.getByRole('button', { name: 'Lock now' }).click();
  await expect(page.getByRole('button', { name: 'Unlock document', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You unlocked it.' })).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('local identity unlock makes no GitHub requests and does not activate embedded HTML', async ({ page }) => {
  const identity = await generateIdentity(); const recipient = await identityToRecipient(identity);
  const malicious = '# Safe local preview\n<img src="https://example.invalid/leak" onerror="alert(1)">\n[secret](https://example.invalid/secret)';
  const ciphertext = await encrypt(new TextEncoder().encode(malicious), { recipient });
  const external: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url()); });
  await page.goto('./#page=open');
  await page.getByLabel('Choose an encrypted .age file').setInputFiles({ name: 'local.md.age', mimeType: 'application/octet-stream', buffer: Buffer.from(ciphertext) });
  await page.getByRole('button', { name: 'Open on this device' }).click();
  await page.getByLabel('Unlock method').selectOption('identity');
  await page.getByLabel('Password or private identity', { exact: true }).fill(identity);
  await page.getByRole('button', { name: 'Unlock document', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Safe local preview' })).toBeVisible();
  await expect(page.locator('.markdown img, .markdown script, .markdown a')).toHaveCount(0);
  expect(external).toEqual([]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Edit decrypted document').fill('# Edited locally\nNo upload.');
  await page.getByRole('button', { name: 'Encrypt edited copy' }).click();
  await page.getByLabel('Encryption method').selectOption('recipient');
  await page.getByLabel('Password', { exact: true }).fill(recipient);
  await page.getByRole('button', { name: 'Encrypt file', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download encrypted file (.age)', exact: true }).click();
  const file = await downloaded; const saved = await file.path();
  expect(new TextDecoder().decode(await decrypt(await readFile(saved!), { identity }))).toBe('# Edited locally\nNo upload.');
  expect(external).toEqual([]);
});

test('browser bundle contains only ciphertext and public landing assets', async ({ page }) => {
  const identity = await generateIdentity(); const recipient = await identityToRecipient(identity);
  await page.goto('./#page=encrypt');
  await page.getByLabel('Original document').setInputFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Only inside ciphertext') });
  await page.getByLabel('Encryption method').selectOption('recipient');
  await page.getByLabel('Password', { exact: true }).fill(recipient);
  await page.getByLabel('Public repository', { exact: true }).fill('example/repo');
  await page.getByRole('button', { name: 'Encrypt + create GitHub bundle' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download GitHub bundle (.zip)' }).click();
  const file = await downloaded; const saved = await file.path(); const files = unzipSync(await readFile(saved!));
  expect(Object.keys(files).sort()).toEqual(['private/notes.md', 'private/notes.md.age', 'private/notes.md.qr.svg']);
  expect(strFromU8(files['private/notes.md'])).not.toContain('Only inside ciphertext');
  expect(new TextDecoder().decode(await decrypt(files['private/notes.md.age'], { identity }))).toBe('# Only inside ciphertext');
});
