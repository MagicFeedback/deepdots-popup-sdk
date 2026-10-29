// Graba las encuestas de DEV que usa la test app en app/fixtures/surveys/ (respuesta de
// GET /sdk/app/{surveyId}/{productKey}/info?lang=…, la que pide @magicfeedback/native).
//
// Con ?survey=fixture el service worker las sirve en vez de ir a DEV: la regresión (MF-3245)
// no depende de la red ni del estado de DEV. Volver a grabar si cambian las encuestas:
//   node apps/test-app/scripts/record-surveys.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEV } from '../app/config.js';

const BASE = 'https://api-dev.deepdots.com';
for (const [name, surveyId] of Object.entries(DEV.surveys)) {
  for (const lang of ['es', 'en']) {
    const url = `${BASE}/sdk/app/${surveyId}/${DEV.productKey}/info?lang=${lang}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const body = await res.json();
    const out = fileURLToPath(new URL(`../app/fixtures/surveys/${surveyId}.${lang}.json`, import.meta.url));
    writeFileSync(out, JSON.stringify(body, null, 2) + '\n');
    console.log(`${name} (${lang}) → ${out}`);
  }
}
