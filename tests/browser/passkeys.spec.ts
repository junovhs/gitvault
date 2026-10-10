import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { decrypt } from '../../src/crypto.js';

test('virtual PRF authenticator encrypts, unlocks and leaves an independent recovery route', async ({ page, context }) => {
  const session = await context.newCDPSession(page);
  await session.send('WebAuthn.enable');
  const { authenticatorId } = await session.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true,
  } });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('http://localhost:4173/gitvault/#page=passkeys');
  await page.getByRole('button', { name: 'Create encryption passkey' }).click();
  await expect(page.getByText('Passkey ready. PRF support was confirmed during creation.')).toBeVisible();
  await page.getByRole('button', { name: 'Generate recovery key' }).click();
  const recoveryDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download recovery key' }).click();
  const recoveryFile = await recoveryDownload; const recovery = await readFile((await recoveryFile.path())!, 'utf8');
  await page.getByLabel('I saved the recovery key outside my public repository.').check();
  await page.getByLabel('Document for passkey encryption').setInputFiles({ name: 'passkey-note.md', mimeType: 'text/markdown', buffer: Buffer.from('# Passkey unlocked\nRecovery is independent.') });
  await page.getByRole('button', { name: 'Encrypt with passkey + recovery' }).click();
  await expect(page.getByRole('button', { name: 'Download passkey-encrypted file' })).toBeVisible();
  // The page never displays the private recovery identity. Publish synthetic UI only.
  expect(await page.locator('body').innerText()).not.toContain('AGE-SECRET-KEY-');
  await mkdir('screenshots', { recursive: true });
  await page.screenshot({ path: 'screenshots/passkey-lab.png', fullPage: true });
  const cipherDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download passkey-encrypted file' }).click();
  const cipherFile = await cipherDownload; const ciphertext = await readFile((await cipherFile.path())!);
  expect(new TextDecoder().decode(await decrypt(ciphertext, { identity: recovery }))).toBe('# Passkey unlocked\nRecovery is independent.');
  await page.goto('http://localhost:4173/gitvault/#page=open');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a file' }).click();
  await (await chooser).setFiles({ name: 'passkey-note.md.age', mimeType: 'application/octet-stream', buffer: ciphertext });
  await page.getByRole('button', { name: 'Unlock with passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Passkey unlocked' })).toBeVisible();
  await session.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  expect(new TextDecoder().decode(await decrypt(ciphertext, { identity: recovery }))).toContain('Recovery is independent.');
});

test('authenticator without PRF cannot masquerade as an encryption-capable passkey', async ({ page, context }) => {
  const session = await context.newCDPSession(page); await session.send('WebAuthn.enable');
  await session.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: false,
  } });
  await page.goto('http://localhost:4173/gitvault/#page=passkeys');
  await page.getByRole('button', { name: 'Create encryption passkey' }).click();
  await expect(page.getByRole('alert')).toContainText('PRF');
  await expect(page.getByRole('button', { name: 'Download passkey-encrypted file' })).toHaveCount(0);
});
