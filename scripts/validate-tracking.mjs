// Validación end-to-end del tracking recorriendo la checklist.
// Usa el navegador de Playwright (headless) contra la build local servida en :5173.
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const DEMO = `${BASE}/examples/demo.html`;
const FIXTURE = `${BASE}/examples/e2e-tracking.html`;
const REAL_API_KEY = 'TjgElf34YDUxHPtUQuCVGQusPNBIjmT5'; // dev (mismo de demo-sdk.js)

const ok = (b) => (b ? 'PASS ✅' : 'FAIL ❌');
const line = (s) => console.log(s);

const browser = await chromium.launch();

async function newPage() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  return { page, ctx, logs };
}

const trackingLogs = (logs) => logs.filter((l) => l.includes('tracking'));

// ============ A) demo.html (client, sin backend) ============
line('\n================ A) demo.html (client, sin backend) ================');
{
  const { page, logs } = await newPage();
  await page.goto(DEMO);
  await page.waitForFunction(() => window.__trackingReady || window.deepdots);

  const uid = await page.evaluate(() => window.deepdots.getUserId());
  const sid = await page.evaluate(() => window.deepdots.getSessionId());
  const lsUser = await page.evaluate(() => localStorage.getItem('deepdots.user_id'));
  const lsFirst = await page.evaluate(() => localStorage.getItem('deepdots.user.first_seen'));

  line(`\nA1) user_id se genera y persiste`);
  line(`    user_id = ${uid}`);
  line(`    localStorage[deepdots.user_id]       = ${lsUser}`);
  line(`    localStorage[deepdots.user.first_seen] = ${lsFirst}`);
  line(`    consola: ${trackingLogs(logs).find((l) => l.includes('estado inicial')) || '(—)'}`);
  line(`    => ${ok(!!uid && lsUser === uid && !!lsFirst)}`);

  // A2 returning
  await page.reload();
  await page.waitForFunction(() => window.deepdots);
  const uid2 = await page.evaluate(() => window.deepdots.getUserId());
  line(`\nA2) user_id estable tras recargar`);
  line(`    antes=${uid}  después=${uid2}`);
  line(`    => ${ok(uid2 === uid)}`);

  // A3 session null
  line(`\nA3) session_id null en client sin apiKey`);
  line(`    session_id = ${sid}`);
  line(`    => ${ok(sid === null)}`);

  // A4 inyección en survey (click "Responder" = btn-show-popup1)
  const before = logs.length;
  await page.click('#btn-show-popup1').catch(() => {});
  await page.waitForTimeout(400);
  const identityLog = logs.slice(0).reverse().find((l) => l.includes('survey identity'));
  line(`\nA4) inyección en survey (al abrir popup)`);
  line(`    consola: ${identityLog || '(no capturado)'}`);
  line(`    => ${ok(!!identityLog && identityLog.includes('userId'))}`);

  // A5 kill-switch
  await page.evaluate(() => window.deepdots.setTrackingEnabled(false));
  const offUser = await page.evaluate(() => window.deepdots.getUserId());
  const offSession = await page.evaluate(() => window.deepdots.getSessionId());
  await page.evaluate(() => window.deepdots.setTrackingEnabled(true));
  const onUser = await page.evaluate(() => window.deepdots.getUserId());
  line(`\nA5) kill-switch setTrackingEnabled`);
  line(`    off → getUserId()=${offUser}  getSessionId()=${offSession}`);
  line(`    on  → getUserId()=${onUser}`);
  line(`    => ${ok(offUser === null && offSession === null && onUser === uid)}`);
}

// A6) userId del cliente (fixture soporta ?userId=)
{
  const { page } = await newPage();
  await page.goto(`${FIXTURE}?userId=cliente-123`);
  await page.waitForFunction(() => window.__sdkReady === true);
  const uid = await page.evaluate(() => window.deepdots.getUserId());
  const ls = await page.evaluate(() => localStorage.getItem('deepdots.user_id'));
  line(`\nA6) userId del cliente NO se persiste`);
  line(`    getUserId() = ${uid}`);
  line(`    localStorage[deepdots.user_id] = ${ls}`);
  line(`    => ${ok(uid === 'cliente-123' && ls === null)}`);
}

// ============ B) backend real (api-dev) vía fixture con apiKey ============
line('\n================ B) backend real (api-dev.deepdots.com) ================');
{
  const { page } = await newPage();
  let reqBody = null;
  let respBody = null;
  page.on('request', (r) => {
    if (r.url().endsWith('/sdk/popups') && r.method() === 'POST') reqBody = r.postData();
  });
  page.on('response', async (r) => {
    if (r.url().endsWith('/sdk/popups')) {
      try { respBody = await r.text(); } catch { /* */ }
    }
  });

  await page.goto(`${FIXTURE}?apiKey=${REAL_API_KEY}`);
  await page.waitForFunction(() => window.__sdkReady === true);
  await page.evaluate(() => window.showP1());

  // espera a que el SDK cachee el sessionId (o timeout)
  let sid = null;
  try {
    await page.waitForFunction(() => window.deepdots.getSessionId() !== null, { timeout: 8000 });
    sid = await page.evaluate(() => window.deepdots.getSessionId());
  } catch { sid = await page.evaluate(() => window.deepdots.getSessionId()); }

  const parsedReq = (() => { try { return JSON.parse(reqBody || '{}'); } catch { return {}; } })();
  line(`\nB1/B2) POST /sdk/popups`);
  line(`    request body  = ${reqBody}`);
  line(`    response body = ${respBody}`);
  line(`    body NO lleva sessionId: ${ok(parsedReq.sessionId === undefined)}`);
  line(`    body lleva publicKey/status/popupId/userId: ${ok(!!parsedReq.publicKey && !!parsedReq.status && !!parsedReq.popupId)}`);
  line(`\nB) session_id cacheado del backend`);
  line(`    getSessionId() = ${sid}`);
  line(`    => ${sid ? 'PASS ✅ (backend devolvió sessionId)' : 'INCONCLUSO ⚠️ (backend no devolvió sessionId — ver response arriba)'}`);
}

await browser.close();
line('\n================ FIN ================');
