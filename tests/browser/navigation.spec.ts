import { test, expect } from '@playwright/test';

test('skip link moves keyboard focus without changing the application route', async ({ page }) => {
  await page.goto('./#page=encrypt');
  await expect(page.getByRole('heading', { name: 'Lock it before you publish it.' })).toBeVisible();
  const before = page.url();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  expect(page.url()).toBe(before);
  await expect(page.getByRole('heading', { name: 'Lock it before you publish it.' })).toBeVisible();
});

test('route changes move focus to the new main region and reset scroll', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'How it works', exact: true }).click();
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
