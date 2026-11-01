import { expect, test, type Page } from '@playwright/test';
import { ITEMS, mockReading } from './reading-fixtures';

// Reduced motion (REDESIGN_PLAN.md Phase 9, DESIGN.md §8): nothing moves unless
// the visitor starts it. A recorder samples document.getAnimations() on every
// frame (CSS animations, transitions, Web Animations and view transitions) while
// each page is scrolled to the end and while the client router changes pages.

const PAGES = [
  '/',
  '/projects/',
  '/publications/',
  '/blog/',
  '/what-im-reading/',
  '/no-such-page/',
];

/** Record every animation longer than 1 ms that runs in the page. */
async function recordAnimations(page: Page) {
  await page.addInitScript(() => {
    const seen = new Set<string>();
    (window as unknown as { __motion: string[] }).__motion = [];
    const sample = () => {
      for (const a of document.getAnimations()) {
        const timing = a.effect?.getComputedTiming();
        const duration = Number(timing?.duration ?? 0);
        if (duration <= 1 && timing?.iterations !== Infinity) continue;
        const target = (a.effect as KeyframeEffect | null)?.target;
        const name =
          (a as CSSAnimation).animationName ??
          (a as CSSTransition).transitionProperty ??
          a.id;
        const label = `${target?.nodeName ?? '?'}.${(target as Element | null)?.className ?? ''} ${name} ${duration}ms`;
        if (!seen.has(label)) {
          seen.add(label);
          (window as unknown as { __motion: string[] }).__motion.push(label);
        }
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

const recorded = (page: Page) =>
  page.evaluate(() => (window as unknown as { __motion: string[] }).__motion);

async function scrollToEnd(page: Page) {
  await page.evaluate(async () => {
    const step = innerHeight / 2;
    for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
  });
  await page.waitForTimeout(300);
}

test.describe('reduced motion', () => {
  for (const path of PAGES) {
    test(`${path}: no animation while loading and scrolling`, async ({
      page,
    }) => {
      await mockReading(page, ITEMS);
      await recordAnimations(page);
      await page.goto(path);
      await scrollToEnd(page);
      expect(await recorded(page)).toEqual([]);
      if (path === '/') {
        await expect(page.locator('[data-hero-field]')).toHaveAttribute(
          'data-state',
          'play',
        );
      }
    });
  }

  test('client-router page changes and the theme toggle do not animate', async ({
    page,
  }) => {
    await mockReading(page, ITEMS);
    await recordAnimations(page);
    await page.goto('/');
    for (const link of ['/projects/', '/publications/', '/what-im-reading/']) {
      await page.locator(`header a[href="${link}"]`).first().click();
      await page.waitForURL(`**${link}`);
      await page.waitForTimeout(300);
    }
    await page.getByRole('button', { name: /theme/i }).first().click();
    await page.waitForTimeout(300);
    // The recorder survives client-router swaps (same document).
    expect(await recorded(page)).toEqual([]);
  });
});

test('motion allowed: the recorder sees the entrance animations', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await recordAnimations(page);
  await page.goto('/');
  await scrollToEnd(page);
  expect((await recorded(page)).length).toBeGreaterThan(0);
});
