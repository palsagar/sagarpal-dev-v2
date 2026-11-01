import { defineConfig, devices } from '@playwright/test';

// Three servers:
// - `build` project: `astro preview` on :4322 serves the existing `dist/` build.
//   Run `npm run build` first (the Makefile and CI do this before `npm run test:e2e`).
// - `dev` project: `astro dev` on :4323, for dev-only pages such as /styleguide/.
// - `api` project: FastAPI on :8001 serves the same `dist/` with the real API
//   (tests/e2e/api/serve.sh: throwaway secrets, a fresh database). Needs uv.
// Ports differ from `make dev` (4321, 8000) so tests never clash with it.
// `--ignore-lock` keeps each server in the foreground: Astro 7 auto-backgrounds
// `astro dev`/`astro preview` when it detects an AI agent, and Playwright then sees
// the command exit early.
const PREVIEW_PORT = 4322;
const DEV_PORT = 4323;
const API_PORT = 8001;
// BASE_URL (for example https://next.sagar-pal.dev) runs the `build` tests
// against a deployed site instead: no local servers, no `dev` or `api` project.
const BASE_URL = process.env.BASE_URL;

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
      testIgnore: /(dev|api)\//,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL ?? `http://localhost:${PREVIEW_PORT}`,
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
    {
      name: 'api',
      testMatch: /api\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${API_PORT}`,
      },
    },
  ].filter((p) => !BASE_URL || p.name === 'build'),
  webServer: BASE_URL
    ? []
    : [
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
        {
          command: 'sh tests/e2e/api/serve.sh',
          url: `http://localhost:${API_PORT}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
