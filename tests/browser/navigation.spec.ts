import { test, expect } from '@playwright/test';

test('skip link moves keyboard focus without changing the application route', async ({ page }) => {
  await page.goto('./#page=encrypt');
  await expect(page.getByRole('heading', { name: 'Start with a note or file.' })).toBeVisible();
  const before = page.url();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  expect(page.url()).toBe(before);
  await expect(page.getByRole('heading', { name: 'Start with a note or file.' })).toBeVisible();
});

test('route changes move focus to the new main region and reset scroll', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'More', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'More, when you need it.' })).toBeVisible();
  await page.getByRole('link', { name: 'How GitVault works', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'One repo. Two kinds of files.' })).toBeVisible();
  await expect(page.locator('main')).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test('folder entrypoint supports the same keyboard skip behavior', async ({ page }) => {
  await page.goto('./folder.html#mode=encrypt');
  await expect(page.getByRole('heading', { name: 'Keep the names private, too.' })).toBeVisible();
  const before = page.url();
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  expect(page.url()).toBe(before);
});

test('the main product surface stays small while advanced routes remain reachable', async ({ page }) => {
  await page.goto('./');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation.getByRole('link')).toHaveText(['Workspace', 'Add a file', 'More']);
  await expect(page.locator('.folder-announcement')).toHaveCount(0);
  await page.getByRole('link', { name: 'More', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'More, when you need it.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open a concealed folder (experimental)' })).toHaveAttribute('href', './folder.html');
  await page.getByRole('link', { name: 'Passkey lab (experimental)' }).click();
  await expect(page.getByRole('heading', { name: 'Your device is a key. Keep a spare.' })).toBeVisible();
});
