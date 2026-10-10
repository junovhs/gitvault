import { test, expect } from '@playwright/test';

test('skip link moves keyboard focus without changing the application route', async ({ page }) => {
  await page.goto('./#page=about');
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
  const before = page.url();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  expect(page.url()).toBe(before);
});

test('route changes move focus to the new main region and reset scroll', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'More tools', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'More tools' })).toBeVisible();
  await page.locator('main').getByRole('link', { name: 'How it works', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
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

test('the main surface is one box and two choices; advanced routes stay reachable', async ({ page }) => {
  await page.goto('./');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation.getByRole('link')).toHaveText(['New note', 'Get your key']);
  await expect(page.getByLabel('GitHub repository')).toBeFocused();
  await expect(page.locator('main button')).toHaveCount(1);
  await expect(page.locator('.folder-announcement, .security-note')).toHaveCount(0);
  await page.getByRole('link', { name: 'More tools', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Private folders' })).toHaveAttribute('href', './folder.html');
  await page.getByRole('link', { name: 'Passkey lab' }).click();
  await expect(page.getByRole('heading', { name: 'Passkey lab' })).toBeVisible();
});
