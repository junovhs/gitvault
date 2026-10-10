import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { decrypt } from '../../src/crypto.js';

test('write a note, lock it to your key, and download only age ciphertext', async ({ page }) => {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  const external: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url()); });
  await page.goto('./#page=open');
  // Importing an existing key file sets up "your key" on this device.
  const chooser = page.waitForEvent('filechooser');
  await page.goto('./#page=key'); await page.getByRole('button', { name: 'I already have a key file' }).click();
  await (await chooser).setFiles({ name: 'gitvault-key.txt', mimeType: 'text/plain', buffer: Buffer.from(identity + '\n') });
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.getByRole('link', { name: 'New note' }).click();
  await page.getByLabel('Note title').fill('Thinking privately');
  await page.getByLabel('Private note').fill('# Thinking privately\nThis is not a public file.');
  await page.getByRole('button', { name: 'Lock it' }).click();
  await expect(page.getByRole('heading', { name: 'Locked.' })).toBeVisible();
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download locked file' }).click();
  const artifact = await promise;
  expect(artifact.suggestedFilename()).toBe('thinking-privately.md.age');
  const content = await readFile((await artifact.path())!);
  expect(new TextDecoder().decode(await decrypt(content, { identity }))).toBe('# Thinking privately\nThis is not a public file.');
  expect(new TextDecoder().decode(content)).not.toContain('Thinking privately');
  expect(external).toEqual([]);
  // Only the public key is remembered; no private key or note text is ever stored.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).toContain(recipient);
  expect(stored).not.toContain('AGE-SECRET-KEY-');
  expect(stored).not.toContain('Thinking privately');
  await page.getByRole('link', { name: 'Write another' }).click();
  await expect(page.getByLabel('Private note')).toHaveValue('');
});

test('a note title can never become a path', async ({ page }) => {
  await page.goto('./#page=encrypt');
  await page.getByRole('button', { name: 'Share with a password' }).click();
  await page.getByLabel('Note title').fill('../../.git/config');
  await page.getByLabel('Private note').fill('# Sensitive');
  await page.getByRole('button', { name: 'Lock it' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download locked file' }).click();
  expect((await download).suggestedFilename()).toBe('git-config.md.age');
});
