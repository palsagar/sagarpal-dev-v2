import { expect, test } from '@playwright/test';
import {
  THEMES,
  WIDTHS,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  storeTheme,
} from './helpers';
import { ITEMS, mockReading } from './reading-fixtures';

// Secondary pages (REDESIGN_PLAN.md Phase 7, DESIGN.md §7.5): /projects/ and
// /publications/ (the home sections at full length) and the 404 page.

const primaryNav = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Primary' });

test.describe('projects', () => {
  test('header, nav state and every project with its description', async ({
    page,
  }) => {
    await page.goto('/projects/');
    await expect(page).toHaveTitle('Simulations and tools — Sagar Pal');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Simulations and tools' }),
    ).toBeVisible();
    await expect(
      page.getByText('Side projects, mostly physics running in a browser tab.'),
    ).toBeVisible();
    await expect(
      primaryNav(page).getByRole('link', { name: 'Projects', exact: true }),
    ).toHaveAttribute('aria-current', 'page');

    const cards = page.locator('main article');
    await expect(cards).toHaveCount(4);
    await expect(cards.getByRole('heading', { level: 2 })).toHaveText([
      'FlowLab',
      'Gray-Scott',
      'PortWhisperer',
      'Rent vs Buy',
    ]);
    // The longer description, not the home summary.
    await expect(cards.first()).toContainText(
      'GPU-accelerated Navier-Stokes solver running entirely in the browser',
    );
    await expect(cards.first()).not.toContainText(
      'obstacles you can drag through the flow',
    );
    await expect(
      cards.nth(2).getByRole('link', { name: 'PyPI' }),
    ).toHaveAttribute('href', 'https://pypi.org/project/portwhisperer/');
  });
});

test.describe('publications', () => {
  test('header, nav state and every paper with its description', async ({
    page,
  }) => {
    await page.goto('/publications/');
    await expect(page).toHaveTitle('Papers — Sagar Pal');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Papers' }),
    ).toBeVisible();
    await expect(
      primaryNav(page).getByRole('link', { name: 'Papers', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      page.locator('main').getByRole('link', { name: 'Google Scholar' }),
    ).toHaveAttribute('href', /scholar\.google\.com/);

    const papers = page.locator('main ol > li');
    await expect(papers).toHaveCount(4);
    await expect(papers.locator('.paper__year')).toHaveText([
      '2024',
      '2021',
      '2021',
      '2021',
    ]);
    await expect(papers.first()).toContainText(
      'Performed large-ensemble numerical simulations',
    );
    await expect(
      papers.first().getByRole('link', { name: 'PDF' }),
    ).toHaveAttribute('href', '/assets/pdfs/ligaments-physfluid.pdf');
  });

  test('the home page has no paper descriptions', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#papers .paper__description')).toHaveCount(0);
  });
});

test.describe('404', () => {
  test('unknown paths get the 404 page', async ({ page }) => {
    const response = await page.goto('/no-such-page/');
    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle('Not found — Sagar Pal');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Not found' }),
    ).toBeVisible();
    await expect(
      page.getByText('That page drifted out of the field.'),
    ).toBeVisible();
    await expect(
      page.locator('main').getByRole('link', { name: 'Back home' }),
    ).toHaveAttribute('href', '/');
    // Only the active theme's image shows; it is decorative.
    await expect(page.locator('main img:visible')).toHaveCount(1);
    await expect(page.locator('main img:visible')).toHaveAttribute('alt', '');
  });
});

for (const path of ['/projects/', '/publications/', '/no-such-page/']) {
  for (const theme of THEMES) {
    for (const [name, width] of Object.entries(WIDTHS)) {
      test(`${path} ${theme} ${name}: no axe violations, no sideways scroll`, async ({
        page,
      }) => {
        await storeTheme(page, theme);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expectNoHorizontalScroll(page);
        await expectNoAxeViolations(page);
      });
    }
  }
}

// axe's heading-order rule is a best practice, outside the WCAG tags above.
for (const path of [
  '/',
  '/projects/',
  '/publications/',
  '/blog/',
  '/what-im-reading/',
  '/no-such-page/',
]) {
  test(`${path}: one h1 and no skipped heading levels`, async ({ page }) => {
    await mockReading(page, ITEMS);
    await page.goto(path);
    const levels = await page
      .locator('h1, h2, h3, h4, h5, h6')
      .evaluateAll((hs) => hs.map((h) => Number(h.tagName[1])));
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    const skips = levels.filter((l, i) => i > 0 && l > levels[i - 1] + 1);
    expect(skips).toEqual([]);
  });
}
