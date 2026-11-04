import { expect, test, type Page } from '@playwright/test';
import { publishedPosts } from './helpers';

// SEO and migration safety (REDESIGN_PLAN.md Phase 7): head tags, robots.txt,
// the sitemap and the kill switch for the old site's service worker.
// The post tags (BlogPosting, article meta) are checked on the example draft
// in dev/post.spec.ts.

const SITE = 'https://sagar-pal.dev';

const meta = (page: Page, property: string) =>
  page.locator(`head meta[property="${property}"]`);

test('home: canonical URL, Open Graph tags and the Person JSON-LD', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${SITE}/`,
  );
  await expect(meta(page, 'og:url')).toHaveAttribute('content', `${SITE}/`);
  await expect(meta(page, 'og:type')).toHaveAttribute('content', 'website');
  await expect(meta(page, 'og:image')).toHaveAttribute(
    'content',
    `${SITE}/og/default.png`,
  );
  await expect(page.locator('head meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  );
  const jsonLd = await page
    .locator('head script[type="application/ld+json"]')
    .textContent();
  expect(JSON.parse(jsonLd ?? '')).toMatchObject({
    '@type': 'Person',
    name: 'Sagar Pal',
  });
});

for (const path of ['/projects/', '/publications/', '/what-im-reading/']) {
  test(`${path}: canonical URL, no JSON-LD`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${SITE}${path}`,
    );
    await expect(page.locator('head meta[name="robots"]')).toHaveCount(0);
    await expect(
      page.locator('head script[type="application/ld+json"]'),
    ).toHaveCount(0);
  });
}

test('404: not indexed and no canonical URL', async ({ page }) => {
  await page.goto('/no-such-page/');
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow',
  );
  await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0);
  await expect(meta(page, 'og:url')).toHaveCount(0);
});

test('robots.txt keeps crawlers out of the admin and API and names the sitemap', async ({
  request,
}) => {
  const body = await (await request.get('/robots.txt')).text();
  expect(body).toContain('Disallow: /admin');
  expect(body).toContain('Disallow: /api/');
  expect(body).toContain(`Sitemap: ${SITE}/sitemap-index.xml`);
});

test('the sitemap lists the public pages and not the 404 page', async ({
  request,
}) => {
  const index = await (await request.get('/sitemap-index.xml')).text();
  expect(index).toContain(`${SITE}/sitemap-0.xml`);
  const body = await (await request.get('/sitemap-0.xml')).text();
  const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const posts = await publishedPosts(request);
  expect(urls.sort()).toEqual(
    [
      '/',
      '/blog/',
      '/projects/',
      '/publications/',
      '/what-im-reading/',
      ...posts.map((p) => p.url),
    ]
      .map((p) => `${SITE}${p}`)
      .sort(),
  );
});

// A stand-in for the old Chirpy worker: it caches "/" and answers from the
// cache first, so the visitor keeps seeing the old page.
const OLD_WORKER = `
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open('chirpy-old').then((cache) =>
    cache.put('/', new Response('<!doctype html><title>Old site</title><h1>Old site</h1>',
      { headers: { 'Content-Type': 'text/html' } }))));
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
});
`;

test('a visitor of the old site gets the new one after one reload', async ({
  page,
  context,
}) => {
  // 1. The old site: its worker at /sw.min.js controls the page.
  await context.route('**/sw.min.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: OLD_WORKER }),
  );
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.min.js');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Old site' }),
  ).toBeVisible();

  // 2. The new site is deployed: /sw.min.js is now the kill switch.
  await context.unroute('**/sw.min.js');

  // 3. One reload: the browser checks the worker for an update, the kill
  //    switch takes over and reloads the tab from the network.
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sagar Pal' }),
  ).toBeVisible();
  const state = await page.evaluate(async () => ({
    caches: await caches.keys(),
    workers: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  expect(state).toEqual({ caches: [], workers: 0 });
});
