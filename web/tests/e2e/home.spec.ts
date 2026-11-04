import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import {
  THEMES,
  WIDTHS,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  publishedPosts,
  storeTheme,
} from './helpers';
import { ITEMS, mockReading } from './reading-fixtures';

// Home page, static parts (REDESIGN_PLAN.md Phase 2, DESIGN.md §7.1 and §10).
// The hero's primary link and the Writing section depend on the published posts.

const CV = '/assets/pdfs/Sagar_Pal_CV_2025.pdf';

/** The first h2s: Writing comes after the path section, and only with posts. */
async function firstHeadings(request: APIRequestContext) {
  const posts = await publishedPosts(request);
  return ['From droplets to materials', ...(posts.length ? ['Writing'] : [])];
}

test.describe('hero', () => {
  test('the primary CTA follows the posts; "Download CV" is always there', async ({
    page,
    request,
  }) => {
    const hasPosts = (await publishedPosts(request)).length > 0;
    await page.goto('/');
    const hero = page.locator('section[aria-labelledby="hero-title"]');
    await expect(
      hero.getByRole('heading', { level: 1, name: 'Sagar Pal' }),
    ).toBeVisible();
    await expect(
      hero.getByText(
        'I work at the intersection of scientific computing, AI for science and high-performance ML systems.',
      ),
    ).toBeVisible();
    await expect(
      hero.getByRole('link', {
        name: hasPosts ? 'Read the writing' : 'View projects',
      }),
    ).toHaveAttribute('href', hasPosts ? '/blog/' : '#work');
    await expect(
      hero.getByRole('link', { name: 'Download CV' }),
    ).toHaveAttribute('href', CV);
    await expect(
      hero.getByRole('link', {
        name: hasPosts ? 'View projects' : 'Read the writing',
      }),
    ).toHaveCount(0);
  });

  for (const theme of THEMES) {
    const other = theme === 'night' ? 'day' : 'night';
    test(`poster: only the ${theme} image shows and loads, preloaded with high priority`, async ({
      page,
    }) => {
      await storeTheme(page, theme);
      const requested: string[] = [];
      page.on('request', (r) => requested.push(r.url()));
      await page.goto('/');

      const visible = page.locator(`.hero__poster.only-${theme} img`);
      await expect(visible).toBeVisible();
      await expect(visible).toHaveAttribute('width', /\d+/);
      await expect(visible).toHaveAttribute('height', /\d+/);
      await expect(visible).toHaveJSProperty('complete', true);
      await expect(
        page.locator(`.hero__poster.only-${other} img`),
      ).toBeHidden();

      const preload = page.locator('head link[rel="preload"][as="image"]');
      await expect(preload).toHaveCount(1);
      await expect(preload).toHaveAttribute('fetchpriority', 'high');
      await expect(preload).toHaveAttribute(
        'imagesrcset',
        new RegExp(`field-hero-${theme}`),
      );

      await page.waitForLoadState('networkidle');
      expect(requested.some((u) => u.includes(`field-hero-${theme}`))).toBe(
        true,
      );
      expect(requested.some((u) => u.includes(`field-hero-${other}`))).toBe(
        false,
      );
    });
  }

  test('field caption is shorter on phones', async ({ page }) => {
    await page.setViewportSize({ width: WIDTHS.phone, height: 800 });
    await page.goto('/');
    await expect(
      page.getByText(
        'Gray–Scott reaction–diffusion, live. Touch the field to seed growth.',
      ),
    ).toBeVisible();
    await page.setViewportSize({ width: WIDTHS.desktop, height: 900 });
    await expect(
      page.getByText(
        'Gray–Scott reaction–diffusion, solved live on your GPU. Drag across the field to seed new growth.',
      ),
    ).toBeVisible();
  });
});

test('sections appear in order; Reading is hidden when empty', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.locator('main h2:visible')).toHaveText([
    ...(await firstHeadings(request)),
    'Simulations and tools',
    'Papers',
  ]);
  // `astro preview` has no API, so the Reading band stays hidden.
  await expect(page.locator('#reading')).toBeHidden();
  await expect(page.locator('#work')).toHaveCount(1);
  await expect(page.locator('#papers')).toHaveCount(1);
});

const CAREER = [
  ['2025 – now', 'Senior ML & HPC Engineer, Entalpic'],
  ['2021 – 2025', 'Research Engineer, Saint-Gobain Research'],
  ['2020 – 2021', 'Post-doctoral Researcher, Sorbonne Université'],
  ['2017 – 2020', 'PhD in Mechanics, Sorbonne Université'],
  ['2016 – 2017', 'MSc in Fluid Mechanics, UPMC & École Polytechnique'],
  ['2015 – 2016', 'Research Fellow, Indian Institute of Science'],
  [
    '2011 – 2015',
    'B.Tech in Mechanical Engineering, Indian Institute of Technology',
  ],
];

test.describe('path', () => {
  test('desktop: three paragraphs and seven career rows, newest first', async ({
    page,
  }) => {
    await page.setViewportSize({ width: WIDTHS.desktop, height: 900 });
    await page.goto('/');
    const path = page.locator('#path');
    await expect(path.locator('.path__para:visible')).toHaveCount(3);
    const rows = path.locator('.career li');
    await expect(rows).toHaveCount(7);
    for (const [i, [years, role]] of CAREER.entries()) {
      await expect(rows.nth(i).locator('.career__years')).toHaveText(years);
      await expect(rows.nth(i).locator('.career__role')).toHaveText(role);
    }
    await expect(path.getByRole('link', { name: 'Full CV' })).toBeHidden();
    await expect(path.getByRole('img')).toHaveAttribute(
      'alt',
      'Sagar Pal, outdoors in a park in winter, wearing a dark coat and glasses',
    );
  });

  test('phone: condensed paragraph, first four rows, "Full CV"', async ({
    page,
  }) => {
    await page.setViewportSize({ width: WIDTHS.phone, height: 800 });
    await page.goto('/');
    const path = page.locator('#path');
    await expect(path.locator('.path__para:visible')).toHaveCount(1);
    await expect(path.locator('.career li:visible')).toHaveCount(4);
    await expect(path.getByRole('link', { name: 'Full CV' })).toHaveAttribute(
      'href',
      CV,
    );
    // The heading comes before the portrait on phones.
    const h2 = await path.locator('h2').boundingBox();
    const img = await path.getByRole('img').boundingBox();
    expect(h2!.y).toBeLessThan(img!.y);
  });
});

test('projects: four in design order with their links', async ({ page }) => {
  await page.goto('/');
  const work = page.locator('#work');
  const cards = work.locator('article');
  await expect(cards.locator('h3')).toHaveText([
    'FlowLab',
    'Gray-Scott',
    'PortWhisperer',
    'Rent vs Buy',
  ]);
  const expected = [
    [
      'Live demo',
      'https://flow.gpuphysics.dev/',
      'https://github.com/palsagar/webgpu-fluid-solver',
    ],
    [
      'Live demo',
      'https://patterns.gpuphysics.dev',
      'https://github.com/palsagar/webgpu-gray-scott',
    ],
    [
      'PyPI',
      'https://pypi.org/project/portwhisperer/',
      'https://github.com/palsagar/port-whisperer',
    ],
    [
      'Live demo',
      'https://rent-or-buy-sim.com/',
      'https://github.com/palsagar/rent-vs-buy-simulator',
    ],
  ];
  for (const [i, [primary, href, source]] of expected.entries()) {
    const card = cards.nth(i);
    await expect(
      card.getByRole('link', { name: primary, exact: true }),
    ).toHaveAttribute('href', href);
    await expect(
      card.getByRole('link', { name: 'Source', exact: true }),
    ).toHaveAttribute('href', source);
  }
  await expect(cards.nth(1).locator('.project__tech')).toHaveText(
    'WebGPU, WGSL, reaction–diffusion',
  );
  // PortWhisperer shows a terminal fragment instead of an image.
  await expect(cards.nth(2).locator('pre[data-ui]')).toContainText('$ ports');
  await expect(cards.nth(2).locator('img')).toHaveCount(0);
  for (const i of [0, 1, 3]) {
    await expect(cards.nth(i).locator('source[type="image/avif"]')).toHaveCount(
      1,
    );
  }
});

for (const width of [1160, 1440, 1920]) {
  test(`projects at ${width}px: two rows, weighted 7/5 then 5/7`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const boxes = await page.$$eval('#work article', (els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { y: Math.round(r.top), w: r.width };
      }),
    );
    const [flow, gs, pw, rvb] = boxes;
    expect(flow!.y).toBe(gs!.y);
    expect(pw!.y).toBe(rvb!.y);
    expect(pw!.y).toBeGreaterThan(flow!.y);
    expect(flow!.w).toBeGreaterThan(gs!.w);
    expect(rvb!.w).toBeGreaterThan(pw!.w);
  });
}

test('papers: newest first (featured first within a year), Sagar bold, PDF/DOI/arXiv pills', async ({
  page,
}) => {
  await page.goto('/');
  const items = page.locator('#papers ol > li');
  await expect(items.locator('.paper__year')).toHaveText([
    '2024',
    '2021',
    '2021',
    '2021',
  ]);
  await expect(items.locator('.paper__title')).toHaveText([
    'Statistics of drops generated from ensembles of randomly corrugated ligaments',
    'A novel momentum-conserving, mass-momentum consistent method for interfacial flows involving large density contrasts',
    'A mass-momentum consistent, Volume-of-Fluid method for incompressible flow on staggered grids',
    'PArallel, Robust, Interface Simulator (PARIS)',
  ]);
  const pills = [['PDF', 'DOI'], ['PDF', 'arXiv'], ['PDF', 'DOI'], ['DOI']];
  for (const [i, labels] of pills.entries()) {
    await expect(items.nth(i).locator('.paper__links a')).toHaveText(labels);
    await expect(items.nth(i).locator('.paper__authors strong')).toHaveText(
      'S. Pal',
    );
  }
  await expect(items.nth(0).getByRole('link', { name: 'PDF' })).toHaveAttribute(
    'href',
    '/assets/pdfs/ligaments-physfluid.pdf',
  );
  await expect(
    page.locator('#papers').getByRole('link', { name: 'Google Scholar' }),
  ).toBeVisible();
});

/** Lines a block occupies, from its height and computed line-height. */
async function lineCounts(page: Page, selector: string) {
  return page.$$eval(selector, (els) =>
    els.map((el) => {
      const style = getComputedStyle(el);
      const lh = parseFloat(style.lineHeight);
      const pad =
        parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      return {
        text: el.textContent?.trim(),
        lines: Math.round((el.getBoundingClientRect().height - pad) / lh),
        overflow: el.scrollWidth - el.clientWidth,
      };
    }),
  );
}

for (const [label, width] of Object.entries(WIDTHS)) {
  test(`layout at ${label}: headings ≤ 2 lines, nothing overflows, equal outer margins`, async ({
    page,
  }) => {
    await mockReading(page, ITEMS);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('#reading')).toBeVisible();
    for (const h of await lineCounts(page, 'main h1, main h2, main h3')) {
      expect(h.lines, `"${h.text}" lines`).toBeLessThanOrEqual(2);
      expect(h.overflow, `"${h.text}" overflow`).toBeLessThanOrEqual(0);
    }
    // Every container sits centred: left margin equals right margin.
    const margins = await page.$$eval(
      'main .container, footer.container',
      (els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return Math.abs(
            r.left - (document.documentElement.clientWidth - r.right),
          );
        }),
    );
    for (const m of margins) expect(m).toBeLessThanOrEqual(1);
    // Text starts at the same x in the hero, the sections and the footer.
    const lefts = await page.$$eval(
      '#hero-title, .path__portrait, #reading-title, #work-title, #papers-title, footer nav',
      (els) => els.map((el) => Math.round(el.getBoundingClientRect().left)),
    );
    expect(new Set(lefts).size, `lefts ${lefts.join(',')}`).toBe(1);
  });
}

test.describe('section entrances', () => {
  test('below-the-fold blocks start hidden and reveal on scroll', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: WIDTHS.desktop, height: 900 });
    await page.goto('/');
    const head = page.locator('#papers .section-head');
    await expect(head).toHaveClass(/reveal-pre/);
    // The hero is never animated: it holds the LCP image.
    await expect(page.locator('.hero .reveal-pre')).toHaveCount(0);
    await head.scrollIntoViewIfNeeded();
    await expect(head).not.toHaveClass(/reveal-pre/);
    await expect(head).toHaveCSS('opacity', '1');
  });

  test('reduced motion: nothing is pre-hidden', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('[data-reveal]').first()).toBeAttached();
    await expect(page.locator('.reveal-pre')).toHaveCount(0);
  });
});

test('without JS every section is visible', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('.reveal-pre')).toHaveCount(0);
  await expect(page.locator('#papers .section-head')).toHaveCSS('opacity', '1');
  await expect(page.locator('.hero__poster img:visible')).toHaveCount(1);
  await context.close();
});

test.describe('reading band', () => {
  const band = (page: Page) => page.locator('#reading');

  test('hidden when nothing is being read', async ({ page }) => {
    await mockReading(
      page,
      ITEMS.filter((i) => i.status !== 'reading'),
    );
    await page.goto('/');
    // data-state is set once the script has handled the response.
    await expect(band(page)).toHaveAttribute('data-state', 'empty');
    await expect(band(page)).toBeHidden();
    await expect(band(page).getByRole('listitem')).toHaveCount(0);
  });

  test('shows up to three "reading now" items, linking to the reading page', async ({
    page,
    request,
  }) => {
    const requests: string[] = [];
    const extra = { ...ITEMS[0], id: 99, title: 'Test Fourth Item' };
    await mockReading(page, [...ITEMS, extra], { requests });
    await page.setViewportSize({ width: WIDTHS.desktop, height: 900 });
    await page.goto('/');
    await expect(band(page)).toBeVisible();
    expect(requests).toEqual(['/api/reading?status=reading']);

    await expect(page.locator('main h2:visible')).toHaveText([
      ...(await firstHeadings(request)),
      'Reading',
      'Simulations and tools',
      'Papers',
    ]);
    await expect(
      band(page).getByText(
        "Books, papers and long reads on my desk right now, each with a line on why it's there.",
      ),
    ).toBeVisible();
    await expect(
      band(page).getByRole('link', { name: "Everything I'm reading" }),
    ).toHaveAttribute('href', '/what-im-reading/');

    const rows = band(page).getByRole('listitem');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Book');
    await expect(
      rows.nth(0).getByRole('link', { name: 'Test Book Being Read' }),
    ).toHaveAttribute('href', '/what-im-reading/');
    await expect(rows.nth(0)).toContainText('Ada Author, 1997');
    await expect(
      rows.nth(0).getByText('Test note for the book on the desk.'),
    ).toBeVisible();
    await expect(rows.nth(1)).toContainText('Paper');
    await expect(rows.nth(2)).toContainText('Article');
    await expect(band(page)).not.toContainText('Test Fourth Item');
  });

  test('phone: no notes or sentence, button after the list', async ({
    page,
  }) => {
    await mockReading(page, ITEMS);
    await page.setViewportSize({ width: WIDTHS.phone, height: 900 });
    await page.goto('/');
    await expect(band(page)).toBeVisible();
    await expect(
      band(page).getByText('Test note for the book on the desk.'),
    ).toBeHidden();
    await expect(band(page).getByText(/on my desk right now/)).toBeHidden();
    const list = await band(page).locator('ul').boundingBox();
    const button = await band(page)
      .getByRole('link', { name: "Everything I'm reading" })
      .boundingBox();
    expect(button!.y).toBeGreaterThan(list!.y + list!.height);
  });

  for (const theme of THEMES) {
    for (const [label, width] of Object.entries(WIDTHS)) {
      test(`${label} (${theme}): no sideways scroll, no axe violations`, async ({
        page,
      }) => {
        await mockReading(page, ITEMS);
        await storeTheme(page, theme);
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/');
        await expect(band(page)).toBeVisible();
        await expectNoHorizontalScroll(page);
        await expectNoAxeViolations(page, '#reading');
      });
    }
  }
});
