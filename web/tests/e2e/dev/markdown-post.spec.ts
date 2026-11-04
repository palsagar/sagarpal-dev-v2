import { expect, test } from '@playwright/test';
import {
  THEMES,
  WIDTHS,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  storeTheme,
} from '../helpers';

// A plain .md post (docs/WRITING.md) under `astro dev`. It gets the same page
// and styles as an .mdx post, without the components of components/post/.

const URL_ = '/blog/example-markdown/';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());
});

test('title, equations, code, image and contents all render', async ({
  page,
}) => {
  await page.goto(URL_);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Example draft: plain Markdown',
    }),
  ).toBeVisible();
  await expect(
    page.getByText('A hero image set in the front matter.'),
  ).toContainText('Figure 1.');
  await expect(page.locator('.prose .katex')).toHaveCount(3);
  await expect(page.locator('.prose .katex-display')).toHaveCount(1);
  await expect(page.locator('.code-figure figcaption')).toHaveText('step.py');
  await expect(page.locator('.prose pre.astro-code')).toHaveCount(1);
  await expect(page.locator('.prose')).toContainText(
    'a < b and braces such as {x}',
  );
});

test('images follow the figure style and rules line up with the text', async ({
  page,
}) => {
  await page.setViewportSize({ width: WIDTHS.desktop, height: 900 });
  await page.goto(URL_);
  const img = page.locator('.prose p > img');
  await expect(img).toHaveCSS('border-radius', '16px');
  const left = async (selector: string) =>
    (await page.locator(selector).first().boundingBox())!.x;
  expect(await left('.prose hr')).toBe(await left('.prose > p'));
});

test('table: left aligned headers, but an aligned column keeps its alignment', async ({
  page,
}) => {
  await page.goto(URL_);
  const headers = page.locator('.prose th');
  await expect(headers.nth(0)).toHaveCSS('text-align', 'left');
  // Chromium reports the `align` attribute as -webkit-right.
  await expect(headers.nth(2)).toHaveCSS('text-align', /right$/);
});

test('phone: a wide table scrolls inside itself and takes keyboard focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: WIDTHS.phone, height: 800 });
  await page.goto(URL_);
  const table = page.locator('.prose table');
  await expect(table).toHaveAttribute('tabindex', '0');
  const box = await table.evaluate((el) => ({
    scrolls: el.scrollWidth > el.clientWidth,
    right: el.getBoundingClientRect().right,
  }));
  expect(box.scrolls).toBe(true);
  expect(box.right).toBeLessThanOrEqual(WIDTHS.phone);
});

for (const theme of THEMES) {
  for (const [label, width] of Object.entries(WIDTHS)) {
    test(`layout at ${label} (${theme}): no sideways scroll, no axe violations`, async ({
      page,
    }) => {
      await storeTheme(page, theme);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(URL_);
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }
}
