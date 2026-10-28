// Genera app/scenarios.json: las definiciones de popup de cada escenario, en ES y EN.
//
// Son la fuente única de los popups del laboratorio: con ?popups=fixture el service worker las
// sirve tal cual (deterministas), y la configuración "SDK Test App" de DEV se creó con las
// mismas (ver README, "Fixtures en DEV"). Cambiar aquí → node apps/test-app/scripts/build-scenarios.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEV } from '../app/config.js';

const COPY = {
  checkout: {
    es: { title: '¿Algo te ha impedido terminar la compra?', message: '<p>Te llevará menos de un minuto.</p>' },
    en: { title: 'Did anything stop you from completing your order?', message: '<p>It takes less than a minute.</p>' },
  },
  exit: {
    es: { title: '¿Por qué has salido del checkout?', message: '<p>Tu opinión nos ayuda a mejorarlo.</p>' },
    en: { title: 'Why did you leave the checkout?', message: '<p>Your feedback helps us improve it.</p>' },
  },
  rate: {
    es: { title: 'Cuéntanos qué te parece este producto', message: '<p>Cuatro preguntas rápidas.</p>' },
    en: { title: 'Tell us what you think of this product', message: '<p>Four quick questions.</p>' },
  },
  help: {
    es: { title: '¿Te ayudamos?', message: '<p>Cuéntanos qué estabas buscando.</p>' },
    en: { title: 'Can we help?', message: '<p>Tell us what you were looking for.</p>' },
  },
  redisplay: {
    es: { title: '¿Qué tal tu cuenta?', message: '<p>Solo te lo preguntaremos una vez al día.</p>' },
    en: { title: 'How is your account?', message: '<p>We will only ask once a day.</p>' },
  },
  notOnCart: {
    es: { title: '¿Te gusta lo que ves?', message: '<p>Ayúdanos a mejorar NORDLY.</p>' },
    en: { title: 'Like what you see?', message: '<p>Help us improve NORDLY.</p>' },
  },
};

const LONG_COOLDOWN = [{ answered: 'COMPLETED', cooldownDays: 30 }];

const BASE = {
  checkout: { survey: 'simple', triggers: [{ type: 'time_on_page', value: 3 }], segments: { path: ['/checkout'] }, position: 'bottom-right', cooldown: LONG_COOLDOWN },
  exit: { survey: 'simple', triggers: [{ type: 'exit', value: 2 }], segments: { path: ['/checkout'] }, position: 'center', cooldown: LONG_COOLDOWN },
  rate: { survey: 'complex', triggers: [{ type: 'event', value: 'rate_product' }], segments: {}, position: 'center', cooldown: [] },
  help: { survey: 'simple', triggers: [{ type: 'click', value: 'help-button' }], segments: {}, position: 'bottom-right', cooldown: [] },
  redisplay: {
    survey: 'simple',
    triggers: [{ type: 'time_on_page', value: 2 }],
    segments: { path: ['/account'] },
    position: 'center',
    cooldown: [{ answered: 'SHOWED', cooldownDays: 1 }, { answered: 'COMPLETED', cooldownDays: 30 }],
  },
  notOnCart: { survey: 'simple', triggers: [{ type: 'time_on_page', value: 2 }], segments: { excludedPaths: ['/cart', '/checkout'] }, position: 'bottom-right', cooldown: [] },
};

const SCENARIO_OF = { checkout: 'checkout-time', exit: 'exit-checkout', rate: 'rate-product', help: 'help-click', redisplay: 'redisplay', notOnCart: 'not-on-cart' };

const popups = {};
for (const [key, base] of Object.entries(BASE)) {
  for (const lang of ['es', 'en']) {
    const id = `lab-${SCENARIO_OF[key]}-${lang}`;
    const surveyId = DEV.surveys[base.survey];
    popups[id] = {
      id,
      title: COPY[key][lang].title,
      message: COPY[key][lang].message,
      triggers: base.triggers,
      cooldown: base.cooldown,
      actions: {},
      surveyId,
      productId: DEV.productKey,
      style: { theme: 'light', position: base.position },
      segments: { lang: [lang], ...base.segments },
    };
  }
}

const scenarios = {};
for (const [key, name] of Object.entries(SCENARIO_OF)) {
  scenarios[name] = { popups: [`lab-${name}-es`, `lab-${name}-en`] };
}
// `all` = todo menos not-on-cart (salta en cualquier página y taparía a los demás).
scenarios.all = { popups: Object.keys(popups).filter((id) => !id.startsWith('lab-not-on-cart')) };

const out = fileURLToPath(new URL('../app/scenarios.json', import.meta.url));
writeFileSync(out, JSON.stringify({ $comment: 'Generado por scripts/build-scenarios.mjs. No editar a mano.', scenarios, popups }, null, 2) + '\n');
console.log(`scenarios.json: ${Object.keys(scenarios).length} escenarios, ${Object.keys(popups).length} popups`);
