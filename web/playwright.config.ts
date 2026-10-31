import { defineConfig, devices } from '@playwright/test';

// Tests run against `astro preview`, which serves the existing `dist/` build.
// Run `npm run build` first (the Makefile and CI do this before `npm run test:e2e`).
// Port 4322 avoids a clash with `astro dev` on 4321.
// `--ignore-lock` keeps the server in the foreground: Astro 7 auto-backgrounds
// `astro preview` when it detects an AI agent, and Playwright then sees the
// command exit early.
const PORT = 4322;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run preview -- --port ${PORT} --ignore-lock`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
