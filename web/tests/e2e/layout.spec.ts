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
  await expect(name).toHaveCSS('background-image', /\.webp/);
});
