import { test, expect } from '@playwright/test';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { packFolder } from '../../src/folder-format.js';
import { encrypt } from '../../src/crypto.js';

test('repository browse opens a concealed folder in the same project context', async ({ page }) => {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  const plain = packFolder([{ path: 'plans/private-strategy.md', bytes: new TextEncoder().encode('# Project strategy\nNot public.') }]);
  const ciphertext = await encrypt(plain, { recipient });
  plain.fill(0);
  await page.route('https://api.github.com/repos/example/repo/contents/**', async route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('ref')).toBe('feature/private');
    if (url.pathname.endsWith('/private')) {
      await route.fulfill({ json: [
        { name: 'private-notes.gvfolder.age', path: 'private/private-notes.gvfolder.age', type: 'file', size: ciphertext.length },
        { name: 'private-notes.gvfolder.md', path: 'private/private-notes.gvfolder.md', type: 'file', size: 300 },
        { name: 'private-notes.gvfolder.qr.svg', path: 'private/private-notes.gvfolder.qr.svg', type: 'file', size: 500 },
        { name: 'readme.txt', path: 'private/readme.txt', type: 'file', size: 100 },
      ] });
    } else if (url.pathname.endsWith('/private/private-notes.gvfolder.age')) {
      await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(ciphertext) });
    } else await route.abort();
  });
  await page.goto('./#repo=example%2Frepo&dir=private&ref=feature%2Fprivate');
  await expect(page.locator('.file-row')).toHaveCount(2);
  const folder = page.locator('.file-row').filter({ hasText: 'Private folder' });
  await expect(folder).toContainText('private-notes');
  await expect(folder).not.toContainText('.age');
  await folder.click();
  await expect(page).toHaveURL(/folder\.html#/);
  await expect(page.getByRole('heading', { name: 'A whole folder, under one lock.' })).toBeVisible();
  await page.getByLabel('Folder unlock method').selectOption('identity');
  await page.getByLabel('Folder password or private identity', { exact: true }).fill(identity);
  await page.getByRole('button', { name: 'Unlock folder' }).click();
  await expect(page.getByRole('heading', { name: 'Private folder contents' })).toBeVisible();
  await page.locator('.file-list').getByRole('button', { name: /plans/ }).click();
  await page.locator('.file-list').getByRole('button', { name: /private-strategy\.md/ }).click();
  await expect(page.getByRole('heading', { name: 'Project strategy' })).toBeVisible();
  await expect(page.getByText('Not public.')).toBeVisible();
});

test('project context follows Add a secret note into the lock screen', async ({ page }) => {
  await page.route('https://api.github.com/repos/example/repo/contents**', route => route.fulfill({ json: [] }));
  await page.goto('./#repo=example%2Frepo&ref=feature%2Fprivate');
  await expect(page.getByText('No private files here yet.')).toBeVisible();
  await page.getByRole('link', { name: 'Add a secret note' }).click();
  await expect(page.getByLabel('Private note')).toBeVisible();
  await expect(page.locator('details.where summary')).toHaveText('Goes in example/repo / private');
  await page.locator('details.where summary').click();
  await expect(page.getByLabel('Repository', { exact: true })).toHaveValue('example/repo');
});

test('the note screen starts with the repo option tucked away', async ({ page }) => {
  await page.goto('./#page=encrypt');
  await expect(page.locator('details.where')).not.toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: 'Lock it' })).toBeVisible();
  await page.locator('details.where summary').click();
  await expect(page.getByLabel('Repository', { exact: true })).toBeVisible();
});

test('pasting a GitHub URL opens the right repo, branch and folder', async ({ page }) => {
  await page.route('https://api.github.com/repos/example/repo/contents/**', route => route.fulfill({ json: [] }));
  await page.goto('./');
  await page.getByLabel('GitHub repository').fill('https://github.com/example/repo/tree/main/docs');
  await page.getByLabel('GitHub repository').press('Enter');
  await expect(page).toHaveURL(/repo=example%2Frepo&ref=main&dir=docs/);
  await expect(page.getByRole('heading', { name: /repo/ })).toBeVisible();
});
