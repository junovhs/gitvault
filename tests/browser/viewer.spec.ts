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
  await page.getByRole('link', { name: 'New note', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lock it' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'screenshots/mobile-note.png', fullPage: true });
});

test('remote password unlock happens in a real browser worker and can be locked again', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const ciphertext = await encrypt(new TextEncoder().encode(note), { passphrase: password });
  await page.route('https://api.github.com/repos/example/repo/contents/**', route => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(ciphertext) }));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('./#repo=example%2Frepo&file=private%2Fwelcome.md.age&demo=1');
  await expect(page.getByRole('button', { name: 'Unlock', exact: true })).toBeVisible();
  await page.screenshot({ path: 'screenshots/locked-document.png', fullPage: true });
  await page.getByLabel('Password').fill('wrong password, on purpose');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('didn’t work');
  await page.getByRole('button', { name: 'Fill in the demo password' }).click();
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'You unlocked it.' })).toBeVisible({ timeout: 90000 });
  await page.screenshot({ path: 'screenshots/unlocked-document.png', fullPage: true });
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unlock', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You unlocked it.' })).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('editing an unlocked note re-locks it to the same key without any upload', async ({ page }) => {
  const identity = await generateIdentity(); const recipient = await identityToRecipient(identity);
  const external: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url()); });
  await page.goto('./#page=open');
  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a file' }).click();
  await (await chooser).setFiles({ name: 'plan.md.age', mimeType: 'application/octet-stream', buffer: Buffer.from(await encrypt(new TextEncoder().encode('# Plan'), { recipient })) });
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Unlock with my key file' }).click();
  await (await chooser).setFiles({ name: 'gitvault-key.txt', mimeType: 'text/plain', buffer: Buffer.from(identity) });
  await expect(page.getByRole('heading', { name: 'Plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Edit document').fill('# Edited locally\nNo upload.');
  await page.getByRole('button', { name: 'Lock changes' }).click();
  await page.getByRole('button', { name: 'Lock it' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download locked file' }).click();
  const file = await downloaded; expect(file.suggestedFilename()).toBe('plan.md.age');
  expect(new TextDecoder().decode(await decrypt(await readFile((await file.path())!), { identity }))).toBe('# Edited locally\nNo upload.');
  expect(external).toEqual([]);
});

test('a repo bundle contains only ciphertext and public landing assets', async ({ page }) => {
  await page.goto('./#page=encrypt&repo=example%2Frepo');
  await page.getByRole('button', { name: 'Share with a password' }).click();
  const secret = (await page.locator('.password-box .generated').innerText()).trim();
  await page.getByLabel('Note title').fill('notes');
  await page.getByLabel('Private note').fill('# Only inside ciphertext');
  await page.getByRole('button', { name: 'Lock it' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download for example/repo' }).click();
  const file = await downloaded; const files = unzipSync(await readFile((await file.path())!));
  expect(Object.keys(files).sort()).toEqual(['private/notes.md', 'private/notes.md.age', 'private/notes.md.qr.svg']);
  expect(strFromU8(files['private/notes.md'])).not.toContain('Only inside ciphertext');
  expect(strFromU8(files['private/notes.md'])).not.toContain(secret);
  expect(new TextDecoder().decode(await decrypt(files['private/notes.md.age'], { passphrase: secret }))).toBe('# Only inside ciphertext');
});
