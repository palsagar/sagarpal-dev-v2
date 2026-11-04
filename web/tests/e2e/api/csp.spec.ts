import { expect, test } from '@playwright/test';

// The Content-Security-Policy is enforced (it was report-only until the
// cut-over). FastAPI serves the real build here, with the real headers, so any
// script, style, image or font the policy does not allow shows up as a
// securitypolicyviolation event.

const PAGES = [
  '/',
  '/projects/',
  '/publications/',
  '/blog/',
  '/what-im-reading/',
  '/no-such-page/',
  '/admin',
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`),
    );
  });
});

const violations = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

test('the policy is enforced, not report-only', async ({ request }) => {
  const headers = (await request.get('/')).headers();
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy-report-only']).toBeUndefined();
});

for (const path of PAGES) {
  test(`${path}: no CSP violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await violations(page)).toEqual([]);
  });
}

test('client-router page changes and the theme toggle: no CSP violations', async ({
  page,
}) => {
  await page.goto('/');
  for (const link of ['/projects/', '/publications/', '/blog/', '/']) {
    await page.locator(`header a[href="${link}"]`).first().click();
    await page.waitForURL(`**${link}`);
  }
  await page.getByRole('button', { name: /theme/i }).first().click();
  await page.waitForLoadState('networkidle');
  expect(await violations(page)).toEqual([]);
});
