import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
// @playwright/test is NOT in package.json as it is provided implicitly by playwright-bdd.
const testDir = defineBddConfig({
  featuresRoot: 'features',
  features: 'features/**/*.feature',
  steps: ['step-definitions/**/*.ts', 'fixtures/index.ts'],
});

export default defineConfig({
  testDir,
  timeout: 120_000,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:3000',
    headless: process.env['HEADLESS'] !== 'false',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});