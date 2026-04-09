import { defineConfig } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.join(import.meta.dirname, '.auth/state.json');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 15000,
  },
  projects: [
    // Setup project: login once
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },
    // All tests: reuse auth state from setup
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.js/,
    },
  ],
});
