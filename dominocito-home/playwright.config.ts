import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — Dominócito home
 *
 * Levanta Vite dev server (npm run dev) en :5173 y corre tests E2E.
 * Backend (tRPC + REST) debe estar corriendo en :3200 para que los
 * tests end-to-end funcionen; el dev server Vite hace proxy de
 * /trpc y /api hacia :3200.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // serial: tests comparten la DB de Lottopro
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
