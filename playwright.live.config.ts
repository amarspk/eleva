import { defineConfig, devices } from '@playwright/test';

/**
 * Live Phase 3 verification config.
 *
 * Used by CI job `e2e-live` (.github/workflows/ci.yml) and by the local
 * native-runtime recipe (PROJECT_STATE §19). The stack — PostgreSQL, Redis,
 * compiled API on :8000, qr-menu production build on :3000 — is provisioned
 * and health-checked by the job itself, so this config deliberately has NO
 * `webServer` entries (the previous `npx --yes pnpm` webServer overhead is
 * what made the earlier sandbox attempts time out).
 *
 * Only the live spec (verify-phase3-live.spec.ts) matches here; the mocked
 * specs keep running under the default playwright.config.ts.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /verify-phase3-live\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['line']],
  timeout: 90000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://albaik.localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
