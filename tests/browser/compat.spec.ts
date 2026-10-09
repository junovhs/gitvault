import { test, expect } from '@playwright/test';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { encrypt } from '../../src/crypto.js';
import { mkdir } from 'node:fs/promises';

test('browser engine supports local identity decryption and a mobile-width preview', async ({ page, browserName }) => {
  const identity = await generateIdentity(); const recipient = await identityToRecipient(identity);
  const encrypted = await encrypt(new TextEncoder().encode('# Cross-browser unlock\nDecrypted locally with no GitHub request.\n<img src="https://example.invalid/not-loaded">'), { recipient });
  const external: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#page=open');
  await page.getByLabel('Choose an encrypted .age file').setInputFiles({ name: 'compat.md.age', mimeType: 'application/octet-stream', buffer: Buffer.from(encrypted) });
  await page.getByRole('button', { name: 'Open on this device', exact: true }).click();
  await page.getByLabel('Unlock method').selectOption('identity');
  await page.getByLabel('Password or private identity', { exact: true }).fill(identity);
  await page.getByRole('button', { name: 'Unlock document', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cross-browser unlock', exact: true })).toBeVisible();
  await expect(page.locator('.markdown img')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir('screenshots', { recursive: true });
  await page.screenshot({ path: 'screenshots/' + browserName + '-mobile-unlock.png', fullPage: true });
  await page.getByRole('button', { name: 'Lock now' }).click();
  await expect(page.getByLabel('Choose an encrypted .age file')).toBeVisible();
  expect(external).toEqual([]);
});

test('browser engine supports password-based age decryption in a worker', async ({ page }) => {
  const password = 'a-public-cross-browser-fixture-password';
  const encrypted = await encrypt(new TextEncoder().encode('# Password works here\nPublic test fixture.'), { passphrase: password });
  await page.goto('./#page=open');
  await page.getByLabel('Choose an encrypted .age file').setInputFiles({ name: 'password.md.age', mimeType: 'application/octet-stream', buffer: Buffer.from(encrypted) });
  await page.getByRole('button', { name: 'Open on this device' }).click();
  await page.getByLabel('Password or private identity', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Unlock document', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Password works here', exact: true })).toBeVisible({ timeout: 90000 });
});
