import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const DEV_PORT = 5173;
const isCI = Boolean(process.env.CI);

/**
 * E2E suite runs against the optimized production build (`vite preview`), which is also what
 * gets deployed. Mobile runs use Chromium with a touch-enabled landscape phone profile.
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Software WebGL (SwiftShader) is CPU bound; more parallel pages slow every test down.
  workers: 2,
  timeout: 45_000,
  expect: {
    timeout: 7_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide' },
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Fixed locale and timezone: dates in the log render identically everywhere.
    locale: 'en-GB',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7 landscape'] },
    },
    {
      // The production build does not double-invoke effects; the dev server runs React Strict
      // Mode for real, so the PixiJS lifecycle is also verified under it.
      name: 'desktop-dev-strict-mode',
      testMatch: ['lifecycle.spec.ts', 'assets.spec.ts'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, baseURL: `http://localhost:${DEV_PORT}` },
    },
  ],
  webServer: [
    {
      command: 'npm run build && npm run preview',
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
    },
    {
      command: 'npm run dev',
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
