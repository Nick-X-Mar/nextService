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
    // The service worker (public/sw.js) stays out of every spec but the PWA
    // ones, which allow it: requests a worker handles never reach page.route.
    serviceWorkers: 'block',
    // Garages are asked about push notifications as soon as they sign in
    // (PwaManager), and a client's requests offer the app (InstallAppNudge);
    // both cards would sit among what other specs press and count. Already
    // answered «Όχι τώρα» here, for good. The pwa specs start without it.
    storageState: {
      cookies: [],
      origins: [{
        origin: 'http://localhost:3000',
        localStorage: [
          { name: 'pushPrompt.dismissedAt', value: '99999999999999' },
          { name: 'installNudge.dismissedAt', value: '99999999999999' },
        ],
      }],
    },
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
