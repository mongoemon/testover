import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
// One id per Playwright run, inherited by the workers: see tenantFor() in tests/support/evidence.ts.
process.env.PW_RUN_ID ??= Date.now().toString(36);
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: {
    timeout: 7_000,
    toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.01 },
  },
  // One baseline per screen, no OS suffix: baselines are only ever generated on Linux.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  reporter: [
    ['list'],
    // On CI, also turn each failure into an inline annotation on the run/PR.
    ...(isCI ? [['github'] as const] : []),
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['allure-playwright', { resultsDir: 'allure-results' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Start the bundled demo app unless an external BASE_URL is given.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'node app/server.mjs',
        url: BASE_URL,
        env: { PORT: String(PORT) },
        reuseExistingServer: !isCI,
        timeout: 15_000,
      },
});
