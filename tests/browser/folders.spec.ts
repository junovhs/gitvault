import { test, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { unzipSync } from 'fflate';
import { decrypt } from '../../src/crypto.js';
import { unpackFolder } from '../../src/folder-format.js';

test('folder experiment hides filenames, browses after unlock and exports only on request', async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gitvault-folder-browser-'));
  const identity = await generateIdentity(); const recipient = await identityToRecipient(identity);
  await mkdir(path.join(root, 'plans'));
  await writeFile(path.join(root, 'plans/private-strategy.md'), '# Private folder strategy\nOnly visible after unlocking.');
  await writeFile(path.join(root, 'attachment.bin'), Buffer.from([0, 255, 128]));
  const external: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url()); });
  try {
    await page.goto('./folder.html#mode=encrypt');
    await page.getByLabel('Private folder on this device').setInputFiles(root);
    await page.getByLabel('Folder encryption method').selectOption('recipient');
    await page.getByLabel('Folder password or public recipient', { exact: true }).fill(recipient);
    await page.getByLabel('Public repository for folder bundle').fill('example/repo');
    await page.getByRole('button', { name: 'Encrypt folder + GitHub bundle', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download folder GitHub bundle', exact: true }).click();
    const download = await downloadPromise; const bundled = unzipSync(await readFile((await download.path())!));
    expect(Object.keys(bundled).sort()).toEqual(['private-folders/private-folder.gvfolder.age', 'private-folders/private-folder.gvfolder.md', 'private-folders/private-folder.gvfolder.qr.svg']);
    const ciphertext = bundled['private-folders/private-folder.gvfolder.age'];
    const contents = unpackFolder(await decrypt(ciphertext, { identity }));
    expect(contents.map(f => f.path).sort()).toEqual(['attachment.bin', 'plans/private-strategy.md']);
    const landing = new TextDecoder().decode(bundled['private-folders/private-folder.gvfolder.md']);
    expect(landing).toContain('folder.html#'); expect(landing).not.toContain('private-strategy');
    await page.goto('./folder.html');
    await page.getByLabel('Encrypted folder file').setInputFiles({ name: 'private-folder.gvfolder.age', mimeType: 'application/octet-stream', buffer: Buffer.from(ciphertext) });
    await page.getByRole('button', { name: 'Open encrypted folder', exact: true }).click();
    await page.getByLabel('Folder unlock method').selectOption('identity');
    await page.getByLabel('Folder password or private identity', { exact: true }).fill(identity);
    await page.getByRole('button', { name: 'Unlock folder', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Private folder contents' })).toBeVisible();
    await page.locator('.file-list').getByRole('button', { name: /plans/ }).click();
    await page.locator('.file-list').getByRole('button', { name: /private-strategy.md/ }).click();
    await expect(page.getByRole('heading', { name: 'Private folder strategy', exact: true })).toBeVisible();
    await mkdir('screenshots', { recursive: true });
    await page.screenshot({ path: 'screenshots/unlocked-folder.png', fullPage: true });
    const plaintextDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download plaintext folder ZIP', exact: true }).click();
    const zip = await plaintextDownload; const plainFiles = unzipSync(await readFile((await zip.path())!));
    expect(Object.keys(plainFiles).sort()).toEqual(['attachment.bin', 'plans/private-strategy.md']);
    await page.getByRole('button', { name: 'Lock folder', exact: true }).click();
    await expect(page.getByLabel('Encrypted folder file')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Private folder strategy', exact: true })).toHaveCount(0);
    expect(external).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('folder page stays usable at a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('./folder.html#mode=encrypt');
  await expect(page.getByRole('heading', { name: 'Keep the names private, too.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
