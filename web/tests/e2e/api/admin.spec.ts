import { expect, test, type Page } from '@playwright/test';
import {
  WIDTHS,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
} from '../helpers';

// The admin in a browser, against FastAPI serving the real build (serve.sh).
// pytest covers the edge cases (CSRF, rate limit, validation, escaping); this
// is the happy path end to end, including the public reading page.

const PASSWORD = 'e2e-password';

const region = (page: Page, name: string) =>
  page.getByRole('region', { name, exact: true });

async function signIn(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByRole('heading', { name: 'Reading list' }),
  ).toBeVisible();
}

test('admin happy path: sign in, add, edit, delete, sign out', async ({
  page,
}) => {
  const title = `End-to-end book ${Date.now()}`;

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expectNoAxeViolations(page);
  await signIn(page);
  await expectNoAxeViolations(page);

  // Add.
  await page.getByRole('link', { name: 'New item' }).click();
  await expect(page.getByRole('heading', { name: 'New item' })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByLabel('Title').fill(title);
  await page.getByLabel(/^Authors/).fill('Ada Lovelace');
  await page.getByLabel(/^Note/).fill('A note written by the browser test.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(region(page, 'Reading now')).toContainText(title);

  // It shows on the public page without a rebuild.
  await page.goto('/what-im-reading/');
  await expect(region(page, 'Reading now')).toContainText(title);
  await expect(region(page, 'Reading now')).toContainText('Ada Lovelace');

  // Edit: mark it finished.
  await page.goto('/admin');
  await page.getByRole('link', { name: `Edit ${title}` }).click();
  await expect(page.getByRole('heading', { name: 'Edit item' })).toBeVisible();
  await page.getByLabel('Status').selectOption('finished');
  await page.getByLabel('Finished', { exact: true }).fill('2026-10-15');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(region(page, 'Finished')).toContainText(title);
  await page.goto('/what-im-reading/');
  await expect(region(page, 'Finished')).toContainText(title);

  // Delete: it moves to Deleted and leaves the public page.
  await page.goto('/admin');
  await page.getByRole('button', { name: `Delete ${title}` }).click();
  await expect(region(page, 'Deleted')).toContainText(title);
  await page.goto('/what-im-reading/');
  await expect(page.locator('main')).not.toContainText(title);

  // Delete permanently, after the confirmation page.
  await page.goto('/admin');
  await region(page, 'Deleted')
    .locator('.item', { hasText: title })
    .getByRole('link', { name: 'Delete permanently' })
    .click();
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(
    page.getByRole('heading', { name: 'Reading list' }),
  ).toBeVisible();
  await expect(page.locator('main')).not.toContainText(title);

  // Sign out: the admin pages need a session again.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.goto('/admin/items/new');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

// One sign-in for all widths: sign-ins count towards the limit of 5 per 15 minutes.
test('admin list and form: no sideways scroll at 390, 768 and 1440', async ({
  page,
}) => {
  await signIn(page);
  for (const width of Object.values(WIDTHS)) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin');
    await expectNoHorizontalScroll(page);
    await page.goto('/admin/items/new');
    await expectNoHorizontalScroll(page);
  }
});
