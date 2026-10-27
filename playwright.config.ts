import { defineConfig } from '@playwright/test';

/**
 * Extension e2e launches its own persistent Chromium context with
 * --load-extension (see tests/e2e/extension.spec.ts). Keep this config minimal.
 * Note: extension tests require headed Chromium.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 90_000,
});
