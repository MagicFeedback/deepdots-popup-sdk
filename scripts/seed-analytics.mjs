#!/usr/bin/env node
/**
 * seed-analytics.mjs — Genera N sesiones de analytics FALSAS pero realistas y las envía
 * a `POST /sdk/feedback` (entorno DEV) para tener datos de prueba con los que trabajar el
 * dashboard de Stability/Behaviour/Engagement/Messaging.
 *
 * Replica EXACTAMENTE el formato de wire del SDK (AnalyticsFeedbackBody + eventos como
 * string JSON dentro de metadata[].value[0]). Cada sesión es la actividad coherente de un
 * usuario: navegación (page_view), engagement, búsquedas, eventos custom, funnels,
 * mini-servicios y, en una parte de las sesiones, crashes/errores.
 *
 * Variedad incluida: usuarios nuevos y recurrentes (varias sesiones por persona), web /
 * android / ios (desktop/mobile/tablet), múltiples países/idiomas, versiones de app con
 * peso (las viejas crashean más), arquetipos de sesión (bounce, browser, buyer, power-user,
 * onboarding, soporte), funnels de checkout/onboarding/subscription con drop-offs, un pool
 * amplio de eventos custom, mini-servicios y atributos de segmentación (A/B test, LTV…).
 *
 * Uso:
 *   node scripts/seed-analytics.mjs [count] [--dry-run] [--force] [--concurrency=N]
 */

// ───────────────────────── Config ─────────────────────────
const BASE_URL = 'https://api-dev.deepdots.com';
const PUBLIC_KEY = '40c20557d5cca7526e9fbe4fb8c32017';            // analytics.publicKey
const INTEGRATION = 'c615e360-73c9-11f1-8f0d-479cd2f12da1';        // analytics.integration
const ENDPOINT = `${BASE_URL}/sdk/feedback`;

const args = process.argv.slice(2);
const COUNT = Number(args.find((a) => /^\d+$/.test(a)) ?? 100);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const CONCURRENCY = Number((args.find((a) => a.startsWith('--concurrency=')) ?? '').split('=')[1] || 5);
const FOCUS = (args.find((a) => a.startsWith('--focus=')) ?? '').split('=')[1] || null; // 'mini-service' | 'crash' | 'messaging'

const NOW = Date.now();
const DAY = 86_400_000;

// ───────────────────────── RNG helpers ─────────────────────────
const rnd = () => Math.random();
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const sample = (arr, n) => arr.map((v) => [rnd(), v]).sort((a, b) => a[0] - b[0]).slice(0, n).map(([, v]) => v);
const randint = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const chance = (p) => rnd() < p;
const money = (min, max) => Number((randint(min, max) + rnd()).toFixed(2));
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (rnd() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

/** Un timestamp realista en los últimos 30 días, sesgado a tardes/noches. */
function realisticStart() {
  const daysAgo = randint(0, 30);
  const hourWeights = [1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 7, 8, 7, 6, 6, 7, 8, 9, 10, 9, 7, 4, 2];
  const total = hourWeights.reduce((a, b) => a + b, 0);
  let r = rnd() * total, hour = 0;
  for (let h = 0; h < 24; h++) { if ((r -= hourWeights[h]) <= 0) { hour = h; break; } }
  const base = NOW - daysAgo * DAY;
  const d = new Date(base);
  d.setHours(hour, randint(0, 59), randint(0, 59), 0);
  return d.getTime();
}

// ───────────────────────── Pools de datos ─────────────────────────
// Versiones con peso (la última domina) y multiplicador de crash (las viejas crashean más).
const APP_VERSIONS = [
  { v: '2.9.5', w: 3, crash: 2.4 },
  { v: '3.0.0', w: 5, crash: 1.7 },
  { v: '3.1.0', w: 9, crash: 1.3 },
  { v: '3.2.0', w: 16, crash: 1.0 },
  { v: '3.2.1', w: 40, crash: 0.7 },
  { v: '3.3.0-beta', w: 7, crash: 1.6 },
];
function weightedVersion() {
  const total = APP_VERSIONS.reduce((s, x) => s + x.w, 0);
  let r = rnd() * total;
  for (const x of APP_VERSIONS) if ((r -= x.w) <= 0) return x;
  return APP_VERSIONS.at(-1);
}

const GEO = [
  { country: 'ES', city: 'Madrid', lang: 'es-ES' }, { country: 'ES', city: 'Barcelona', lang: 'es-ES' },
  { country: 'ES', city: 'Valencia', lang: 'es-ES' }, { country: 'MX', city: 'Ciudad de México', lang: 'es-MX' },
  { country: 'AR', city: 'Buenos Aires', lang: 'es-AR' }, { country: 'CO', city: 'Bogotá', lang: 'es-CO' },
  { country: 'US', city: 'New York', lang: 'en-US' }, { country: 'US', city: 'San Francisco', lang: 'en-US' },
  { country: 'GB', city: 'London', lang: 'en-GB' }, { country: 'DE', city: 'Berlin', lang: 'de-DE' },
  { country: 'FR', city: 'Paris', lang: 'fr-FR' }, { country: 'IT', city: 'Rome', lang: 'it-IT' },
  { country: 'PT', city: 'Lisbon', lang: 'pt-PT' }, { country: 'BR', city: 'São Paulo', lang: 'pt-BR' },
  { country: 'NL', city: 'Amsterdam', lang: 'nl-NL' }, { country: 'JP', city: 'Tokyo', lang: 'ja-JP' },
];

const WEB_UA = {
  desktop: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  ],
  mobile: [
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile Safari/604.1',
    'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  ],
  tablet: [
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  ],
};
const ANDROID_DEVICES = [
  { os: '11', model: 'Samsung SM-A515F', type: 'mobile' }, { os: '12', model: 'Samsung SM-G991B', type: 'mobile' },
  { os: '13', model: 'Xiaomi 13', type: 'mobile' }, { os: '14', model: 'Pixel 8', type: 'mobile' },
  { os: '15', model: 'Pixel 9 Pro', type: 'mobile' }, { os: '13', model: 'Samsung SM-X710', type: 'tablet' },
];
const IOS_DEVICES = [
  { os: '15.7', model: 'iPhone12,1', type: 'mobile' }, { os: '16.5', model: 'iPhone14,3', type: 'mobile' },
  { os: '17.4', model: 'iPhone15,2', type: 'mobile' }, { os: '17.5', model: 'iPhone15,3', type: 'mobile' },
  { os: '18.0', model: 'iPhone16,1', type: 'mobile' }, { os: '17.4', model: 'iPad13,1', type: 'tablet' },
];

const WEB_SCREENS = {
  home: '/', search: '/search', category: '/category/:id', product: '/product/:id', reviews: '/product/:id/reviews',
  cart: '/cart', checkout: '/checkout', account: '/account', order: '/orders/:id', wishlist: '/wishlist',
  support: '/support', deals: '/deals', settings: '/settings', profile: '/profile', notifications: '/notifications',
};
const NATIVE_SCREENS = {
  home: 'Home', search: 'Search', category: 'Category', product: 'Product', reviews: 'ProductReviews',
  cart: 'Cart', checkout: 'Checkout', account: 'Account', order: 'OrderDetail', wishlist: 'Wishlist',
  support: 'Support', deals: 'Deals', settings: 'Settings', profile: 'Profile', notifications: 'Notifications',
};

// Arquetipos: peso + recorrido base. Da coherencia + variedad de formas de sesión.
const ARCHETYPES = [
  { name: 'bounce', w: 12, journey: ['home'] },
  { name: 'browser', w: 22, journey: ['home', 'category', 'product', 'reviews', 'product', 'wishlist'] },
  { name: 'searcher', w: 16, journey: ['home', 'search', 'search', 'product', 'deals'] },
  { name: 'buyer', w: 20, journey: ['home', 'search', 'product', 'cart', 'checkout', 'order'] },
  { name: 'abandoner', w: 12, journey: ['home', 'category', 'product', 'cart', 'checkout'] },
  { name: 'power_user', w: 8, journey: ['home', 'deals', 'category', 'product', 'reviews', 'product', 'cart', 'checkout', 'order', 'account'] },
  { name: 'support_seeker', w: 6, journey: ['home', 'search', 'product', 'support', 'support'] },
  { name: 'onboarding', w: 8, journey: ['home', 'profile', 'settings', 'notifications', 'product'] },
  { name: 'account_mgmt', w: 6, journey: ['home', 'account', 'order', 'settings'] },
];
function weightedArchetype() {
  const total = ARCHETYPES.reduce((s, x) => s + x.w, 0);
  let r = rnd() * total;
  for (const x of ARCHETYPES) if ((r -= x.w) <= 0) return x;
  return ARCHETYPES[0];
}

const SEARCH_QUERIES = [
  'zapatillas running', 'camiseta algodón', 'auriculares bluetooth', 'vestido verano', 'smartwatch',
  'mochila portátil', 'cargador usb-c', 'gafas de sol', 'sudadera capucha', 'botas montaña',
  'teclado mecánico', 'cafetera espresso', 'leggings deporte', 'reloj inteligente', 'altavoz portátil',
  'funda iphone', 'monitor 27 pulgadas', 'silla gaming',
];
const PRODUCTS = [
  { id: 'p-1001', cat: 'calzado', price: 89.9 }, { id: 'p-1002', cat: 'moda', price: 19.9 },
  { id: 'p-2001', cat: 'electronica', price: 149.0 }, { id: 'p-2002', cat: 'electronica', price: 299.0 },
  { id: 'p-3001', cat: 'hogar', price: 59.5 }, { id: 'p-3002', cat: 'deporte', price: 124.99 },
  { id: 'p-4001', cat: 'belleza', price: 24.0 }, { id: 'p-4002', cat: 'juguetes', price: 39.95 },
];
const FRICTION_TOPICS = ['checkout_address', 'size_guide', 'return_policy', 'filter_brand', 'payment_methods', 'shipping_options', 'stock_availability'];
const MINI_SERVICES = [
  { name: 'checkout', entry: 'home_banner' }, { name: 'support_chat', entry: 'fab' },
  { name: 'onboarding_wizard', entry: 'deep_link' }, { name: 'product_configurator', entry: 'menu' },
  { name: 'returns_flow', entry: 'order_detail' }, { name: 'gift_wrapping', entry: 'cart' },
  { name: 'size_finder', entry: 'product_page' },
];
const ENTRY_TYPES = ['home_banner', 'fab', 'deep_link', 'menu', 'push', 'email_link', 'search_result'];

// Funnels con pasos ordenados + probabilidad de completar cada paso (drop-off realista).
const FUNNELS = {
  checkout: ['cart_viewed', 'address_entered', 'payment_entered', 'order_placed'],
  onboarding: ['signup_started', 'account_created', 'profile_completed', 'permissions_granted', 'first_session_done'],
  subscription: ['plan_viewed', 'plan_selected', 'payment_entered', 'subscribed'],
};

// Eventos custom misceláneos que se rocían por la sesión.
const MISC_EVENTS = [
  () => ['filter_applied', { facet: pick(['brand', 'price', 'color', 'size', 'rating']), value: pick(['nike', '<50', 'azul', 'M', '4+']) }],
  () => ['sort_changed', { by: pick(['relevance', 'price_asc', 'price_desc', 'newest', 'rating']) }],
  () => ['video_played', { video_id: `v-${randint(100, 999)}`, seconds: randint(5, 120) }],
  () => ['share', { channel: pick(['whatsapp', 'twitter', 'copy_link', 'email', 'instagram']) }],
  () => ['notification_opened', { campaign: pick(['summer_sale', 'back_in_stock', 'cart_reminder', 'welcome']) }],
  () => ['push_opened', { campaign: pick(['flash_deal', 'order_shipped', 'price_drop']) }],
  () => ['rating_submitted', { score: randint(1, 5), context: pick(['app_store_prompt', 'post_purchase']) }],
  () => ['review_submitted', { product_id: pick(PRODUCTS).id, stars: randint(1, 5) }],
  () => ['referral_sent', { method: pick(['link', 'email', 'sms']) }],
  () => ['banner_clicked', { banner_id: `b-${randint(1, 20)}`, slot: pick(['home_top', 'category_mid', 'cart_cross_sell']) }],
  () => ['notifications_toggled', { enabled: chance(0.5) }],
  () => ['theme_changed', { theme: pick(['light', 'dark', 'system']) }],
  () => ['support_ticket_created', { topic: pick(['delivery', 'refund', 'product_issue', 'account']) }],
  () => ['remove_from_cart', { product_id: pick(PRODUCTS).id }],
];

const CAMPAIGNS = [
  { title: 'Rebajas de verano', campaign: 'summer_sale' },
  { title: 'Vuelve el stock', campaign: 'back_in_stock' },
  { title: 'Tu carrito te espera', campaign: 'cart_reminder' },
  { title: 'Bienvenido a la app', campaign: 'welcome' },
  { title: 'Oferta flash 24h', campaign: 'flash_deal' },
  { title: 'Pedido enviado', campaign: 'order_shipped' },
  { title: 'Baja de precio', campaign: 'price_drop' },
];

const PLANS = ['free', 'free', 'premium', 'pro'];
const SECTORS = ['retail', 'fashion', 'electronics', 'home', 'sports'];
const SIGNUP_SOURCES = ['organic', 'paid_search', 'social_ad', 'referral', 'email'];
const AB_VARIANTS = ['control', 'variant_a', 'variant_b'];
const LTV_BUCKETS = ['low', 'mid', 'high'];

const CRASHES = {
  web: [
    { type: 'TypeError', msg: "Cannot read properties of undefined (reading 'name')", stack: "TypeError: Cannot read properties of undefined (reading 'name')\n    at renderProfile (app.js:142:18)\n    at onClick (app.js:89:7)" },
    { type: 'TypeError', msg: 'undefined is not a function', stack: 'TypeError: undefined is not a function\n    at handleSubmit (checkout.js:54:9)' },
    { type: 'Error', msg: 'Network request failed', stack: 'Error: Network request failed\n    at fetchCart (api.js:23:11)' },
    { type: 'RangeError', msg: 'Maximum call stack size exceeded', stack: 'RangeError: Maximum call stack size exceeded\n    at normalize (utils.js:8:20)' },
    { type: 'ReferenceError', msg: 'analytics is not defined', stack: 'ReferenceError: analytics is not defined\n    at track (vendor.js:401:3)' },
    { type: 'SyntaxError', msg: "Unexpected token '<' in JSON at position 0", stack: 'SyntaxError: Unexpected token...\n    at JSON.parse (<anonymous>)' },
  ],
  android: [
    { type: 'NullPointerException', msg: "Attempt to invoke interface method 'java.util.Iterator java.util.List.iterator()' on a null object reference", stack: 'java.lang.NullPointerException: ...\n\tat com.acme.app.CartViewModel.load(CartViewModel.kt:54)' },
    { type: 'IllegalStateException', msg: 'Fragment CheckoutFragment not attached to a context.', stack: 'java.lang.IllegalStateException: ...\n\tat androidx.fragment.app.Fragment.requireContext(Fragment.java:1010)' },
    { type: 'IndexOutOfBoundsException', msg: 'Index 5 out of bounds for length 3', stack: 'java.lang.IndexOutOfBoundsException: ...\n\tat java.util.ArrayList.get(ArrayList.java:427)' },
    { type: 'NumberFormatException', msg: 'For input string: "12,99"', stack: 'java.lang.NumberFormatException: ...\n\tat java.lang.Double.parseDouble' },
    { type: 'SecurityException', msg: 'Permission Denial: opening provider', stack: 'java.lang.SecurityException: ...\n\tat android.os.Parcel.createException' },
  ],
  ios: [
    { type: 'NSRangeException', msg: '*** -[__NSArrayI objectAtIndex:]: index 5 beyond bounds [0 .. 1]', stack: '0 CoreFoundation __exceptionPreprocess\n1 libobjc.A.dylib objc_exception_throw\n2 CoreFoundation -[__NSArrayI objectAtIndex:]' },
    { type: 'NSInvalidArgumentException', msg: "-[__NSCFString count]: unrecognized selector sent to instance 0x600000", stack: '0 CoreFoundation __exceptionPreprocess\n1 libobjc.A.dylib objc_exception_throw\n2 CoreFoundation ___forwarding___' },
    { type: 'NSGenericException', msg: 'Collection was mutated while being enumerated.', stack: '0 CoreFoundation __exceptionPreprocess\n1 libobjc.A.dylib objc_exception_throw' },
  ],
};
const HANDLED_ERRORS = [
  { type: 'PaymentDeclinedError', msg: 'card_declined: insufficient_funds', sev: 'error', ctx: { gateway: 'stripe' } },
  { type: 'ApiError', msg: 'HTTP 500 - Internal Server Error', sev: 'error', ctx: { endpoint: '/api/orders' } },
  { type: 'ApiError', msg: 'HTTP 429 - Too Many Requests', sev: 'warning', ctx: { endpoint: '/api/search' } },
  { type: 'ValidationError', msg: 'invalid postal code', sev: 'warning', ctx: { field: 'zip' } },
  { type: 'TimeoutError', msg: 'request timed out after 10000ms', sev: 'error', ctx: { endpoint: '/api/cart' } },
  { type: 'AuthError', msg: 'session expired', sev: 'warning', ctx: { action: 'refresh_token' } },
];

// ───────────────────────── Usuarios (nuevos + recurrentes) ─────────────────────────
const userPool = [];

function newIdentity() {
  const platform = pick(['web', 'web', 'web', 'android', 'android', 'ios', 'ios', 'ios']);
  const geo = pick(GEO);
  const registered = chance(0.55);
  const device = { device_type: 'desktop', os_version: undefined, model: undefined, ua: undefined };

  if (platform === 'web') {
    const formFactor = pick(['desktop', 'desktop', 'mobile', 'mobile', 'tablet']);
    const ua = pick(WEB_UA[formFactor]);
    device.ua = ua;
    device.device_type = formFactor;
  } else {
    const d = pick(platform === 'android' ? ANDROID_DEVICES : IOS_DEVICES);
    device.device_type = d.type; device.os_version = d.os; device.model = d.model;
  }

  const registered2 = registered;
  return {
    platform, geo, device,
    registered: registered2,
    sdkUserId: uuid(),
    externalUserId: registered2 ? `user-${randint(1000, 9999)}` : null,
    attributes: {
      plan: pick(PLANS),
      registration_status: registered2 ? 'registered' : 'anonymous',
      sector: pick(SECTORS),
      signup_source: pick(SIGNUP_SOURCES),
      ab_test_variant: pick(AB_VARIANTS),
      ltv_bucket: pick(LTV_BUCKETS),
      notifications_enabled: chance(0.6),
    },
  };
}

/** Devuelve un perfil de sesión: ~35% reutiliza un usuario existente (recurrente). */
function makeProfile() {
  let identity;
  if (userPool.length > 0 && chance(0.35)) {
    identity = pick(userPool);
    // un usuario recurrente puede haber actualizado la app o subido de plan
    if (chance(0.3)) identity = { ...identity, attributes: { ...identity.attributes, plan: pick(PLANS) } };
  } else {
    identity = newIdentity();
    userPool.push(identity);
  }
  const ver = weightedVersion();
  return {
    ...identity,
    appVersion: ver.v,
    appVersionCrash: ver.crash,
    startedAt: realisticStart(),
  };
}

const screenFor = (platform, key) => (platform === 'web' ? WEB_SCREENS[key] : NATIVE_SCREENS[key]);

// ───────────────────────── Línea de tiempo de la sesión ─────────────────────────
function buildTimeline(profile) {
  const events = [];
  let t = profile.startedAt;
  const advance = (sec) => (t += Math.round(sec * 1000));
  const actives = new Set();
  let lastMini = null;

  const emit = (name, params = {}) => {
    const p = { ...params };
    if (lastMini) p.mini_service = lastMini;
    events.push({ name, ts: t, params: p });
  };

  emit('deepdots_session_start', {});

  const archetype = weightedArchetype();
  const journey = [...archetype.journey];
  let engagementBudgetMs = 0;
  const taskId = `task-${randint(10000, 99999)}`;

  // ¿mini-servicio(s)? hasta 2, con apertura en distintos puntos.
  const miniCount = FOCUS === 'mini-service'
    ? (chance(0.5) ? 2 : 1)                       // foco: siempre ≥1 (a veces 2, para #28 usage patterns)
    : FOCUS === 'crash'
      ? (chance(0.2) ? 1 : 0)
      : (chance(0.5) ? (chance(0.25) ? 2 : 1) : 0);
  const minis = sample(MINI_SERVICES, miniCount).map((m, i) => ({
    name: m.name, entry: pick(ENTRY_TYPES), openAt: randint(0, Math.max(0, journey.length - 1)), enteredTs: 0, idx: i,
  }));

  // ¿funnel? onboarding para nuevos/registrándose; checkout si compra; subscription a veces.
  const runOnboarding = archetype.name === 'onboarding' || (profile.registered && chance(0.15));
  const runSubscription = chance(0.12);
  const runCheckout = journey.includes('checkout');

  const emitFunnel = (funnel, completeProb) => {
    const steps = FUNNELS[funnel];
    const tid = `${funnel}-${randint(10000, 99999)}`;
    for (const step of steps) {
      advance(randint(1, 6));
      emit('deepdots_funnel_step', { funnel, step, task_id: tid });
      if (!chance(completeProb)) break; // drop-off
    }
  };

  if (runOnboarding) emitFunnel('onboarding', 0.8);

  journey.forEach((key, i) => {
    // abrir mini-servicios programados para este punto
    for (const m of minis) {
      if (m.openAt === i && !actives.has(m.name)) {
        actives.add(m.name); lastMini = m.name; m.enteredTs = t;
        emit('deepdots_mini_service_enter', { entry_point_type: m.entry });
      }
    }

    const dwell = randint(3, 110);
    engagementBudgetMs += dwell * 1000;
    emit('deepdots_page_view', { screen: screenFor(profile.platform, key), duration_seconds: dwell });

    if (key === 'search') {
      advance(randint(2, 8));
      const results = chance(0.18) ? 0 : randint(1, 240);
      emit('deepdots_search', { query: pick(SEARCH_QUERIES), results_count: results, has_results: results > 0 });
      if (results === 0 && chance(0.55)) emit('deepdots_findability_friction', { friction_topic: pick(FRICTION_TOPICS) });
    }
    if (key === 'category') {
      if (chance(0.6)) emit(...MISC_EVENTS[0]()); // filter_applied
      if (chance(0.4)) emit(...MISC_EVENTS[1]()); // sort_changed
    }
    if (key === 'product') {
      const prod = pick(PRODUCTS);
      advance(randint(1, 5));
      emit('product_viewed', { product_id: prod.id, category: prod.cat, price: prod.price });
      if (chance(0.45)) emit('add_to_cart', { product_id: prod.id, value: prod.price, currency: 'EUR', qty: randint(1, 3) });
      if (chance(0.15)) emit('wishlist_add', { product_id: prod.id });
      if (chance(0.2)) emit(...MISC_EVENTS[2]()); // video_played
    }
    if (key === 'reviews' && chance(0.3)) emit('review_submitted', { product_id: pick(PRODUCTS).id, stars: randint(1, 5) });
    if (key === 'cart') {
      advance(randint(2, 6));
      if (chance(0.3)) emit('coupon_applied', { code: pick(['WELCOME10', 'SUMMER20', 'FREESHIP']), discount: pick([10, 20, 0]) });
      if (chance(0.2)) emit('remove_from_cart', { product_id: pick(PRODUCTS).id });
    }
    if (key === 'checkout' && runCheckout) {
      advance(randint(2, 6));
      emit('checkout_started', { cart_value: money(20, 400), items: randint(1, 5) });
      emitFunnel('checkout', 0.82);
    }
    if (key === 'order') {
      advance(randint(1, 4));
      emit('purchase', {
        order_id: `o-${randint(100000, 999999)}`, value: money(20, 400), currency: 'EUR',
        items: randint(1, 5), payment_method: pick(['card', 'paypal', 'apple_pay', 'google_pay', 'klarna']),
      });
    }
    if (key === 'support' && chance(0.5)) emit('support_ticket_created', { topic: pick(['delivery', 'refund', 'product_issue', 'account']) });
    if (key === 'notifications' && chance(0.5)) emit(...pick([MISC_EVENTS[4], MISC_EVENTS[5]])()); // notification/push opened

    // rociar 0-2 eventos misceláneos extra
    const extra = randint(0, 2);
    for (let e = 0; e < extra; e++) { advance(randint(1, 4)); emit(...pick(MISC_EVENTS)()); }

    // cerrar algún mini-servicio activo (por nombre)
    for (const m of minis) {
      if (actives.has(m.name) && i > m.openAt && chance(0.45)) {
        const durSec = Math.max(5, Math.round((t - m.enteredTs) / 1000));
        emit('deepdots_mini_service_exit', { mini_service: m.name, duration_seconds: durSec });
        actives.delete(m.name);
        lastMini = actives.size ? [...actives].at(-1) : null;
      }
    }

    advance(dwell);
  });

  // cerrar mini-servicios que queden abiertos
  for (const m of minis) {
    if (actives.has(m.name)) {
      const durSec = Math.max(5, Math.round((t - m.enteredTs) / 1000));
      emit('deepdots_mini_service_exit', { mini_service: m.name, duration_seconds: durSec });
      actives.delete(m.name);
    }
  }
  lastMini = null;

  if (runSubscription) emitFunnel('subscription', 0.7);

  // engagement acumulado (1-3 pulsos según duración)
  const pulses = engagementBudgetMs > 120_000 ? 3 : engagementBudgetMs > 50_000 ? 2 : 1;
  for (let i = 0; i < pulses; i++) emit('deepdots_user_engagement', { engagement_time_msec: Math.round(engagementBudgetMs / pulses) });

  // Messaging (#18–22): notificaciones entregadas → click → conversión (funnel por message_id).
  const msgCount = FOCUS === 'messaging' ? randint(2, 5) : (chance(0.35) ? randint(1, 2) : 0);
  for (let m = 0; m < msgCount; m++) {
    const c = pick(CAMPAIGNS);
    const channel = chance(0.6) ? 'push' : 'in_app';
    const id = `m-${c.campaign}-${randint(1000, 9999)}`;
    advance(randint(1, 20));
    emit('deepdots_message', { stage: 'delivered', message_id: id, message_title: c.title, channel, campaign: c.campaign });
    if (chance(0.38)) { // CTR ~38%
      advance(randint(1, 40));
      emit('deepdots_message', { stage: 'clicked', message_id: id, message_title: c.title, channel, campaign: c.campaign });
      if (chance(0.35)) { // conversión ~35% de los clicks
        advance(randint(2, 30));
        emit('deepdots_message', { stage: 'converted', message_id: id, message_title: c.title, channel, campaign: c.campaign, value: money(10, 200), currency: 'EUR' });
      }
    }
  }

  // errores/crashes — tasa base ponderada por versión de app
  const crashRate = FOCUS === 'crash' ? 1 : (FOCUS === 'mini-service' || FOCUS === 'messaging') ? 0.03 : Math.min(0.4, 0.1 * profile.appVersionCrash);
  let crashed = false;
  if (chance(crashRate)) {
    crashed = true;
    const tpl = pick(CRASHES[profile.platform] ?? CRASHES.web);
    advance(randint(1, 10));
    const params = {
      crashed_at: t, crash_type: tpl.type, message: tpl.msg, stack: tpl.stack,
      fatal: true, handled: false, severity: 'fatal', crashed_app_version: profile.appVersion,
    };
    if (profile.platform !== 'web') { params.crashed_os_version = profile.device.os_version; params.crashed_device_model = profile.device.model; }
    if (chance(0.5)) params.ctx_screen = screenFor(profile.platform, pick(journey));
    emit('deepdots_app_crash', params);
  }
  // errores manejados (reportError) — pueden coexistir, no son fatales
  if (chance(FOCUS === 'crash' ? 0.5 : 0.18)) {
    const he = pick(HANDLED_ERRORS);
    advance(randint(1, 8));
    const params = {
      crashed_at: t, crash_type: he.type, message: he.msg, stack: `${he.type}: ${he.msg}\n    at <app code>`,
      fatal: false, handled: true, severity: he.sev, crashed_app_version: profile.appVersion,
    };
    if (profile.platform !== 'web') { params.crashed_os_version = profile.device.os_version; params.crashed_device_model = profile.device.model; }
    for (const [k, v] of Object.entries(he.ctx)) params[`ctx_${k}`] = v;
    emit('deepdots_app_crash', params);
  }

  return { events, crashed, archetype: archetype.name };
}

// ───────────────────────── Wire format ─────────────────────────
const kv = (key, value) => ({ key, value: [String(value)] });

function contextMetadata(profile) {
  const md = [];
  md.push(kv('deepdots_user_id', profile.sdkUserId));
  md.push(kv('deepdots_platform', profile.platform));
  md.push(kv('deepdots_language', profile.geo.lang));
  md.push(kv('deepdots_device_type', profile.device.device_type));
  if (profile.device.os_version) md.push(kv('deepdots_os_version', profile.device.os_version));
  if (profile.device.model) md.push(kv('deepdots_device_model', profile.device.model));
  md.push(kv('deepdots_app_version', profile.appVersion));
  if (profile.device.ua) md.push(kv('deepdots_user_agent', profile.device.ua));
  md.push(kv('deepdots_country', profile.geo.country));
  md.push(kv('deepdots_city', profile.geo.city));
  for (const [k, v] of Object.entries(profile.attributes)) md.push(kv(k, v));
  return md;
}

function buildBody(profile, batchEvents, feedbackSessionId) {
  const metadata = contextMetadata(profile);
  for (const e of batchEvents) metadata.push(kv(e.name, JSON.stringify({ timestamp: e.ts, ...e.params })));
  const profileKV = profile.externalUserId ? [kv('external-user-id', profile.externalUserId)] : [];
  return {
    publicKey: PUBLIC_KEY,
    integration: INTEGRATION,
    completed: false,
    finished: false,
    ...(feedbackSessionId ? { sessionId: feedbackSessionId } : {}),
    feedback: { text: '', answers: [], finished: false, profile: profileKV, metadata },
  };
}

function splitBatches(events) {
  if (events.length <= 4 || chance(0.35)) return [events];
  const n = randint(2, 4);
  const size = Math.ceil(events.length / n);
  const batches = [];
  for (let i = 0; i < events.length; i += size) batches.push(events.slice(i, i + size));
  return batches;
}

// ───────────────────────── Envío ─────────────────────────
async function postBody(body) {
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let json = null;
  const txt = await res.text();
  try { json = txt ? JSON.parse(txt) : null; } catch { /* no-JSON */ }
  return { ok: res.ok, status: res.status, json, txt };
}

async function sendSession(profile, timeline, statusCounts) {
  const batches = splitBatches(timeline.events);
  let feedbackSessionId;
  for (const batch of batches) {
    const r = await postBody(buildBody(profile, batch, feedbackSessionId));
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    if (r.ok) { if (r.json?.sessionId && !feedbackSessionId) feedbackSessionId = r.json.sessionId; }
    else return { ok: false, status: r.status, body: r.txt?.slice(0, 200) };
  }
  return { ok: true, sessionId: feedbackSessionId, batches: batches.length };
}

// ───────────────────────── Main ─────────────────────────
async function main() {
  console.log(`\n🌱 seed-analytics → ${ENDPOINT}`);
  console.log(`   sesiones=${COUNT} · concurrency=${CONCURRENCY}${FOCUS ? ` · focus=${FOCUS}` : ''}${DRY_RUN ? ' · DRY-RUN' : ''}\n`);

  if (DRY_RUN) {
    for (let i = 0; i < 3; i++) {
      const profile = makeProfile();
      const tl = buildTimeline(profile);
      const batches = splitBatches(tl.events);
      console.log(`Ejemplo ${i + 1}: archetype=${tl.archetype} platform=${profile.platform}/${profile.device.device_type} reg=${profile.registered} v=${profile.appVersion} eventos=${tl.events.length} crash=${tl.crashed} lotes=${batches.length}`);
      if (i === 0) {
        console.log('  eventos:', tl.events.map((e) => e.name).join(', '));
        console.log('\n── BODY 1er lote ──');
        console.log(JSON.stringify(buildBody(profile, batches[0], undefined), null, 2).slice(0, 1800), '\n…');
      }
    }
    console.log('\n(dry-run: no se ha enviado nada)');
    return;
  }

  console.log('🔎 Smoke test (1 sesión)…');
  const sp = makeProfile();
  const st = buildTimeline(sp);
  const smokeCounts = {};
  const smoke = await sendSession(sp, st, smokeCounts);
  if (!smoke.ok) {
    console.error(`\n❌ Smoke test FALLÓ (HTTP ${smoke.status}). Respuesta: ${smoke.body}`);
    if (!FORCE) { console.error('   Abortado. Re-ejecuta con --force para enviar igualmente.\n'); process.exit(1); }
    console.error('   --force activo: continúo.\n');
  } else {
    console.log(`✅ Smoke OK. sessionId=${smoke.sessionId ?? '—'}\n`);
  }

  const statusCounts = { ...smokeCounts };
  const stats = { sent: smoke.ok ? 1 : 0, failed: smoke.ok ? 0 : 1, crashed: st.crashed ? 1 : 0, archetypes: {}, platforms: {} };
  stats.archetypes[st.archetype] = 1; stats.platforms[sp.platform] = 1;
  const remaining = Math.max(0, COUNT - 1);

  let idx = 0;
  async function worker() {
    while (idx < remaining) {
      idx++;
      const profile = makeProfile();
      const tl = buildTimeline(profile);
      const r = await sendSession(profile, tl, statusCounts);
      if (r.ok) {
        stats.sent++; if (tl.crashed) stats.crashed++;
        stats.archetypes[tl.archetype] = (stats.archetypes[tl.archetype] ?? 0) + 1;
        stats.platforms[profile.platform] = (stats.platforms[profile.platform] ?? 0) + 1;
      } else stats.failed++;
      if (stats.sent % 25 === 0) console.log(`   … ${stats.sent}/${COUNT}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, remaining || 1) }, () => worker()));

  console.log('\n──────── Resumen ────────');
  console.log(`Sesiones OK:        ${stats.sent}/${COUNT}  (fallidas: ${stats.failed})`);
  console.log(`Usuarios únicos:    ${userPool.length} (recurrentes incluidos)`);
  console.log(`Con crash:          ${stats.crashed} (${Math.round((stats.crashed / Math.max(1, stats.sent)) * 100)}%)`);
  console.log(`Plataformas:        ${JSON.stringify(stats.platforms)}`);
  console.log(`Arquetipos:         ${JSON.stringify(stats.archetypes)}`);
  console.log(`HTTP status:        ${JSON.stringify(statusCounts)}`);
  console.log('─────────────────────────\n');
}

main().catch((e) => { console.error('Error fatal:', e); process.exit(1); });
