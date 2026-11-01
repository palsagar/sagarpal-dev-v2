import { expect, test } from '@playwright/test';
import {
  THEMES,
  WIDTHS,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  storeTheme,
} from '../helpers';

for (const theme of THEMES) {
  test(`styleguide: no axe violations in either panel (page theme ${theme})`, async ({
    page,
  }) => {
    await storeTheme(page, theme);
    await page.goto('/styleguide/');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Night' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Day' }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
}

test('styleguide: no sideways scroll at phone width', async ({ page }) => {
  await page.setViewportSize({ width: WIDTHS.phone, height: 800 });
  await page.goto('/styleguide/');
  await expectNoHorizontalScroll(page);
});

test('client-router navigation keeps the theme and moves focus to main', async ({
  page,
}) => {
  await storeTheme(page, 'night');
  await page.goto('/styleguide/');
  await page.getByRole('button', { name: 'Switch to day theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');

  await page.getByRole('link', { name: 'Sagar Pal' }).first().click();
  await page.waitForURL('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sagar Pal' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await expect(page.locator('main')).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Switch to night theme' }),
  ).toBeVisible();
});
