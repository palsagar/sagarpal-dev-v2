import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** The posts of the site under test. Tests must follow this list and never
 *  assume a number of posts, so that publishing a post does not break them. */
export async function publishedPosts(
  request: APIRequestContext,
): Promise<{ slug: string; url: string; title: string; dek: string }[]> {
  const response = await request.get('/content-manifest.json');
  return (await response.json()).posts;
}

export const WIDTHS = { phone: 390, tablet: 768, desktop: 1440 } as const;
export const THEMES = ['night', 'day'] as const;
export type Theme = (typeof THEMES)[number];

/** Store a theme choice before any page script runs. */
export async function storeTheme(page: Page, theme: Theme) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('theme', t);
    } catch {
      // ignore
    }
  }, theme);
}

/** Run axe and fail on any violation, listing the rule ids and targets. */
export async function expectNoAxeViolations(page: Page, include?: string) {
  let builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
  ]);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  const summary = violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    targets: v.nodes.map((n) => n.target.join(' ')),
  }));
  expect(summary).toEqual([]);
}

/** The page must not scroll sideways. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
