import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  /**
   * Chromium runs the whole suite. Firefox and WebKit run only the specs that
   * exist to catch engine-specific behaviour, so the common case stays a
   * single pass instead of three.
   */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /.*\.mobile\.spec\.ts/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: /.*cross-browser\.spec\.ts/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: /.*cross-browser\.spec\.ts/,
    },
    /**
     * Nearly every client is on a phone. `*.mobile.spec.ts` runs on an iPhone
     * (WebKit, Safari's engine) and on a 360px Android — the narrowest common
     * width, where layouts that fit an iPhone still spill sideways.
     */
    {
      name: 'mobile-iphone',
      use: { ...devices['iPhone 13'] },
      testMatch: /.*\.mobile\.spec\.ts/,
    },
    {
      name: 'mobile-android',
      use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 } },
      testMatch: /.*\.mobile\.spec\.ts/,
    },
  ],
})
