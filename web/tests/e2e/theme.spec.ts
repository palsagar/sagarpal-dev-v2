import { expect, test } from '@playwright/test';

const GROUND = { night: 'rgb(10, 14, 22)', day: 'rgb(243, 244, 246)' };

test.describe('theme', () => {
  test('first visit follows the OS setting', async ({ browser }) => {
    for (const [scheme, theme] of [
      ['light', 'day'],
      ['dark', 'night'],
    ] as const) {
      const context = await browser.newContext({ colorScheme: scheme });
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await context.close();
    }
  });

  test('theme is set before the body is parsed (no flash)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.addInitScript(() => {
      try {
        localStorage.setItem('theme', 'day');
      } catch {
        // ignore
      }
      // Record data-theme at the moment <body> is inserted, i.e. before first paint.
      new MutationObserver((_, observer) => {
        if (document.body) {
          (window as unknown as { __themeAtBody?: string }).__themeAtBody =
            document.documentElement.dataset.theme;
          observer.disconnect();
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto('/');
    const atBody = await page.evaluate(
      () => (window as unknown as { __themeAtBody?: string }).__themeAtBody,
    );
    expect(atBody).toBe('day');
    await context.close();
  });

  test('toggle flips the theme, updates label and theme-color, and persists', async ({
    page,
  }) => {
    // Start from the OS (dark), not storeTheme: its init script would re-seed on reload.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    const html = page.locator('html');
    const toggle = page.getByRole('button', { name: 'Switch to day theme' });

    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', 'day');
    await expect(
      page.getByRole('button', { name: 'Switch to night theme' }),
    ).toBeVisible();
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      GROUND.day,
    );
    const colors = await page
      .locator('meta[name="theme-color"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('content')));
    expect(colors).toEqual(['#F3F4F6', '#F3F4F6']);

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'day');
  });

  test('a stored choice wins over OS changes; without one, OS changes are followed', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'night');

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html).toHaveAttribute('data-theme', 'day');

    await page.getByRole('button', { name: 'Switch to night theme' }).click();
    await page.emulateMedia({ colorScheme: 'light' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html).toHaveAttribute('data-theme', 'night');
  });

  test('without JS the OS setting applies and the toggle is hidden', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      colorScheme: 'light',
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      GROUND.day,
    );
    await expect(page.locator('[data-theme-toggle]')).toBeHidden();
    await context.close();
  });
});
