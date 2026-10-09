import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { decrypt } from '../../src/crypto.js';

test('write a private note and download only encrypted age ciphertext', async ({ page }) => {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  const external: string[] = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url());
  });
  await page.goto('./#page=encrypt');
  await page.getByRole('button', { name: 'Write a note' }).click();
  await expect(page.getByLabel('Original document')).not.toBeVisible();
  await page.getByLabel('Note filename (public if individually published)').fill('private-note.md');
  await page.getByLabel('Private note').fill('# Thinking privately\nThis is not a public file.');
  await page.getByLabel('Encryption method').selectOption('recipient');
  await page.getByLabel('Public age recipient').fill(recipient);
  await page.getByRole('button', { name: 'Encrypt file', exact: true }).click();
  await expect(page.getByText('Encrypted successfully. No plaintext was uploaded.')).toBeVisible();
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download encrypted file (.age)' }).click();
  const artifact = await promise;
  expect(artifact.suggestedFilename()).toBe('private-note.md.age');
  const content = await readFile((await artifact.path())!);
  expect(new TextDecoder().decode(await decrypt(content, { identity })))
    .toBe('# Thinking privately\nThis is not a public file.');
  expect(new TextDecoder().decode(content)).not.toContain('Thinking privately');
  expect(external).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  // Actually leave the editor; revisiting the same hash alone is not a navigation.
  await page.getByRole('link', { name: 'Workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your repo has a private side.' })).toBeVisible();
  await page.getByRole('link', { name: 'Add a file', exact: true }).click();
  await page.getByRole('button', { name: 'Write a note' }).click();
  await expect(page.getByLabel('Private note')).toHaveValue('');
});

test('unsafe note filenames are rejected before encryption', async ({ page }) => {
  await page.goto('./#page=encrypt');
  await page.getByRole('button', { name: 'Write a note' }).click();
  await page.getByLabel('Note filename (public if individually published)').fill('../secrets.md');
  await page.getByLabel('Private note').fill('# Sensitive');
  await page.getByLabel('Password', { exact: true }).fill('a-long-unique-test-password');
  await page.getByLabel('Confirm password').fill('a-long-unique-test-password');
  await page.getByRole('button', { name: 'Encrypt file', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Unsafe relative path');
  await expect(page.getByRole('button', { name: 'Download encrypted file (.age)' })).toHaveCount(0);
});
