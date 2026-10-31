import { defineConfig, devices } from '@playwright/test';

// Two servers:
// - `build` project: `astro preview` on :4322 serves the existing `dist/` build.
//   Run `npm run build` first (the Makefile and CI do this before `npm run test:e2e`).
// - `dev` project: `astro dev` on :4323, for dev-only pages such as /styleguide/.
// Ports differ from `astro dev` on 4321 so tests never clash with a running dev server.
// `--ignore-lock` keeps each server in the foreground: Astro 7 auto-backgrounds
// `astro dev`/`astro preview` when it detects an AI agent, and Playwright then sees
// the command exit early.
const PREVIEW_PORT = 4322;
const DEV_PORT = 4323;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Reduced motion by default: the hero simulation then waits for "Play", so
  // pages do not all run WebGL at once (headless Chromium renders it on the
  // CPU). Tests about motion opt in with emulateMedia({ reducedMotion: 'no-preference' }).
  use: { reducedMotion: 'reduce' },
  projects: [
    {
      name: 'build',
      testIgnore: /dev\//,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${PREVIEW_PORT}`,
      },
    },
    {
      name: 'dev',
      testMatch: /dev\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${DEV_PORT}`,
      },
    },
  ],
  webServer: [
    {
      command: `npm run preview -- --port ${PREVIEW_PORT} --ignore-lock`,
      url: `http://localhost:${PREVIEW_PORT}/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run dev -- --port ${DEV_PORT} --ignore-lock`,
      url: `http://localhost:${DEV_PORT}/styleguide/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
