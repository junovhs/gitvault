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
  const folder = page.locator('.file-row').filter({ hasText: 'Private folder · names hidden' });
  await expect(folder).toContainText('private-notes');
  await expect(folder).not.toContainText('.age');
  await folder.click();
  await expect(page).toHaveURL(/folder\.html#/);
  await expect(page.getByRole('heading', { name: 'A whole folder, under one lock.' })).toBeVisible();
  await page.getByLabel('Folder unlock method').selectOption('identity');
  await page.getByLabel('Folder password or private identity', { exact: true }).fill(identity);
  await page.getByRole('button', { name: 'Unlock folder' }).click();
  await expect(page.getByRole('heading', { name: 'Private folder contents' })).toBeVisible();
  await page.locator('.file-list').getByRole('button', { name: 'plans' }).click();
  await page.locator('.file-list').getByRole('button', { name: 'private-strategy.md' }).click();
  await expect(page.getByRole('heading', { name: 'Project strategy' })).toBeVisible();
  await expect(page.getByText('Not public.')).toBeVisible();
});

test('project context follows Add file and Add folder; bundle controls are initially optional', async ({ page }) => {
  await page.route('https://api.github.com/repos/example/repo/contents**', route => route.fulfill({ json: [] }));
  await page.goto('./#repo=example%2Frepo&ref=feature%2Fprivate');
  await page.getByRole('link', { name: 'Add a private file to this project' }).click();
  await expect(page.getByRole('heading', { name: 'Lock it before you publish it.' })).toBeVisible();
  const publishing = page.locator('details.publish-options');
  await expect(publishing).toHaveAttribute('open', '');
  await expect(page.getByLabel('Public repository', { exact: true })).toHaveValue('example/repo');
  await expect(page.getByLabel('Branch or commit (optional)', { exact: true })).toHaveValue('feature/private');
  await page.getByRole('link', { name: /Adding a private folder instead/ }).click();
  await expect(page).toHaveURL(/folder\.html#mode=encrypt/);
  await expect(page.getByLabel('Public repository for folder bundle')).toHaveValue('example/repo');
});

test('the regular Add a file screen starts without distracting publishing options', async ({ page }) => {
  await page.goto('./#page=encrypt');
  const publishing = page.locator('details.publish-options');
  await expect(publishing).not.toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: 'Encrypt file', exact: true })).toBeVisible();
  await publishing.locator('summary').click();
  await expect(page.getByLabel('Public repository', { exact: true })).toBeVisible();
});
