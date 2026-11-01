import { expect, test, type Page } from '@playwright/test';
import {
  THEMES,
  WIDTHS,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  storeTheme,
} from './helpers';
import { ITEMS, item, mockReading } from './reading-fixtures';

// /what-im-reading/ (REDESIGN_PLAN.md Phase 6, DESIGN.md §7.4, Reading.dc.html).
// The list comes from GET /api/reading at run time; every test mocks it.

const PATH = '/what-im-reading/';
const LEDE =
  "Books, papers and long reads on physics, computing and learning machines, each with a line on why it's here.";
const ERROR_LINE = 'The reading list did not load. Please try again later.';

const filter = (page: Page) =>
  page.getByRole('group', { name: 'Filter by type' });
const pill = (page: Page, name: RegExp) =>
  filter(page).getByRole('button', { name });
const now = (page: Page) => page.getByRole('region', { name: 'Reading now' });
const finished = (page: Page) => page.getByRole('region', { name: 'Finished' });
const next = (page: Page) => page.getByRole('region', { name: 'Up next' });

test.describe('states', () => {
  test('header, nav state and title', async ({ page }) => {
    await mockReading(page, []);
    await page.goto(PATH);
    await expect(page).toHaveTitle("What I'm reading — Sagar Pal");
    await expect(
      page.getByRole('heading', { level: 1, name: "What I'm reading" }),
    ).toBeVisible();
    await expect(page.getByText(LEDE)).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', {
        name: 'Reading',
      }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('empty: "Nothing on the shelf yet." and no filters or sections', async ({
    page,
  }) => {
    await mockReading(page, []);
    await page.goto(PATH);
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Nothing on the shelf yet.',
      }),
    ).toBeVisible();
    await expect(page.getByText('Check back soon.')).toBeVisible();
    await expect(filter(page)).toBeHidden();
    await expect(now(page)).toBeHidden();
    await expect(finished(page)).toBeHidden();
    await expect(next(page)).toBeHidden();
    await expect(page.locator('[data-reading]')).toHaveAttribute(
      'aria-busy',
      'false',
    );
  });

  for (const [name, fulfil] of [
    ['a 500', { status: 500, body: 'oops' }],
    ['malformed JSON', { status: 200, json: { nope: true } }],
  ] as const) {
    test(`API error (${name}): one quiet line, no sections`, async ({
      page,
    }) => {
      await page.route('**/api/reading**', (r) => r.fulfill(fulfil));
      await page.goto(PATH);
      await expect(page.getByText(ERROR_LINE)).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Nothing on the shelf yet.' }),
      ).toBeHidden();
      await expect(filter(page)).toBeHidden();
      await expect(now(page)).toBeHidden();
      await expect(page.locator('[data-reading-skeleton]')).toBeHidden();
    });
  }

  test('API unreachable: the quiet error line', async ({ page }) => {
    await page.route('**/api/**', (r) => r.abort());
    await page.goto(PATH);
    await expect(page.getByText(ERROR_LINE)).toBeVisible();
  });

  test('loading: a skeleton, then the list, with no layout shift', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[]) {
          if (!e.hadRecentInput) w.__cls += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    for (const width of Object.values(WIDTHS)) {
      await page.unrouteAll();
      await mockReading(page, ITEMS, { delayMs: 800 });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(PATH);
      const skeleton = page.locator('[data-reading-skeleton]');
      await expect(skeleton).toBeVisible();
      await expect(page.locator('[data-reading]')).toHaveAttribute(
        'aria-busy',
        'true',
      );
      await expect(now(page)).toBeVisible();
      await expect(skeleton).toBeHidden();
      await page.evaluate(
        () =>
          new Promise((r) => requestAnimationFrame(() => setTimeout(r, 100))),
      );
      const cls = await page.evaluate(
        () => (window as unknown as { __cls: number }).__cls,
      );
      expect(cls, `CLS at ${width}px`).toBeLessThan(0.001);
    }
  });

  test('without JS: a line saying the list needs JavaScript', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(PATH);
    // Playwright's text search skips <noscript>, so locate it by CSS.
    const line = page.locator('noscript .reading-line');
    await expect(line).toBeVisible();
    await expect(line).toHaveText('The reading list needs JavaScript.');
    await expect(page.locator('[data-reading-skeleton]')).toBeHidden();
    await expect(filter(page)).toBeHidden();
    await context.close();
  });
});

test.describe('with items', () => {
  test.beforeEach(async ({ page }) => {
    await mockReading(page, ITEMS);
  });

  test('filter pills show counts; "All" is pressed', async ({ page }) => {
    await page.goto(PATH);
    await expect(filter(page).getByRole('button')).toHaveText([
      'All 8',
      'Books 4',
      'Papers 3',
      'Articles 1',
    ]);
    await expect(pill(page, /^All/)).toHaveAttribute('aria-pressed', 'true');
    await expect(pill(page, /^Books/)).toHaveAttribute('aria-pressed', 'false');
  });

  test('Reading now: lead book with a typographic cover, others with tiles', async ({
    page,
  }) => {
    await page.goto(PATH);
    const section = now(page);
    const articles = section.getByRole('article');
    await expect(articles).toHaveCount(3);

    const lead = articles.nth(0);
    await expect(lead).toHaveClass(/reading-lead/);
    const cover = lead.locator('[data-cover]');
    await expect(cover).toHaveAttribute('data-cover', 'book');
    await expect(cover).toHaveAttribute('aria-hidden', 'true');
    await expect(cover).toContainText('Ada Author');
    await expect(cover).toContainText('Test Book Being Read');
    await expect(lead.getByText('Book, started October 2026')).toBeVisible();
    await expect(
      lead.getByRole('link', { name: 'Test Book Being Read' }),
    ).toHaveAttribute('href', 'https://example.org/book');
    await expect(lead.getByText('Ada Author, 1997')).toBeVisible();
    await expect(
      lead.getByText('Test note for the book on the desk.'),
    ).toBeVisible();

    const paper = articles.nth(1);
    const tile = paper.locator('[data-cover]');
    await expect(tile).toHaveAttribute('data-cover', 'doc');
    await expect(tile).toHaveText(/arXiv 2206\.07697\s*TESTNET$/);
    await expect(
      paper.getByRole('link', { name: 'TESTNET: a test paper' }),
    ).toHaveAttribute('href', 'https://arxiv.org/abs/2206.07697');

    // No url: the title is plain text, not a link; no note, no empty paragraph.
    const article = articles.nth(2);
    await expect(article.getByRole('link')).toHaveCount(0);
    await expect(article.locator('.reading-title')).toHaveText(
      'Test Article Without a Link',
    );
    await expect(article.locator('.reading-title')).toHaveJSProperty(
      'tagName',
      'SPAN',
    );
    await expect(
      article.getByText('Article, reread August 2026'),
    ).toBeVisible();
    await expect(article.locator('p:visible')).toHaveCount(0);
  });

  test('Finished: grouped by year, rows with month, title, byline, note and type', async ({
    page,
  }) => {
    await page.goto(PATH);
    const section = finished(page);
    await expect(section.getByRole('heading', { level: 3 })).toHaveText([
      '2026',
      '2025',
    ]);
    const rows = section.getByRole('listitem');
    await expect(rows).toHaveCount(3);
    // A row with a url is one link.
    const first = rows.nth(0).getByRole('link');
    await expect(first).toHaveAttribute('href', 'https://doi.org/10.1000/test');
    await expect(first).toContainText('Sep');
    await expect(first).toContainText('Test Paper Finished in 2026');
    await expect(first).toContainText('Eve et al., 2021');
    await expect(first).toContainText('Test note for the finished paper.');
    await expect(first).toContainText('Paper');
    // Without a url, the row is not a link.
    await expect(rows.nth(1).getByRole('link')).toHaveCount(0);
    await expect(rows.nth(1)).toContainText('Aug');
    await expect(rows.nth(1)).toContainText('Test Book Finished in 2026');
    await expect(rows.nth(2)).toContainText('Nov');
  });

  test('Up next: a surface band listing queued items', async ({ page }) => {
    await page.goto(PATH);
    const section = next(page);
    const rows = section.getByRole('listitem');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Book');
    await expect(rows.nth(0)).toContainText('Test Queued Book');
    await expect(rows.nth(0)).toContainText('Hal');
    await expect(rows.nth(0).getByRole('link')).toHaveCount(0);
    await expect(
      rows.nth(1).getByRole('link', { name: 'Test Queued Paper' }),
    ).toHaveAttribute('href', 'https://example.org/queued-paper');
    const bg = await section.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const surface = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--surface)';
      document.body.append(probe);
      const c = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return c;
    });
    expect(bg).toBe(surface);
  });

  test('filters work by keyboard and announce the result', async ({ page }) => {
    await page.goto(PATH);
    await expect(now(page)).toBeVisible();
    await pill(page, /^All/).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(pill(page, /^Papers/)).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(pill(page, /^Papers/)).toHaveAttribute('aria-pressed', 'true');
    await expect(pill(page, /^All/)).toHaveAttribute('aria-pressed', 'false');
    // The first paper being read becomes the lead, with a large tile.
    const lead = now(page).getByRole('article');
    await expect(lead).toHaveCount(1);
    await expect(lead).toHaveClass(/reading-lead/);
    await expect(lead.locator('[data-cover]')).toHaveAttribute(
      'data-cover',
      'doc',
    );
    await expect(finished(page).getByRole('listitem')).toHaveCount(1);
    await expect(finished(page).getByRole('heading', { level: 3 })).toHaveText([
      '2026',
    ]);
    await expect(next(page).getByRole('listitem')).toHaveCount(1);
    await expect(page.locator('[data-reading-status]')).toHaveText(
      'Showing 3 papers.',
    );

    // Articles: nothing finished or queued, so those sections hide.
    await page.keyboard.press('Tab');
    await page.keyboard.press(' ');
    await expect(pill(page, /^Articles/)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(now(page).getByRole('article')).toHaveCount(1);
    await expect(finished(page)).toBeHidden();
    await expect(next(page)).toBeHidden();
    await expect(page.locator('[data-reading-status]')).toHaveText(
      'Showing 1 article.',
    );

    await pill(page, /^All/).press('Enter');
    await expect(now(page).getByRole('article')).toHaveCount(3);
    await expect(finished(page).getByRole('listitem')).toHaveCount(3);
    await expect(page.locator('[data-reading-status]')).toHaveText(
      'Showing all 8 items.',
    );
  });

  test('fetches once, without query parameters; filtering is local', async ({
    page,
  }) => {
    await page.unrouteAll();
    const requests: string[] = [];
    await mockReading(page, ITEMS, { requests });
    await page.goto(PATH);
    await expect(now(page)).toBeVisible();
    await pill(page, /^Books/).click();
    await pill(page, /^All/).click();
    expect(requests).toEqual(['/api/reading']);
  });

  for (const theme of THEMES) {
    for (const [label, width] of Object.entries(WIDTHS)) {
      test(`${label} (${theme}): no sideways scroll, no axe violations`, async ({
        page,
      }) => {
        await storeTheme(page, theme);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(PATH);
        await expect(next(page)).toBeVisible();
        // Under reduced motion base.css gives every property a 0.01ms
        // transition, so the pills turn visible one frame after data-ready.
        await expect(filter(page)).toBeVisible();
        await expectNoHorizontalScroll(page);
        await expectNoAxeViolations(page);
      });
    }
  }
});

test('pills with a count of 0 are not shown', async ({ page }) => {
  await mockReading(
    page,
    ITEMS.filter((i) => i.kind !== 'article'),
  );
  await page.goto(PATH);
  await expect(filter(page).getByRole('button')).toHaveText([
    'All 7',
    'Books 4',
    'Papers 3',
  ]);
});

test('a lone reading item still leads; empty sections stay hidden', async ({
  page,
}) => {
  await mockReading(page, [ITEMS[0]]);
  await page.goto(PATH);
  await expect(now(page).getByRole('article')).toHaveCount(1);
  await expect(finished(page)).toBeHidden();
  await expect(next(page)).toBeHidden();
  await pill(page, /^Books/).click();
  await expect(page.locator('[data-reading-status]')).toHaveText(
    'Showing 1 book.',
  );
  await pill(page, /^All/).click();
  await expect(page.locator('[data-reading-status]')).toHaveText(
    'Showing all 1 item.',
  );
});

test.describe('covers', () => {
  const SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40"><rect width="30" height="40" fill="teal"/></svg>';
  // Open Library's "no cover" answer is a 1×1 image.
  const PIXEL = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
  const withCover = [
    item({
      ...ITEMS[0],
      cover_url: 'https://covers.example.test/b/isbn/1-L.jpg',
    }),
    ...ITEMS.slice(1),
  ];

  test('a cover_url shows the real cover, requested once across filters', async ({
    page,
  }) => {
    let requests = 0;
    await page.route('https://covers.example.test/**', (r) => {
      requests++;
      return r.fulfill({ body: SVG, contentType: 'image/svg+xml' });
    });
    await mockReading(page, withCover);
    await page.goto(PATH);
    const lead = now(page).getByRole('article').first();
    const img = lead.locator('img[data-cover]');
    await expect(img).toHaveAttribute(
      'src',
      'https://covers.example.test/b/isbn/1-L.jpg',
    );
    await expect(img).toHaveAttribute('alt', '');
    await expect(img).toHaveJSProperty('complete', true);
    await expect(img).toHaveAttribute('loading', 'eager');
    await expect(lead.locator('[data-cover="book"]')).toHaveCount(0);
    await pill(page, /^Papers/).click();
    await pill(page, /^Books/).click();
    await pill(page, /^All/).click();
    await expect(
      now(page).getByRole('article').first().locator('img[data-cover]'),
    ).toHaveJSProperty('complete', true);
    expect(requests).toBe(1);
  });

  for (const [name, fulfil] of [
    ['a 404', { status: 404 }],
    ['a 1×1 image', { body: PIXEL, contentType: 'image/png' }],
  ] as const) {
    test(`a cover answering ${name} falls back to the typographic cover`, async ({
      page,
    }) => {
      await page.route('https://covers.example.test/**', (r) =>
        r.fulfill(fulfil),
      );
      await mockReading(page, withCover);
      await page.goto(PATH);
      const lead = now(page).getByRole('article').first();
      await expect(lead.locator('[data-cover="book"]')).toBeVisible();
      await expect(lead.locator('img')).toHaveCount(0);
    });
  }
});

test('item text is rendered as text, never as HTML', async ({ page }) => {
  const evil = '<img src=x onerror="window.__pwned=1">';
  await mockReading(page, [
    item({
      id: 1,
      kind: 'article',
      status: 'reading',
      title: evil,
      authors: evil,
      note: evil,
      url: 'https://example.org/a',
      started_on: '2026-10-01',
    }),
  ]);
  await page.goto(PATH);
  await expect(now(page).getByRole('link', { name: evil })).toBeVisible();
  expect(
    await page.evaluate(() => 'pwned' in window || '__pwned' in window),
  ).toBe(false);
  await expect(now(page).locator('img')).toHaveCount(0);
});
