import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 35_000,
  expect: { timeout: 5000 },
  workers: 1,
  retries: 0,
  use: { browserName: 'chromium', serviceWorkers: 'block', acceptDownloads: false },
});
