import { expect, test } from '@playwright/test';
import { THEMES, WIDTHS, storeTheme } from './helpers';
import { ITEMS, mockReading } from './reading-fixtures';

// Keyboard-only pass (REDESIGN_PLAN.md Phase 9): every Tab stop shows a visible
// focus indicator, and no element jumps the order with a positive tabindex.
// The skip link and the Menu sheet's focus trap are tested in layout.spec.ts.

const PAGES = [
  '/',
  '/projects/',
  '/publications/',
  '/blog/',
  '/what-im-reading/',
  '/no-such-page/',
];

for (const path of PAGES) {
  for (const theme of THEMES) {
    for (const [label, width] of [
      ['phone', WIDTHS.phone],
      ['desktop', WIDTHS.desktop],
    ] as const) {
      test(`${path} ${theme} ${label}: every Tab stop shows focus`, async ({
        page,
      }) => {
        await mockReading(page, ITEMS);
        await storeTheme(page, theme);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);

        expect(
          await page
            .locator('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')
            .count(),
        ).toBe(0);

        const missing: string[] = [];
        const seen = new Set<string>();
        for (let i = 0; i < 80; i++) {
          await page.keyboard.press('Tab');
          const stop = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) return null;
            const s = getComputedStyle(el);
            const outline =
              s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
            const ring = s.boxShadow !== 'none';
            const id = `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}" ${el.getAttribute('href') ?? ''}`;
            return { id, shown: outline || ring };
          });
          if (!stop) break; // focus left the page: the end of the tab order
          if (seen.has(stop.id)) break; // wrapped around
          seen.add(stop.id);
          if (!stop.shown) missing.push(stop.id);
        }
        expect(seen.size).toBeGreaterThan(3);
        expect(missing).toEqual([]);
      });
    }
  }
}
