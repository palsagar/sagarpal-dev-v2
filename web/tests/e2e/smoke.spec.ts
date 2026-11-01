import { expect, test } from '@playwright/test';

test('home page renders', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sagar Pal' }),
  ).toBeVisible();
});

test('migrated CV keeps its public URL', async ({ request }) => {
  const response = await request.get('/assets/pdfs/Sagar_Pal_CV_2025.pdf');
  expect(response.status()).toBe(200);
});

test('favicon and touch icon are linked and served', async ({ page }) => {
  await page.goto('/');
  for (const rel of ['icon', 'apple-touch-icon']) {
    const href = await page
      .locator(`head link[rel="${rel}"]`)
      .getAttribute('href');
    const response = await page.request.get(href!);
    expect(response.status(), href!).toBe(200);
  }
});

test('sitemap index is generated', async ({ request }) => {
  const response = await request.get('/sitemap-index.xml');
  expect(response.status()).toBe(200);
});
