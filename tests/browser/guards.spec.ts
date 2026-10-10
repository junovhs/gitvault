import { test, expect, type Page } from '@playwright/test';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { encrypt } from '../../src/crypto.js';

async function encryptedFixture() {
  const identity = await generateIdentity(); const recipient = await identityToRecipient(identity);
  const bytes = await encrypt(new TextEncoder().encode('# Private browser fixture\nNever persist this document.'), { recipient });
  return { identity, bytes };
}
async function openLocal(page: Page, name: string, buffer: Buffer) {
  await page.goto('./#page=open');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a file' }).click();
  await (await chooser).setFiles({ name, mimeType: 'application/octet-stream', buffer });
}
async function useKeyFile(page: Page, button: string, identity: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: button }).click();
  await (await chooser).setFiles({ name: 'gitvault-key.txt', mimeType: 'text/plain', buffer: Buffer.from(identity) });
}

test('a wrong key file shows no document and stores nothing secret', async ({ page }) => {
  const { bytes } = await encryptedFixture();
  await openLocal(page, 'private.md.age', Buffer.from(bytes));
  await useKeyFile(page, 'Unlock with my key file', await generateIdentity());
  await expect(page.getByText('This file was locked with a different key.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Private browser fixture' })).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain('AGE-SECRET-KEY-');
});

test('idle lock clears local plaintext and returns to the drop page', async ({ page }) => {
  const { identity, bytes } = await encryptedFixture();
  await page.clock.install();
  await openLocal(page, 'private.md.age', Buffer.from(bytes));
  await useKeyFile(page, 'Unlock with my key file', identity);
  await expect(page.getByRole('heading', { name: 'Private browser fixture' })).toBeVisible();
  await page.clock.fastForward('06:00');
  await expect(page.getByRole('heading', { name: 'Drop a locked file here.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Private browser fixture' })).toHaveCount(0);
  await page.clock.fastForward('16:00');
  await expect(page.locator('#key-chip')).toHaveAttribute('data-state', 'locked');
});

test('repo explorer hides generated artifacts and preserves branch references', async ({ page }) => {
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
  const secret = page.locator('.file-row.private');
  await expect(secret).toContainText('strategy.md');
  expect(new URLSearchParams((await secret.getAttribute('href'))!.slice(1)).get('ref')).toBe('feature/private');
});

test('GitHub rate limits leave local-file opening available', async ({ page }) => {
  await page.route('https://api.github.com/**', route => route.fulfill({ status: 429, body: '{}' }));
  await page.goto('./#repo=example%2Frepo');
  await expect(page.getByRole('alert')).toContainText('limited');
  await page.getByRole('link', { name: 'More tools', exact: true }).click();
  await page.getByRole('link', { name: 'Open a locked file', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose a file' })).toBeVisible();
});

test('hostile age headers are refused before any password KDF is offered', async ({ page }) => {
  const hostile = Buffer.from('age-encryption.org/v1\n-> scrypt AAAAAAAAAAAAAAAAAAAAAA 31\nAAAA\n--- AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n');
  await openLocal(page, 'hostile.age', hostile);
  await expect(page.getByRole('alert')).toContainText('work factor');
  await expect(page.getByLabel('Password')).toHaveCount(0);
});

test('unlocked HTML, images and links in a document are never activated', async ({ page }) => {
  const identity = await generateIdentity(); const recipient = await identityToRecipient(identity);
  const malicious = '# Safe local preview\n<img src="https://example.invalid/leak" onerror="alert(1)">\n[secret](https://example.invalid/secret)';
  const external: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url()); });
  await openLocal(page, 'local.md.age', Buffer.from(await encrypt(new TextEncoder().encode(malicious), { recipient })));
  await useKeyFile(page, 'Unlock with my key file', identity);
  await expect(page.getByRole('heading', { name: 'Safe local preview' })).toBeVisible();
  await expect(page.locator('.markdown img, .markdown script, .markdown a')).toHaveCount(0);
  expect(external).toEqual([]);
});
