import { test, expect, SDK } from '../lab';

/**
 * Synthetic monitor (DD-26): the four scenarios that the scheduled workflow (monitor.yml) runs
 * every hour against the PUBLISHED SDK (npm `latest` through jsDelivr) and the LIVE popup config
 * of the test app in DEV, as a customer site gets them. No fixtures: a change in the API, the
 * CDN or the survey frontend shows up here too.
 *
 * Test titles start with the scenario id (`init · …`): scripts/release/sdk-monitor.mjs reads it.
 * MONITOR_FAULT (failure test only): a service-worker fault (apps/test-app/sw.js) injected in the
 * submit scenario, e.g. `survey406` = the survey does not load.
 */
const FAULT = process.env.MONITOR_FAULT ?? '';
const LIVE = { popups: 'live' } as const;

test.describe(`SDK ${SDK} · monitor`, () => {
  // What the SDK and the network did, for the failure report.
  test.afterEach(async ({ lab }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    const events = await lab.events().catch(() => []);
    const network = await lab.network().catch(() => []);
    const lines = [
      ...events.map((e) => `${e.kind} ${e.name}${e.data ? ` ${JSON.stringify(e.data)}` : ''}`),
      ...network.map((n) => `net ${n.method} ${n.host}${n.path} ${n.status}${n.note ? ` (${n.note})` : ''}`),
    ];
    await testInfo.attach('sdk-events', { body: lines.join('\n'), contentType: 'text/plain' });
  });

  test('init · the published SDK loads from the CDN and gets its popups from DEV', async ({ lab, page }) => {
    await lab.open('/', LIVE);
    const version = await lab.sdkVersion();
    expect(version, 'SDK version reported by the loaded bundle').toMatch(/^\d+\.\d+\.\d+/);
    await expect(page.getByTestId('lab-env')).toHaveText(/DEV · api-dev\.deepdots\.com/);
    const popups = async () => (await lab.network()).find((n) => /^\/sdk\/[^/]+\/popups$/.test(n.path));
    await expect.poll(async () => (await popups())?.status, { message: 'GET popups answered 200' }).toBe(200);
    expect((await popups())?.host).toBe('api-dev.deepdots.com');
  });

  test('trigger-render · a host event opens the popup and the survey renders', async ({ lab, page }) => {
    await lab.open('/products/42', LIVE);
    await page.getByTestId('rate-product').click();
    await expect(lab.popup, 'popup shown after the event').toBeVisible({ timeout: 15_000 });
    await expect(lab.popup).toContainText('Cuéntanos qué te parece este producto');
    await expect(lab.popup.locator('.magicfeedback-container'), 'survey rendered in the popup').toBeVisible({ timeout: 15_000 });
  });

  test('submit · the survey can be answered and the answer reaches DEV', async ({ lab, page }) => {
    await lab.open('/account', { ...LIVE, ...(FAULT ? { fault: FAULT } : {}) });
    await page.getByTestId('help-button').click();
    await expect(lab.popup, 'popup shown after the click').toBeVisible({ timeout: 15_000 });
    await lab.popup.locator('label[for="rating-nps-9"]').click({ timeout: 15_000 });
    const textarea = lab.popup.locator('textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill(`DD-26 monitor · ${SDK}`);
    await lab.popup.getByRole('button', { name: /^(Enviar|Send)$/ }).click();
    await expect
      .poll(async () => (await lab.events()).some((e) => e.name === 'survey_completed'), { timeout: 15_000, message: 'survey_completed' })
      .toBe(true);
    const answers = (await lab.network()).filter((n) => n.method === 'POST' && n.path === '/sdk/feedback' && !n.note);
    expect(answers.length, 'answers sent to DEV').toBeGreaterThan(0);
    expect(answers.every((n) => n.status === 200 && n.host === 'api-dev.deepdots.com')).toBe(true);
  });

  test('popups-error · the popup API fails: no popup and the host keeps working', async ({ lab }) => {
    await lab.open('/products/42', { ...LIVE, fault: 'popups500' });
    await lab.expectNoPopupFor(3_000);
    await lab.expectHostUsable();
  });
});
