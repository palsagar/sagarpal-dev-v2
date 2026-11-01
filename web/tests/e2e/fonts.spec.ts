import { expect, test } from '@playwright/test';
import { ITEMS, mockReading } from './reading-fixtures';

// Archivo ships trimmed to the axis ranges the design uses (REDESIGN_PLAN.md
// Phase 9; docs/redesign/scripts/trim_archivo.py): width 100-115 %, weight
// 400-800. Text set outside those ranges would render clamped.

const PAGES = [
  '/',
  '/projects/',
  '/publications/',
  '/blog/',
  '/what-im-reading/',
  '/no-such-page/',
];

test('the preloaded Archivo file is the trimmed one (under 60 KB)', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const href = await page
    .locator('link[rel="preload"][as="font"]')
    .getAttribute('href');
  const body = await (await request.get(href!)).body();
  expect(body.length).toBeLessThan(60 * 1024);
});

for (const path of PAGES) {
  test(`${path}: Archivo text stays within width 100-115 % and weight 400-800`, async ({
    page,
  }) => {
    await mockReading(page, ITEMS);
    await page.goto(path);
    const outside = await page.evaluate(() => {
      const bad = new Set<string>();
      for (const el of document.querySelectorAll('body *')) {
        const s = getComputedStyle(el);
        if (!s.fontFamily.startsWith('"Archivo')) continue;
        if (
          ![...el.childNodes].some(
            (n) => n.nodeType === 3 && n.textContent!.trim(),
          )
        )
          continue;
        const w = Number(s.fontWeight);
        const st = parseFloat(s.fontStretch);
        if (w < 400 || w > 800 || st < 100 || st > 115)
          bad.add(
            `${el.tagName.toLowerCase()}.${el.className} weight ${w} stretch ${s.fontStretch}`,
          );
      }
      return [...bad];
    });
    expect(outside).toEqual([]);
  });
}
