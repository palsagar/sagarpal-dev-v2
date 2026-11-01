import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  THEMES,
  WIDTHS,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  storeTheme,
} from './helpers';

// Blog in the production build (REDESIGN_PLAN.md Phase 4 "done when"):
// zero posts, the empty state, a valid empty manifest, and no trace of the
// example draft. The draft itself is tested under `astro dev` (dev/post.spec.ts).

const DRAFT_SLUG = 'example-draft';
const DRAFT_TITLE = 'Example draft: every post component';

test('/blog/ shows the empty state without search or filters', async ({
  page,
}) => {
  await page.goto('/blog/');
  await expect(page).toHaveTitle('Writing — Sagar Pal');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Writing' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Long-form notes on numerical methods, high-performance computing and machine learning for science.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Nothing published yet.' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'The first post is on its way. Subscribe to the RSS feed to get it when it lands.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Subscribe via RSS' }),
  ).toHaveAttribute('href', '/feed.xml');
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(
    page.getByRole('group', { name: 'Filter by topic' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', {
      name: 'Writing',
    }),
  ).toHaveAttribute('aria-current', 'page');
});

for (const theme of THEMES) {
  for (const [label, width] of Object.entries(WIDTHS)) {
    test(`/blog/ empty state at ${label} (${theme}): no sideways scroll, no axe violations`, async ({
      page,
    }) => {
      await storeTheme(page, theme);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/blog/');
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }
}

test('content-manifest.json is valid and lists no posts', async ({
  request,
}) => {
  const response = await request.get('/content-manifest.json');
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toEqual({
    generated_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/),
    site: 'https://sagar-pal.dev',
    posts: [],
  });
});

test('the draft post is not built', async ({ request }) => {
  const response = await request.get(`/blog/${DRAFT_SLUG}/`);
  expect(response.status()).toBe(404);
});

test('nothing in the build mentions the draft (pages, sitemap, assets)', () => {
  // Reads the local dist/, so it says nothing about a deployed site.
  test.skip(!!process.env.BASE_URL, 'checks the local build');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(html|xml|json|js|css|txt)$/.test(name)) files.push(path);
    }
  };
  walk('dist');
  expect(files.length).toBeGreaterThan(0);
  const leaks = files.filter((f) => {
    const text = readFileSync(f, 'utf8');
    return text.includes(DRAFT_SLUG) || text.includes(DRAFT_TITLE);
  });
  expect(leaks).toEqual([]);
});

test('home has no Writing section and keeps "View projects"', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#writing')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View projects' })).toBeVisible();
});
