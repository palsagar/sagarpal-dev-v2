import { expect, test, type Page } from '@playwright/test';
import {
  THEMES,
  WIDTHS,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  storeTheme,
} from '../helpers';

// The example draft post under `astro dev` (REDESIGN_PLAN.md Phase 4): it
// exercises every post component. The API (Phase 5) is not running here, so
// /api calls fail unless a test mocks them with page.route().

const URL_ = '/blog/example-draft/';

// No API by default (the dev server's proxy would log every refused call).
// Tests that need it route the endpoints they use; later routes win.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());
});
const SLUG = 'example-draft';

/** Each scrollable box (code, display math) scrolls inside itself, stays
 *  within the viewport, and is reachable by keyboard. */
async function expectBoxesScrollInside(page: Page) {
  const boxes = await page
    .locator('.prose pre, .prose .katex-display')
    .evaluateAll((els) =>
      els.map((el) => ({
        cls: el.className,
        scrolls: el.scrollWidth > el.clientWidth,
        overflowX: getComputedStyle(el).overflowX,
        right: el.getBoundingClientRect().right,
        tabbable: (el as HTMLElement).tabIndex >= 0,
      })),
    );
  expect(boxes.length).toBeGreaterThanOrEqual(5);
  const width = page.viewportSize()!.width;
  for (const b of boxes) {
    expect(b.right, b.cls).toBeLessThanOrEqual(width + 0.5);
    if (b.scrolls) {
      expect(b.overflowX, b.cls).toBe('auto');
      expect(b.tabbable, b.cls).toBe(true);
    }
  }
}

test('header, hero figure and numbering', async ({ page }) => {
  await page.goto(URL_);
  await expect(page).toHaveTitle(
    'Example draft: every post component — Sagar Pal',
  );
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Example draft: every post component',
    }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'All writing' })).toHaveAttribute(
    'href',
    '/blog/',
  );
  const meta = page.locator('.post__meta');
  await expect(meta).toContainText('30 October 2026');
  await expect(meta).toContainText(/\d+ min read/);
  await expect(meta).toContainText('Numerics, GPU');
  await expect(page.locator('.post__hero figcaption')).toContainText(
    'Figure 1. The mitosis preset',
  );
  // Body figures count on from the hero: Figure 2 (image), Figure 3 (live).
  await expect(page.locator('.post-figure figcaption')).toHaveText(
    /^Figure 2\. /,
  );
  await expect(page.locator('.live-field figcaption')).toHaveText(
    /^Figure 3\. /,
  );
});

test('equations: KaTeX with MathML and numbers', async ({ page }) => {
  await page.goto(URL_);
  await expect(page.locator('.prose .katex-display')).toHaveCount(3);
  await expect(page.locator('.prose .katex-display math')).toHaveCount(3);
  await expect(page.locator('.prose .katex-display .tag')).toHaveText([
    '(1)',
    '(2)',
    '(3)',
  ]);
  // KaTeX fonts are self-hosted.
  const fontUrls = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((n) => /KaTeX_.*\.woff2/.test(n)),
  );
  expect(fontUrls.length).toBeGreaterThan(0);
  for (const u of fontUrls)
    expect(new URL(u).host).toBe(new URL(page.url()).host);
});

test('code: filename caption, token colours follow the theme', async ({
  page,
}) => {
  await storeTheme(page, 'night');
  await page.goto(URL_);
  const figure = page.locator('.code-figure');
  await expect(figure.locator('figcaption')).toHaveText('step.frag');
  const keyword = figure
    .locator('span[style*="--shiki-token-keyword"]')
    .first();
  await expect(keyword).toHaveCSS('color', 'rgb(108, 195, 202)'); // --teal night
  await page.getByRole('button', { name: 'Switch to day theme' }).click();
  await expect(keyword).toHaveCSS('color', 'rgb(31, 111, 122)'); // --teal day
  await expect(figure.locator('pre')).toHaveCSS(
    'background-color',
    'rgb(231, 235, 239)', // --surface day
  );
});

test('headings link to themselves', async ({ page }) => {
  await page.goto(URL_);
  const h2 = page.locator('.prose h2').first();
  await expect(h2).toHaveAttribute('id', 'the-equations');
  await expect(h2.locator('a')).toHaveAttribute('href', '#the-equations');
});

test('desktop: sticky contents and margin sidenotes', async ({ page }) => {
  await page.setViewportSize({ width: WIDTHS.desktop, height: 900 });
  await page.goto(URL_);
  const toc = page.getByRole('navigation', { name: 'On this page' });
  await expect(toc).toBeVisible();
  await expect(toc.getByRole('link')).toHaveText([
    'The equations',
    'On the GPU',
    'Try the parameters',
    'Checklist',
  ]);
  await expect(page.locator('.post__toc-sheet')).toBeHidden();

  // Notes sit in the right margin, beside the paragraph's measure.
  const para = await page.locator('.prose > p').first().boundingBox();
  const note = await page.locator('#sn-1').boundingBox();
  expect(note!.x).toBeGreaterThanOrEqual(para!.x + para!.width + 40);
  await expect(page.locator('.sn-ref__btn').first()).toBeHidden();
  await expect(page.locator('.sn-ref__link').first()).toBeVisible();

  // The current section follows the scroll.
  await page.locator('#on-the-gpu').scrollIntoViewIfNeeded();
  await page.evaluate(() =>
    scrollTo(0, document.getElementById('on-the-gpu')!.offsetTop - 40),
  );
  await expect(toc.getByRole('link', { name: 'On the GPU' })).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('phone: contents in <details>, sidenotes behind buttons', async ({
  page,
}) => {
  await page.setViewportSize({ width: WIDTHS.phone, height: 800 });
  await page.goto(URL_);
  const sheet = page.locator('.post__toc-sheet');
  await expect(sheet).toBeVisible();
  await sheet.locator('summary').click();
  await expect(sheet.getByRole('link', { name: 'On the GPU' })).toBeVisible();

  const button = page.getByRole('button', { name: 'Show note 1' });
  const note = page.locator('#sn-1');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(note).toBeHidden();
  await button.click();
  await expect(note).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Hide note 1' }),
  ).toHaveAttribute('aria-expanded', 'true');
});

test('without JS: sidenotes stay readable inline', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: WIDTHS.phone, height: 800 },
  });
  const page = await context.newPage();
  await page.goto(URL_);
  await expect(page.locator('#sn-1')).toBeVisible();
  await expect(page.locator('.sn-ref__btn').first()).toBeHidden();
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeHidden();
  await context.close();
});

for (const theme of THEMES) {
  for (const [label, width] of Object.entries(WIDTHS)) {
    test(`layout at ${label} (${theme}): no sideways scroll, boxes scroll inside, no axe violations`, async ({
      page,
    }) => {
      await storeTheme(page, theme);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(URL_);
      await expectNoHorizontalScroll(page);
      await expectBoxesScrollInside(page);
      await expectNoAxeViolations(page);
    });
  }
}

test('Copy link copies the canonical URL and announces it', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(URL_);
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.locator('[data-copy-status]')).toHaveText('Link copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(`https://sagar-pal.dev${URL_}`);
  await expect(
    page.getByRole('link', { name: 'Follow by RSS' }),
  ).toHaveAttribute('href', '/feed.xml');
});

test('without the API: no Useful button and no read count', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto(URL_);
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
  await expect(page.locator('[data-useful]')).toBeHidden();
  await expect(page.locator('[data-reads]')).toBeHidden();
});

test('with the API: Useful (optimistic), read count, view after scrolling', async ({
  page,
}) => {
  const posts: string[] = [];
  await page.route(`**/api/posts/${SLUG}/stats`, (route) =>
    route.fulfill({ json: { views: 1234, useful: 7, reacted: false } }),
  );
  await page.route(`**/api/posts/${SLUG}/useful`, (route) => {
    posts.push('useful');
    return route.fulfill({ json: { useful: 8, reacted: true } });
  });
  await page.route(`**/api/posts/${SLUG}/view`, (route) => {
    posts.push('view');
    return route.fulfill({ status: 204 });
  });
  await page.goto(URL_);

  await expect(page.locator('[data-reads]')).toHaveText('1,234 reads');
  const useful = page.locator('[data-useful]');
  await expect(useful).toBeVisible();
  await expect(useful).toHaveAttribute('aria-pressed', 'false');
  await expect(useful).toContainText('7');
  await useful.click();
  await expect(useful).toHaveAttribute('aria-pressed', 'true');
  await expect(useful).toContainText('8');
  expect(posts).toContain('useful');

  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => posts.includes('view')).toBe(true);
});

test('read count stays hidden below 10', async ({ page }) => {
  await page.route(`**/api/posts/${SLUG}/stats`, (route) =>
    route.fulfill({ json: { views: 3, useful: 0, reacted: false } }),
  );
  await page.goto(URL_);
  await expect(page.locator('[data-useful]')).toBeVisible();
  await expect(page.locator('[data-reads]')).toBeHidden();
});

test.describe('live field', () => {
  test('reduced motion: poster and a Play button, sliders hidden', async ({
    page,
  }) => {
    await page.goto(URL_);
    const root = page.locator('[data-live-field]');
    await root.scrollIntoViewIfNeeded();
    await expect(root).toHaveAttribute('data-state', 'play');
    await expect(
      root.getByRole('button', { name: 'Play simulation' }),
    ).toBeVisible();
    await expect(page.locator('.live-field__controls')).toBeHidden();
  });

  test('motion allowed: runs, and the sliders drive F and k', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__heroFieldTest = { shortSide: 64 };
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(URL_);
    const root = page.locator('[data-live-field]');
    await root.scrollIntoViewIfNeeded();
    await expect(root).toHaveAttribute('data-state', 'running', {
      timeout: 30_000,
    });
    const f = page.getByLabel('Feed rate F');
    await expect(f).toBeVisible();
    await expect(f).toHaveValue('0.0367');
    await expect(page.getByLabel('Kill rate k')).toHaveValue('0.0649');
    await f.fill('0.05');
    await expect(page.locator('[data-readout="F"]')).toHaveText('0.0500');
  });
});

test.describe('blog index and home in dev (the draft is listed)', () => {
  test('featured post, topic pills, search and the no-results state', async ({
    page,
  }) => {
    await page.route('**/api/**', (route) => route.abort());
    await page.goto('/blog/');
    const featured = page.locator('.blog-featured');
    await expect(featured.getByRole('link')).toHaveAttribute('href', URL_);

    // Only topics that have posts.
    const group = page.getByRole('group', { name: 'Filter by topic' });
    await expect(group.getByRole('button')).toHaveText([
      'All',
      'Numerics',
      'GPU',
    ]);
    await group.getByRole('button', { name: 'GPU' }).click();
    await expect(group.getByRole('button', { name: 'GPU' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(group.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(featured).toBeVisible();

    const search = page.getByRole('searchbox', { name: 'Search posts' });
    await search.fill('callouts');
    await expect(featured).toBeVisible();
    await search.fill('zzz');
    await expect(featured).toBeHidden();
    await expect(
      page.getByText('Nothing matches “zzz” in that topic.'),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Clear search and filters' })
      .click();
    await expect(featured).toBeVisible();
    await expect(search).toHaveValue('');
    await expect(group.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('body-text matches come from /api/search', async ({ page }) => {
    const queries: string[] = [];
    await page.route('**/api/search?**', (route) => {
      queries.push(new URL(route.request().url()).searchParams.get('q')!);
      return route.fulfill({
        json: {
          results: [
            {
              slug: SLUG,
              url: URL_,
              title: '',
              dek: '',
              date: '',
              snippet: '',
            },
          ],
        },
      });
    });
    await page.goto('/blog/');
    const search = page.getByRole('searchbox', { name: 'Search posts' });
    await search.pressSequentially('stencil', { delay: 20 });
    await expect(page.locator('.blog-featured')).toBeVisible();
    // Debounced: one request for the whole word.
    await expect.poll(() => queries).toEqual(['stencil']);
  });

  test('home lists the draft and points the CTA at the writing', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#writing .writing__row')).toHaveAttribute(
      'href',
      URL_,
    );
    await expect(
      page.getByRole('link', { name: 'Read the writing' }),
    ).toHaveAttribute('href', '/blog/');
  });

  for (const theme of THEMES) {
    test(`/blog/ with a post (${theme}): no axe violations, no sideways scroll at phone width`, async ({
      page,
    }) => {
      await storeTheme(page, theme);
      await page.setViewportSize({ width: WIDTHS.phone, height: 800 });
      await page.goto('/blog/');
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }
});

for (const theme of THEMES) {
  test(`hero image (${theme}): the active theme's AVIF is preloaded with high priority`, async ({
    page,
  }) => {
    await storeTheme(page, theme);
    await page.goto(URL_);
    const preload = page.locator(
      'head link[rel="preload"][as="image"][fetchpriority="high"]',
    );
    await expect(preload).toHaveCount(1);
    const srcset = await page
      .locator(`.post__hero picture.only-${theme} source[type="image/avif"]`)
      .getAttribute('srcset');
    await expect(preload).toHaveAttribute('imagesrcset', srcset!);
  });
}

test('after "Play", focus moves to the first slider', async ({ page }) => {
  await page.addInitScript(() => {
    window.__heroFieldTest = { shortSide: 64 };
  });
  await page.goto(URL_);
  const play = page
    .locator('[data-live-field]')
    .getByRole('button', { name: 'Play simulation' });
  await play.scrollIntoViewIfNeeded();
  await play.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Feed rate F')).toBeFocused({ timeout: 30_000 });
});

test('SEO: article tags, the post OG image and the BlogPosting JSON-LD', async ({
  page,
}) => {
  await page.goto(URL_);
  const canonical = `https://sagar-pal.dev${URL_}`;
  const meta = (p: string) => page.locator(`head meta[property="${p}"]`);
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
    'href',
    canonical,
  );
  await expect(meta('og:type')).toHaveAttribute('content', 'article');
  await expect(meta('og:image')).toHaveAttribute(
    'content',
    `https://sagar-pal.dev/og/${SLUG}.png`,
  );
  await expect(meta('article:published_time')).toHaveAttribute(
    'content',
    '2026-10-30',
  );
  await expect(meta('article:tag')).toHaveCount(2);

  const jsonLd = await page
    .locator('head script[type="application/ld+json"]')
    .textContent();
  expect(JSON.parse(jsonLd ?? '')).toMatchObject({
    '@type': 'BlogPosting',
    headline: 'Example draft: every post component',
    datePublished: '2026-10-30',
    url: canonical,
    image: `https://sagar-pal.dev/og/${SLUG}.png`,
    keywords: 'Numerics, GPU',
    author: { '@type': 'Person', name: 'Sagar Pal' },
  });
});
