import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: /auth\.setup\.js/,
  // 2026-07-20: 30s left ZERO headroom for a per-test cold load (fresh profile
  // → no IDB cache → full backend chunk + prod-Firestore hydration ≈ 25-35s on
  // a loaded machine) — beforeEach goToTab timed out with the tab ALREADY
  // rendered on the failure screenshot. 60s = load headroom; per-assert speed
  // is still governed by each spec's own expect timeouts.
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
  },
  // Skip the local dev server when targeting a remote deployment (E2E_BASE_URL).
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 15000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
