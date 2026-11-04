import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  THEMES,
  WIDTHS,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  publishedPosts,
  storeTheme,
} from './helpers';

// Blog in the production build (REDESIGN_PLAN.md Phase 4 "done when"): the
// empty state while there are no posts, a valid manifest, every published post,
// and no trace of the example drafts. The drafts themselves are tested under
// `astro dev` (dev/post.spec.ts, dev/markdown-post.spec.ts).

const DRAFTS = [
  { slug: 'example-draft', title: 'Example draft: every post component' },
  { slug: 'example-markdown', title: 'Example draft: plain Markdown' },
];

test('/blog/ shows the empty state without search or filters', async ({
  page,
  request,
}) => {
  const posts = await publishedPosts(request);
  test.skip(posts.length > 0, 'the empty state shows only with 0 posts');
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
    test(`/blog/ at ${label} (${theme}): no sideways scroll, no axe violations`, async ({
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

test('content-manifest.json is valid', async ({ request }) => {
  const response = await request.get('/content-manifest.json');
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toEqual({
    generated_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/),
    site: 'https://sagar-pal.dev',
    posts: expect.any(Array),
  });
});

// Each new post gets these checks without a new test.
for (const theme of THEMES) {
  test(`every published post (${theme}): complete, no sideways scroll, no axe violations`, async ({
    page,
    request,
  }) => {
    const posts = await publishedPosts(request);
    test.setTimeout(30_000 * Math.max(1, posts.length));
    await storeTheme(page, theme);
    for (const post of posts) {
      // new-post.mjs writes TODO in the dek.
      expect(post.dek, post.slug).not.toContain('TODO');
      for (const width of [WIDTHS.phone, WIDTHS.desktop]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(post.url);
        await expect(
          page.getByRole('heading', { level: 1, name: post.title }),
        ).toBeVisible();
        await expectNoHorizontalScroll(page);
        await expectNoAxeViolations(page);
      }
    }
  });
}

test('the drafts are not built', async ({ request }) => {
  for (const { slug } of DRAFTS) {
    const response = await request.get(`/blog/${slug}/`);
    expect(response.status()).toBe(404);
  }
});

test('nothing in the build mentions the drafts (pages, sitemap, assets)', () => {
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
    return DRAFTS.some((d) => text.includes(d.slug) || text.includes(d.title));
  });
  expect(leaks).toEqual([]);
});

test('home shows the Writing section only with posts', async ({
  page,
  request,
}) => {
  const posts = await publishedPosts(request);
  await page.goto('/');
  await expect(page.locator('#writing')).toHaveCount(posts.length ? 1 : 0);
  await expect(page.locator('#writing .writing__row')).toHaveCount(
    Math.min(posts.length, 3),
  );
});
