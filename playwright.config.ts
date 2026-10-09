import { defineConfig } from '@playwright/test';
const browser = process.env.GITVAULT_BROWSER || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(browser)) throw new Error('Unsupported GITVAULT_BROWSER');
export default defineConfig({
  testDir: './tests/browser',
  ...(browser !== 'chromium' ? { testMatch: '**/compat.spec.ts' } : {}),
  timeout: 120000,
  expect: { timeout: 15000 },
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173/gitvault/', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173/gitvault/', reuseExistingServer: !process.env.CI },
  projects: [{ name: browser, use: { browserName: browser as 'chromium' | 'firefox' | 'webkit' } }],
});
