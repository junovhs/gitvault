import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { encrypt, decrypt } from '../../src/crypto.js';

// Passkeys need a registrable domain, so these flows use localhost rather than 127.0.0.1.
const BASE = 'http://localhost:4173/gitvault/';

async function virtualPhone(page: Page, context: BrowserContext, transport: 'cable' | 'internal' = 'cable', hasPrf = true) {
  const session = await context.newCDPSession(page);
  await session.send('WebAuthn.enable');
  const { authenticatorId } = await session.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', ctap2Version: 'ctap2_1', transport, hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf,
  } });
  return { session, authenticatorId };
}
async function chooseFile(page: Page, click: () => Promise<void>, file: { name: string; buffer: Buffer; mimeType?: string }) {
  const chooser = page.waitForEvent('filechooser'); await click();
  await (await chooser).setFiles({ mimeType: 'application/octet-stream', ...file });
}
async function makeKey(page: Page): Promise<string> {
  await page.goto(BASE + '#page=key');
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Make my key' }).click();
  const keyFile = await readFile((await (await saved).path())!, 'utf8');
  expect((await saved).suggestedFilename()).toBe('gitvault-key.txt');
  await chooseFile(page, () => page.getByRole('button', { name: 'Choose gitvault-key.txt' }).click(), { name: 'gitvault-key.txt', buffer: Buffer.from(keyFile) });
  await expect(page.getByText('Your key is ready and unlocked.')).toBeVisible();
  return keyFile;
}
async function lockNote(page: Page, title: string, text: string): Promise<Buffer> {
  await page.goto(BASE + '#page=encrypt');
  await page.getByLabel('Note title').fill(title);
  await page.getByLabel('Private note').fill(text);
  await page.getByRole('button', { name: 'Lock it' }).click();
  await expect(page.getByRole('heading', { name: 'Locked.' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download locked file' }).click();
  return readFile((await (await download).path())!);
}

test('make a key, add a phone, lock a note, and unlock it with the phone', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await virtualPhone(page, context, 'cable');
  await page.setViewportSize({ width: 1280, height: 900 });
  const keyFile = await makeKey(page);
  expect(keyFile).toMatch(/^# GitVault recovery key/);
  expect(await page.locator('body').innerText()).not.toContain('AGE-SECRET-KEY-');
  await mkdir('screenshots', { recursive: true });
  await page.screenshot({ path: 'screenshots/key-setup.png', fullPage: true });
  await page.getByRole('button', { name: 'Add my phone' }).click();
  await expect(page.getByText('Your phone is now your key.')).toBeVisible();

  const ciphertext = await lockNote(page, 'Launch plan', '# Launch plan\n\nShip it tonight.');
  // Standard age: the plain recovery file decrypts it with no GitVault code in the loop.
  expect(new TextDecoder().decode(await decrypt(ciphertext, { identity: keyFile }))).toBe('# Launch plan\n\nShip it tonight.');
  expect(new TextDecoder().decode(ciphertext.subarray(0, 64))).toContain('-> X25519');

  // Fresh tab state: key locked, then one tap with the phone opens the file.
  await page.goto(BASE + '#page=key'); await page.getByRole('button', { name: 'Lock now' }).click();
  await expect(page.getByRole('heading', { name: 'Your key is locked.' })).toBeVisible();
  await page.goto(BASE + '#page=open');
  await chooseFile(page, () => page.getByRole('button', { name: 'Choose a file' }).click(), { name: 'launch-plan.md.age', buffer: ciphertext });
  await expect(page.getByRole('button', { name: 'Unlock with my phone' })).toBeVisible();
  await page.screenshot({ path: 'screenshots/unlock-with-phone.png', fullPage: true });
  await page.getByRole('button', { name: 'Unlock with my phone' }).click();
  await expect(page.getByRole('heading', { name: 'Launch plan' })).toBeVisible();
  await page.screenshot({ path: 'screenshots/unlocked-note.png', fullPage: true });

  // While the key is unlocked, another file opens with no prompt at all.
  const second = await encrypt(new TextEncoder().encode('# Second\nNo prompt.'), { recipient: (await identityToRecipient(keyFile.split('\n').find(l => l.startsWith('AGE-SECRET-KEY-'))!)) });
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await chooseFile(page, () => page.getByRole('button', { name: 'Choose a file' }).click(), { name: 'second.md.age', buffer: Buffer.from(second) });
  await expect(page.getByRole('heading', { name: 'Second' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a phone without PRF is refused and the key file keeps working', async ({ page, context }) => {
  await virtualPhone(page, context, 'cable', false);
  await makeKey(page);
  await page.getByRole('button', { name: 'Add my phone' }).click();
  await expect(page.getByRole('alert')).toContainText('PRF');
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('heading', { name: 'Your key is unlocked.' })).toBeVisible();
});

test('a key file unlocks on a new device, and a different key is detected', async ({ page }) => {
  const identity = await generateIdentity(); const recipient = await identityToRecipient(identity);
  const mine = await encrypt(new TextEncoder().encode('# Mine'), { recipient });
  const other = await encrypt(new TextEncoder().encode('# Not mine'), { recipient: await identityToRecipient(await generateIdentity()) });
  await page.goto(BASE + '#page=open');
  await chooseFile(page, () => page.getByRole('button', { name: 'Choose a file' }).click(), { name: 'mine.md.age', buffer: Buffer.from(mine) });
  await chooseFile(page, () => page.getByRole('button', { name: 'Unlock with my key file' }).click(), { name: 'gitvault-key.txt', buffer: Buffer.from('# public key: ' + recipient + '\n' + identity + '\n') });
  await expect(page.getByRole('heading', { name: 'Mine' })).toBeVisible();
  await expect(page.locator('#key-chip')).toHaveAttribute('data-state', 'open');
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await chooseFile(page, () => page.getByRole('button', { name: 'Choose a file' }).click(), { name: 'other.md.age', buffer: Buffer.from(other) });
  await expect(page.getByText('This file was locked with a different key.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Not mine' })).toHaveCount(0);
});

test('first note walks through key setup, then locks without any password', async ({ page }) => {
  await page.goto(BASE + '#page=encrypt');
  await page.getByLabel('Note title').fill('Ideas');
  await page.getByLabel('Private note').fill('# Ideas\nOnly me.');
  await page.getByRole('button', { name: 'Lock it' }).click();
  await expect(page.getByRole('heading', { name: 'Make your key.' })).toBeVisible();
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Make my key' }).click();
  const keyFile = await readFile((await (await saved).path())!, 'utf8');
  await chooseFile(page, () => page.getByRole('button', { name: 'Choose gitvault-key.txt' }).click(), { name: 'gitvault-key.txt', buffer: Buffer.from(keyFile) });
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('heading', { name: 'Locked.' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download locked file' }).click();
  const file = await download; expect(file.suggestedFilename()).toBe('ideas.md.age');
  expect(new TextDecoder().decode(await decrypt(await readFile((await file.path())!), { identity: keyFile }))).toBe('# Ideas\nOnly me.');
});

test('setup refuses a key file that is not the one just made', async ({ page }) => {
  await page.goto(BASE + '#page=key');
  await page.getByRole('button', { name: 'Make my key' }).click();
  await chooseFile(page, () => page.getByRole('button', { name: 'Choose gitvault-key.txt' }).click(), { name: 'gitvault-key.txt', buffer: Buffer.from(await generateIdentity()) });
  await expect(page.getByRole('alert')).toContainText('not the recovery key created just now');
  await expect(page.locator('#key-chip')).toHaveAttribute('data-state', 'none');
});

test('sharing with a generated password produces a standard age password file', async ({ page }) => {
  await page.goto(BASE + '#page=encrypt');
  await page.getByLabel('Private note').fill('# Shared\nFor a friend.');
  await page.getByRole('button', { name: 'Share with a password' }).click();
  const password = (await page.locator('.password-box .generated').innerText()).trim();
  expect(password).toMatch(/^([a-z2-9]{5}-){4}[a-z2-9]{5}$/);
  await page.getByRole('button', { name: 'Lock it' }).click();
  await expect(page.getByRole('heading', { name: 'Locked.' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download locked file' }).click();
  const bytes = await readFile((await (await download).path())!);
  expect(new TextDecoder().decode(await decrypt(bytes, { passphrase: password }))).toBe('# Shared\nFor a friend.');
});

test('a repo shows its private files and one phone approval opens them', async ({ page, context }) => {
  await virtualPhone(page, context, 'cable');
  const keyFile = await makeKey(page);
  await page.getByRole('button', { name: 'Add my phone' }).click();
  await expect(page.getByText('Your phone is now your key.')).toBeVisible();
  const recipient = await identityToRecipient(keyFile.split('\n').find(l => l.startsWith('AGE-SECRET-KEY-'))!);
  const plan = await encrypt(new TextEncoder().encode('# Business plan\nPrivate.'), { recipient });
  await page.route('https://api.github.com/repos/example/project/contents/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/contents/') || url.pathname.endsWith('/contents')) return route.fulfill({ json: [
      { name: 'README.md', path: 'README.md', type: 'file', size: 120 },
      { name: 'private', path: 'private', type: 'dir', size: 0 },
      { name: 'plan.md.age', path: 'plan.md.age', type: 'file', size: plan.length },
      { name: 'plan.md', path: 'plan.md', type: 'file', size: 300 },
      { name: 'plan.md.qr.svg', path: 'plan.md.qr.svg', type: 'file', size: 900 },
    ] });
    return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(plan) });
  });
  await page.goto(BASE + '#page=key'); await page.getByRole('button', { name: 'Lock now' }).click();
  await page.goto(BASE);
  await page.getByLabel('GitHub repository').fill('https://github.com/example/project');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByText('1 private file here.')).toBeVisible();
  await expect(page.locator('.file-row')).toHaveCount(3); // landing page and QR are hidden
  await page.screenshot({ path: 'screenshots/repo-locked.png', fullPage: true });
  await page.getByRole('button', { name: 'Unlock with my phone' }).click();
  await expect(page.locator('.unlock-banner')).toContainText('Your key is unlocked.');
  await page.screenshot({ path: 'screenshots/repo-unlocked.png', fullPage: true });
  await page.getByRole('link', { name: /plan\.md/ }).click();
  await expect(page.getByRole('heading', { name: 'Business plan' })).toBeVisible();
  // Recent repos are remembered by public name only.
  await page.goto(BASE);
  await expect(page.getByRole('link', { name: 'example/project' })).toBeVisible();
});
