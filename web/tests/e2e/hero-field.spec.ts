import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { WIDTHS, expectNoAxeViolations, storeTheme } from './helpers';

// Live hero field (REDESIGN_PLAN.md Phase 3, DESIGN.md §5).
// The field root carries data-state: idle → warming → running ⇄ paused,
// or "play" (reduced motion, waiting for the button) or "unsupported".

const field = (page: Page) => page.locator('[data-hero-field]');
const READY = { timeout: 30_000 };

/** Headless Chromium renders WebGL in software (SwiftShader), which the field
 *  refuses in production. Tests opt in, with a small grid to stay fast. */
async function allowSoftwareGl(page: Page) {
  await page.addInitScript(() => {
    window.__heroFieldTest = { shortSide: 96 };
  });
}

test.describe('motion allowed', () => {
  test.beforeEach(async ({ page }) => {
    await allowSoftwareGl(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('canvas fades in over the poster and the controls appear', async ({
    page,
  }) => {
    await page.goto('/');
    // Before the island is ready the poster shows and the controls are hidden.
    await expect(page.locator('.hero__poster:visible img')).toBeVisible();
    await expect(field(page)).toHaveAttribute('data-state', 'running', READY);
    const canvas = page.locator('.hero__canvas');
    await expect(canvas).toHaveAttribute('aria-hidden', 'true');
    await expect(canvas).toHaveCSS('opacity', '1');
    await expect(page.locator('.hero__controls')).toBeVisible();
    // The poster stays in the page under the canvas (fallback, LCP).
    await expect(page.locator('.hero__poster:visible img')).toHaveCount(1);
  });

  test('presets: one pressed at a time, readout follows', async ({ page }) => {
    await page.goto('/');
    await expect(field(page)).toHaveAttribute('data-state', 'running', READY);
    const group = page.getByRole('group', { name: 'Pattern preset' });
    const buttons = group.getByRole('button');
    await expect(buttons).toHaveText([
      'Coral',
      'Mitosis',
      'Mazes',
      'Spots & loops',
    ]);
    const readout = page.locator('.hero__readout');
    await expect(group.getByRole('button', { name: 'Coral' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(readout).toHaveText(/^F = 0\.0545\s*k = 0\.0620$/);

    await group.getByRole('button', { name: 'Mazes' }).click();
    await expect(group.getByRole('button', { name: 'Mazes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(group.getByRole('button', { name: 'Coral' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(readout).toHaveText(/^F = 0\.0290\s*k = 0\.0570$/);
    await expect(field(page)).toHaveAttribute('data-state', 'running');
  });

  test('pauses off-screen and resumes when scrolled back', async ({ page }) => {
    await page.setViewportSize({ width: WIDTHS.desktop, height: 900 });
    await page.goto('/');
    await expect(field(page)).toHaveAttribute('data-state', 'running', READY);
    await page.locator('#papers').scrollIntoViewIfNeeded();
    await expect(field(page)).toHaveAttribute('data-state', 'paused');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(field(page)).toHaveAttribute('data-state', 'running');
  });

  test('pauses while the tab is hidden', async ({ page }) => {
    await page.goto('/');
    await expect(field(page)).toHaveAttribute('data-state', 'running', READY);
    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', {
          value: h,
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await setHidden(true);
    await expect(field(page)).toHaveAttribute('data-state', 'paused');
    await setHidden(false);
    await expect(field(page)).toHaveAttribute('data-state', 'running');
  });

  test('dragging across the field changes the pattern', async ({ page }) => {
    await page.setViewportSize({ width: WIDTHS.desktop, height: 900 });
    await page.goto('/');
    await expect(field(page)).toHaveAttribute('data-state', 'running', READY);
    const box = (await page.locator('.hero__canvas').boundingBox())!;
    // Pause so the only change between the two snapshots is the brush.
    await page.evaluate(() =>
      document.dispatchEvent(new Event('hero-field:test-freeze')),
    );
    const before = await page.locator('.hero__canvas').screenshot();
    await page.mouse.move(box.x + 40, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 40, box.y + 60, { steps: 12 });
    await page.mouse.up();
    await page.evaluate(() =>
      document.dispatchEvent(new Event('hero-field:test-step')),
    );
    const after = await page.locator('.hero__canvas').screenshot();
    expect(after.equals(before)).toBe(false);
  });

  test('no axe violations with the controls showing', async ({ page }) => {
    for (const width of [WIDTHS.phone, WIDTHS.desktop]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(field(page)).toHaveAttribute('data-state', 'running', READY);
      await expectNoAxeViolations(page, '.hero');
    }
  });

  test('phone: preset buttons are at least 44px tall', async ({ page }) => {
    await page.setViewportSize({ width: WIDTHS.phone, height: 800 });
    await page.goto('/');
    await expect(field(page)).toHaveAttribute('data-state', 'running', READY);
    for (const button of await page
      .getByRole('group', { name: 'Pattern preset' })
      .getByRole('button')
      .all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('theme change keeps the simulation running', async ({ page }) => {
    await storeTheme(page, 'night');
    await page.setViewportSize({ width: WIDTHS.desktop, height: 900 });
    await page.goto('/');
    await expect(field(page)).toHaveAttribute('data-state', 'running', READY);
    await page.getByRole('button', { name: 'Switch to day theme' }).click();
    await expect(field(page)).toHaveAttribute('data-theme-lut', 'day');
    await expect(field(page)).toHaveAttribute('data-state', 'running');
  });
});

test.describe('reduced motion', () => {
  test('poster plus "Play simulation"; nothing runs until pressed', async ({
    page,
  }) => {
    await allowSoftwareGl(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const play = page.getByRole('button', { name: 'Play simulation' });
    await expect(play).toBeVisible();
    await expect(field(page)).toHaveAttribute('data-state', 'play');
    await expect(page.locator('.hero__controls')).toBeHidden();
    await expect(page.locator('.hero__canvas')).toHaveCSS('opacity', '0');

    await play.click();
    await expect(field(page)).toHaveAttribute('data-state', 'running', READY);
    await expect(play).toBeHidden();
    await expect(page.locator('.hero__controls')).toBeVisible();
  });
});

test('no WebGL2: poster only, no controls, no Play button', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error -- narrowing the overloads is not useful in a test stub
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type === 'webgl2') return null;
      return original.call(this, type, ...rest);
    };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(field(page)).toHaveAttribute('data-state', 'unsupported', READY);
  await expect(page.locator('.hero__poster:visible img')).toBeVisible();
  await expect(page.locator('.hero__controls')).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Play simulation' }),
  ).toBeHidden();
});

test('software-rendered WebGL: poster only, no controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(field(page)).toHaveAttribute('data-state', 'unsupported', READY);
  await expect(page.locator('.hero__poster:visible img')).toBeVisible();
  await expect(page.locator('.hero__controls')).toBeHidden();
});

test('without JS: poster only, controls hidden', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('.hero__poster:visible img')).toBeVisible();
  await expect(page.locator('.hero__controls')).toBeHidden();
  await expect(page.locator('.hero__play')).toBeHidden();
  await context.close();
});

test('island JS stays within 25 KB gzipped', async ({ page }) => {
  const scripts = new Map<string, number>();
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.endsWith('.js') || url.includes('ClientRouter')) return;
    scripts.set(url, gzipSync(await response.body(), { level: 9 }).length);
  });
  await allowSoftwareGl(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(field(page)).toHaveAttribute('data-state', 'running', READY);
  const total = [...scripts.values()].reduce((a, b) => a + b, 0);
  console.log('island scripts (gzip bytes):', Object.fromEntries(scripts));
  expect(total).toBeGreaterThan(0);
  expect(total).toBeLessThanOrEqual(25 * 1024);
});
