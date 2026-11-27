import { test, expect } from '@playwright/test';

/**
 * DD-574: Playwright drives Chromium with `navigator.webdriver = true`, the same signal a
 * headless crawler gives. Without `allowAutomatedBrowsers` the SDK must not call the API at all
 * (no popups GET, no contact, no analytics), so a bot never becomes a CRM contact nor uses a
 * popup's daily viewer quota. Against the LOCAL build (examples/e2e-tracking.html → ../dist).
 */
const FIXTURE = '/examples/e2e-tracking.html';
// A customer's production-like domain. localhost is a dev host since the API's rule (isDevOrTestPage)
// applies in the SDK too, so the "blocked" case needs a host that is not one: Chromium resolves this
// name to the local server.
const CUSTOMER_HOST = 'www.e2e-customer-shop.com';
const PORT = Number(process.env.E2E_PORT ?? 5173);
test.use({ launchOptions: { args: [`--host-resolver-rules=MAP ${CUSTOMER_HOST} 127.0.0.1`] } });

test.describe('Automated browser on a customer site (DD-574)', () => {
  test('webdriver: no request reaches the API', async ({ page }) => {
    const apiCalls: string[] = [];
    await page.route('**/api-dev.deepdots.com/**', (route) => {
      apiCalls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.goto(`http://${CUSTOMER_HOST}:${PORT}${FIXTURE}?bot=1&apiKey=pk-e2e&userId=user-e2e&analytics=int-e2e`);
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
});

test.describe('Automated browser on a dev/test host (DD-574)', () => {
  test('webdriver on localhost: the popups request goes out, like the API allows', async ({ page }) => {
    const apiCalls: string[] = [];
    await page.route('**/api-dev.deepdots.com/**', (route) => {
      apiCalls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.goto(`${FIXTURE}?bot=1&apiKey=pk-e2e&userId=user-e2e`);
    await page.waitForFunction(() => (window as any).__sdkReady === true);
    expect(await page.evaluate(() => navigator.webdriver)).toBe(true);
    await expect.poll(() => apiCalls.some((c) => c === 'GET /sdk/pk-e2e/popups')).toBe(true);
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
