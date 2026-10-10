import { test, expect, type Page } from '@playwright/test';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { encrypt } from '../../src/crypto.js';
import { mkdir } from 'node:fs/promises';

async function choose(page: Page, button: string, file: { name: string; buffer: Buffer }) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: button }).click();
  await (await chooser).setFiles({ mimeType: 'application/octet-stream', ...file });
}

test('browser engine supports key-file decryption and a mobile-width reader', async ({ page, browserName }) => {
  const identity = await generateIdentity(); const recipient = await identityToRecipient(identity);
  const encrypted = await encrypt(new TextEncoder().encode('# Cross-browser unlock\nDecrypted locally with no GitHub request.\n<img src="https://example.invalid/not-loaded">'), { recipient });
  const external: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#page=open');
  await choose(page, 'Choose a file', { name: 'compat.md.age', buffer: Buffer.from(encrypted) });
  await choose(page, 'Unlock with my key file', { name: 'gitvault-key.txt', buffer: Buffer.from(identity) });
  await expect(page.getByRole('heading', { name: 'Cross-browser unlock', exact: true })).toBeVisible();
  await expect(page.locator('.markdown img')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir('screenshots', { recursive: true });
  await page.screenshot({ path: 'screenshots/' + browserName + '-mobile-unlock.png', fullPage: true });
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Drop a locked file here.' })).toBeVisible();
  expect(external).toEqual([]);
});

test('browser engine supports password-based age decryption in a worker', async ({ page }) => {
  const password = 'a-public-cross-browser-fixture-password';
  const encrypted = await encrypt(new TextEncoder().encode('# Password works here\nPublic test fixture.'), { passphrase: password });
  await page.goto('./#page=open');
  await choose(page, 'Choose a file', { name: 'password.md.age', buffer: Buffer.from(encrypted) });
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Password works here', exact: true })).toBeVisible({ timeout: 90000 });
});
