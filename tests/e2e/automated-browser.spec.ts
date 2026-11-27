import { test, expect } from '@playwright/test';

/**
 * DD-574: Playwright drives Chromium with `navigator.webdriver = true`, the same signal a
 * headless crawler gives. Without `allowAutomatedBrowsers` the SDK must not call the API at all
 * (no popups GET, no contact, no analytics), so a bot never becomes a CRM contact nor uses a
 * popup's daily viewer quota. Against the LOCAL build (examples/e2e-tracking.html → ../dist).
 */
const FIXTURE = '/examples/e2e-tracking.html';

test.describe('Automated browser (DD-574)', () => {
  test('webdriver: no request reaches the API', async ({ page }) => {
    const apiCalls: string[] = [];
    await page.route('**/api-dev.deepdots.com/**', (route) => {
      apiCalls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.goto(`${FIXTURE}?bot=1&apiKey=pk-e2e&userId=user-e2e&analytics=int-e2e`);
    await page.waitForFunction(() => (window as any).__sdkReady === true);
    expect(await page.evaluate(() => navigator.webdriver)).toBe(true);
    await page.evaluate(async () => {
      const sdk = (window as any).deepdots;
      sdk.autoLaunch();
      await sdk.setContactAttributes({ plan: 'x' });
      sdk.track('custom_event');
      await sdk.flushAnalytics();
    });
    await page.waitForTimeout(2000);
    expect(apiCalls).toEqual([]);
  });

  test('allowAutomatedBrowsers: the popups request goes out as today', async ({ page }) => {
    const apiCalls: string[] = [];
    await page.route('**/api-dev.deepdots.com/**', (route) => {
      apiCalls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.goto(`${FIXTURE}?apiKey=pk-e2e&userId=user-e2e`);
    await page.waitForFunction(() => (window as any).__sdkReady === true);
    await expect.poll(() => apiCalls.some((c) => c === 'GET /sdk/pk-e2e/popups')).toBe(true);
  });
});
