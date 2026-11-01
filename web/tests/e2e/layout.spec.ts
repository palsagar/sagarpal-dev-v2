import { expect, test } from '@playwright/test';
import {
  THEMES,
  WIDTHS,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  storeTheme,
} from './helpers';

for (const theme of THEMES) {
  for (const [label, width] of Object.entries(WIDTHS)) {
    test(`home: no axe violations, no sideways scroll (${theme}, ${label})`, async ({
      page,
    }) => {
      await storeTheme(page, theme);
      // Static state: blocks waiting for their entrance sit at opacity 0, which
      // axe would read as low contrast. home.spec.ts tests the entrances.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }
}

test('skip link is the first tab stop and targets main', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});

test.describe('nav', () => {
  test('desktop shows links and CV, no Menu button', async ({ page }) => {
    await page.setViewportSize({ width: WIDTHS.desktop, height: 900 });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    for (const name of ['Writing', 'Reading', 'Projects', 'Papers', 'CV']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
    await expect(
      page.getByRole('link', { name: 'Sagar Pal' }).first(),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('phone Menu sheet: opens, traps focus, closes on Esc and returns focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: WIDTHS.phone, height: 800 });
    await page.goto('/');
    const menu = page.getByRole('button', { name: 'Menu' });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    await menu.click();
    const sheet = page.getByRole('dialog', { name: 'Menu' });
    await expect(sheet).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['Writing', 'Reading', 'Projects', 'Papers', 'CV']) {
      await expect(
        sheet.getByRole('link', { name, exact: true }),
      ).toBeVisible();
    }
    await expectNoAxeViolations(page);

    // Tab many times: focus never leaves the sheet.
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(
        () =>
          document
            .querySelector('#menu-sheet')
            ?.contains(document.activeElement) ?? false,
      );
      expect(inside).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeFocused();
  });

  test('phone touch targets are at least 44px', async ({ page }) => {
    await page.setViewportSize({ width: WIDTHS.phone, height: 800 });
    await page.goto('/');
    for (const locator of [
      page.getByRole('button', { name: 'Menu' }),
      page.locator('[data-theme-toggle]'),
    ]) {
      const box = await locator.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
  });
});

test('footer: links, field-filled name hidden from assistive tech', async ({
  page,
}) => {
  await page.goto('/');
  const footer = page.locator('footer');
  const elsewhere = footer.getByRole('navigation', { name: 'Elsewhere' });
  for (const name of ['GitHub', 'LinkedIn', 'Google Scholar', 'Email', 'RSS']) {
    await expect(elsewhere.getByRole('link', { name })).toBeVisible();
  }
  const name = footer.locator('.site-footer__name');
  await expect(name).toHaveAttribute('aria-hidden', 'true');
  await expect(name).toHaveCSS('background-image', /\.avif/);
});

// The fill loads with the page wherever the footer is, so it must stay small.
test('footer name fill: AVIF under 64 KB, WebP fallback under 128 KB', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const style = await page.locator('footer.site-footer').getAttribute('style');
  const urls = [...(style ?? '').matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
  const avif = urls.find((u) => u.endsWith('.avif'));
  const webp = urls.find((u) => u.endsWith('.webp'));
  expect(avif && webp).toBeTruthy();
  const size = async (u: string) =>
    (await (await request.get(u)).body()).length;
  expect(await size(avif!)).toBeLessThan(64 * 1024);
  expect(await size(webp!)).toBeLessThan(128 * 1024);
});

test('Back and Forward report the page to Umami', async ({ page }) => {
  // A stand-in for Umami's tracker: like the real one, it notes each URL change made
  // through history.pushState or history.replaceState, and counts a page view for it.
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { umami: {}, __historyUrls: seen });
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method].bind(history);
      history[method] = (state, unused, url) => {
        if (url) seen.push(new URL(String(url), location.href).pathname);
        original(state, unused, url);
      };
    }
  });
  const urls = () =>
    page.evaluate(
      () => (window as unknown as { __historyUrls: string[] }).__historyUrls,
    );
  await page.setViewportSize({ width: WIDTHS.desktop, height: 900 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await nav.getByRole('link', { name: 'Projects', exact: true }).click();
  await expect.poll(urls).toEqual(['/projects/']);
  await page.goBack();
  await expect.poll(urls).toEqual(['/projects/', '/']);
  await page.goForward();
  await expect.poll(urls).toEqual(['/projects/', '/', '/projects/']);
});
