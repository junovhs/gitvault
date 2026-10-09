import { test, expect } from '@playwright/test';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { encrypt } from '../../src/crypto.js';

async function encryptedFixture() {
  const identity = await generateIdentity(); const recipient = await identityToRecipient(identity);
  const bytes = await encrypt(new TextEncoder().encode('# Private browser fixture\nNever persist this document.'), { recipient });
  return { identity, bytes };
}

test('wrong key displays a useful error and no decrypted document', async ({ page }) => {
  const { bytes } = await encryptedFixture();
  await page.goto('./#page=open');
  await page.getByLabel('Choose an encrypted .age file').setInputFiles({ name: 'private.md.age', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
  await page.getByRole('button', { name: 'Open on this device' }).click();
  await page.getByLabel('Unlock method').selectOption('identity');
  await page.getByLabel('Password or private identity', { exact: true }).fill(await generateIdentity());
  await page.getByRole('button', { name: 'Unlock document', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not unlock');
  await expect(page.getByRole('heading', { name: 'Private browser fixture' })).toHaveCount(0);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test('idle lock clears local plaintext and returns to the local file picker', async ({ page }) => {
  const { identity, bytes } = await encryptedFixture();
  await page.clock.install(); await page.goto('./#page=open');
  await page.getByLabel('Choose an encrypted .age file').setInputFiles({ name: 'private.md.age', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
  await page.getByRole('button', { name: 'Open on this device' }).click();
  await page.getByLabel('Unlock method').selectOption('identity');
  await page.getByLabel('Password or private identity', { exact: true }).fill(identity);
  await page.getByRole('button', { name: 'Unlock document', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Private browser fixture' })).toBeVisible();
  await page.clock.fastForward('06:00');
  await expect(page.getByRole('heading', { name: 'Already have the locked file?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Private browser fixture' })).toHaveCount(0);
});

test('repo explorer collapses generated artifacts and preserves branch references', async ({ page }) => {
  await page.route('https://api.github.com/repos/example/repo/contents/**', async route => {
    expect(new URL(route.request().url()).searchParams.get('ref')).toBe('feature/private');
    await route.fulfill({ json: [
      { name: 'strategy.md', path: 'private/strategy.md', type: 'file', size: 200 },
      { name: 'strategy.md.age', path: 'private/strategy.md.age', type: 'file', size: 1200 },
      { name: 'strategy.md.qr.svg', path: 'private/strategy.md.qr.svg', type: 'file', size: 1400 },
      { name: '.gitvault-manifest.json', path: 'private/.gitvault-manifest.json', type: 'file', size: 120 },
      { name: 'public.txt', path: 'private/public.txt', type: 'file', size: 30 },
    ] });
  });
  await page.goto('./#repo=example%2Frepo&dir=private&ref=feature%2Fprivate');
  await expect(page.locator('.file-row')).toHaveCount(2);
  const secret = page.locator('.file-row').filter({ hasText: 'Encrypted document' });
  await expect(secret).toContainText('strategy.md');
  expect(new URLSearchParams((await secret.getAttribute('href'))!.slice(1)).get('ref')).toBe('feature/private');
  await page.getByLabel('Show generated files').check(); await expect(page.locator('.file-row')).toHaveCount(5);
  await page.getByLabel('Filter files').fill('public'); await expect(page.locator('.file-row')).toHaveCount(1);
});

test('GitHub rate limits leave local-file opening available', async ({ page }) => {
  await page.route('https://api.github.com/**', route => route.fulfill({ status: 429, body: '{}' }));
  await page.goto('./#repo=example%2Frepo');
  await expect(page.getByRole('alert')).toContainText('limited');
  await page.getByRole('link', { name: 'Open a file', exact: true }).click();
  await expect(page.getByLabel('Choose an encrypted .age file')).toBeVisible();
});

test('hostile age headers fail without attempting an excessive password KDF', async ({ page }) => {
  const hostile = Buffer.from('age-encryption.org/v1\n-> scrypt AAAAAAAAAAAAAAAAAAAAAA 31\nAAAA\n--- AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n');
  await page.goto('./#page=open');
  await page.getByLabel('Choose an encrypted .age file').setInputFiles({ name: 'hostile.age', mimeType: 'application/octet-stream', buffer: hostile });
  await page.getByRole('button', { name: 'Open on this device' }).click();
  await page.getByLabel('Password or private identity', { exact: true }).fill('not sent anywhere');
  await page.getByRole('button', { name: 'Unlock document', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not unlock');
});
