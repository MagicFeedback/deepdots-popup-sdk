// La tienda (el "host"): NORDLY, un e-commerce ficticio con lo que suele tener una web real
// alrededor del popup: header sticky, banner de cookies, chat flotante, modal propio y CSS que
// compite con el del SDK. Nada de esto sabe que hay un laboratorio encima.

import { strings, formatPrice } from './i18n.js';
import { defineRoute } from './router.js';

export const PRODUCTS = [
  { id: '42', name: { es: 'Chaqueta Fjell', en: 'Fjell Jacket' }, price: 8900, color: 'green', tone: '#d6d3c9', rating: 4.2, reviews: 128 },
  { id: '43', name: { es: 'Gorro Lana', en: 'Wool Beanie' }, price: 2400, color: 'grey', tone: '#c9d3d6', rating: 4.6, reviews: 54, oneSize: true },
  { id: '44', name: { es: 'Forro Polar Vind', en: 'Vind Fleece' }, price: 5900, color: 'sand', tone: '#d9cfc4', rating: 4.0, reviews: 77 },
  { id: '45', name: { es: 'Pantalón Sti', en: 'Sti Trousers' }, price: 6900, color: 'blue', tone: '#c4ccd9', rating: 3.9, reviews: 31 },
];

const CART_KEY = 'nordly.cart';

export function readCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeCart(items) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    /* storage bloqueado */
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const product = (id) => PRODUCTS.find((p) => p.id === id);

export function createShop({ root, lang, hooks }) {
  const t = strings(lang);
  document.documentElement.lang = lang;

  root.innerHTML = `
    <div class="announcement">${esc(t.announcement)}</div>
    <header class="site-header" data-testid="site-header">
      <a href="/" data-link class="logo">NORDLY</a>
      <nav class="main-nav" aria-label="main">
        <a href="/products" data-link>${esc(t.navWomen)}</a>
        <a href="/products" data-link>${esc(t.navMen)}</a>
        <a href="/products" data-link data-testid="nav-products">${esc(t.navOutdoor)}</a>
        <a href="/products" data-link>${esc(t.navSale)}</a>
      </nav>
      <span class="spacer"></span>
      <div class="lang-switch" role="group" aria-label="${esc(t.langLabel)}">
        <button type="button" data-lang="es" aria-pressed="${lang === 'es'}" data-testid="lang-es">ES</button>
        <button type="button" data-lang="en" aria-pressed="${lang === 'en'}" data-testid="lang-en">EN</button>
      </div>
      <a href="/account" data-link data-testid="nav-account">${esc(t.account)}</a>
      <a href="/cart" data-link class="cart-link" data-testid="nav-cart" aria-label="${esc(t.cart)}">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
        <span class="cart-count" data-testid="cart-count">0</span>
      </a>
    </header>
    <main id="view" data-testid="view"></main>
    <footer class="site-footer">
      <span>© NORDLY</span>
      <span class="spacer"></span>
      <button type="button" id="help-button" class="link-button" data-testid="help-button">${esc(t.help)}</button>
    </footer>
    <div class="cookie-banner" data-testid="cookie-banner" hidden>
      <span>${esc(t.cookieText)} <a href="#">${esc(t.cookiePolicy)}</a></span>
      <div class="row">
        <button type="button" class="btn btn-ghost" data-consent="necessary" data-testid="cookie-necessary">${esc(t.cookieNecessary)}</button>
        <button type="button" class="btn" data-consent="all" data-testid="cookie-accept">${esc(t.cookieAll)}</button>
      </div>
    </div>
    <button type="button" class="chat-bubble" aria-label="${esc(t.chat)}" data-testid="chat-bubble">
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>
    </button>
    <div class="toast" role="status" data-testid="toast" hidden></div>
  `;

  const view = root.querySelector('#view');
  const cartCount = root.querySelector('[data-testid="cart-count"]');
  const toast = root.querySelector('[data-testid="toast"]');
  const banner = root.querySelector('[data-testid="cookie-banner"]');

  function refreshCart() {
    cartCount.textContent = String(readCart().reduce((n, i) => n + i.qty, 0));
  }

  function addToCart(id) {
    const items = readCart();
    const found = items.find((i) => i.id === id);
    if (found) found.qty += 1;
    else items.push({ id, qty: 1 });
    writeCart(items);
    refreshCart();
    showToast(t.added);
    hooks.onHostAction('add_to_cart', { id });
  }

  let toastTimer;
  function showToast(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.hidden = true), 2000);
  }

  // --- Consentimiento de cookies -------------------------------------------------------------
  let consent = null;
  try {
    consent = localStorage.getItem('nordly.consent');
  } catch {
    /* sin storage: el banner sale siempre */
  }
  banner.hidden = Boolean(consent);
  banner.addEventListener('click', (e) => {
    const choice = e.target.closest('[data-consent]')?.dataset.consent;
    if (!choice) return;
    try {
      localStorage.setItem('nordly.consent', choice);
    } catch {
      /* ignore */
    }
    banner.hidden = true;
    hooks.onHostAction('consent', { choice });
    hooks.onConsent(choice);
  });

  root.querySelector('.lang-switch').addEventListener('click', (e) => {
    const next = e.target.closest('[data-lang]')?.dataset.lang;
    if (next && next !== lang) hooks.onLanguage(next);
  });

  root.querySelector('#help-button').addEventListener('click', () => hooks.onHostAction('help_clicked'));
  root.querySelector('.chat-bubble').addEventListener('click', () => hooks.onHostAction('chat_opened'));

  view.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) addToCart(add.dataset.add);
    const rate = e.target.closest('[data-rate]');
    if (rate) hooks.onRate(rate.dataset.rate);
    const remove = e.target.closest('[data-remove]');
    if (remove) {
      writeCart(readCart().filter((i) => i.id !== remove.dataset.remove));
      refreshCart();
      hooks.rerender();
    }
    const size = e.target.closest('[data-size]');
    if (size) {
      view.querySelectorAll('[data-size]').forEach((b) => b.setAttribute('aria-pressed', String(b === size)));
    }
    if (e.target.closest('[data-newsletter-close]')) view.querySelector('.host-modal')?.remove();
  });

  refreshCart();

  // --- Vistas ---------------------------------------------------------------------------------
  const card = (p) => `
    <a href="/products/${p.id}" data-link class="product-card" data-testid="product-${p.id}">
      <div class="swatch" style="background:${p.tone}"></div>
      <span class="name">${esc(p.name[lang])}</span>
      <span class="price">${formatPrice(p.price, lang)}</span>
    </a>`;

  defineRoute('/', () => `
    <section class="hero">
      <h1>${esc(t.homeTitle)}</h1>
      <p>${esc(t.homeLead)}</p>
      <a href="/products" data-link class="btn" data-testid="shop-now">${esc(t.shopNow)}</a>
    </section>
    <section class="grid">${PRODUCTS.slice(0, 3).map(card).join('')}</section>`);

  defineRoute('/products', () => `
    <div class="crumbs">${esc(t.productsTitle)}</div>
    <h1>${esc(t.productsTitle)}</h1>
    <section class="grid">${PRODUCTS.map(card).join('')}</section>
    <div class="host-modal" role="dialog" aria-label="${esc(t.newsletterTitle)}" data-testid="newsletter-modal">
      <div class="host-modal-card">
        <strong>${esc(t.newsletterTitle)}</strong>
        <p>${esc(t.newsletterBody)}</p>
        <div class="row">
          <button type="button" class="btn btn-ghost" data-newsletter-close data-testid="newsletter-close">${esc(t.close)}</button>
          <button type="button" class="btn" data-newsletter-close>${esc(t.subscribe)}</button>
        </div>
      </div>
    </div>`);

  defineRoute('/products/:id', ({ id }) => {
    const p = product(id);
    if (!p) return `<h1>${esc(t.notFound)}</h1>`;
    const sizes = p.oneSize ? [t.oneSize] : ['S', 'M', 'L'];
    return `
      <div class="pdp">
        <div class="gallery">
          <div class="swatch big" style="background:${p.tone}"></div>
          <div class="swatch" style="background:#c9d3d6"></div>
          <div class="swatch" style="background:#d9cfc4"></div>
        </div>
        <div class="pdp-info">
          <div class="crumbs">${esc(t.productsTitle)}</div>
          <h1 data-testid="product-title">${esc(p.name[lang])}</h1>
          <span class="price">${formatPrice(p.price, lang)}</span>
          <span class="muted">★ ${p.rating.toLocaleString(lang)} · ${p.reviews} ${esc(t.reviews)}</span>
          <div class="row" role="group" aria-label="${esc(t.size)}">
            ${sizes.map((s, i) => `<button type="button" class="size" data-size="${esc(s)}" aria-pressed="${i === 1 || sizes.length === 1}">${esc(s)}</button>`).join('')}
          </div>
          <button type="button" class="btn" data-add="${p.id}" data-testid="add-to-cart">${esc(t.addToCart)}</button>
          <button type="button" class="btn btn-ghost" data-rate="${p.id}" data-testid="rate-product">${esc(t.rate)}</button>
        </div>
      </div>`;
  });

  defineRoute('/cart', () => {
    const items = readCart();
    if (!items.length) return `<h1>${esc(t.cartTitle)}</h1><p class="muted" data-testid="cart-empty">${esc(t.cartEmpty)}</p>`;
    return `
      <h1>${esc(t.cartTitle)}</h1>
      <div class="lines">
        ${items.map((i) => {
          const p = product(i.id);
          return `<div class="line"><div class="swatch sm" style="background:${p.tone}"></div><span class="grow">${esc(p.name[lang])} × ${i.qty}</span><span>${formatPrice(p.price * i.qty, lang)}</span><button type="button" class="link-button" data-remove="${p.id}">${esc(t.remove)}</button></div>`;
        }).join('')}
      </div>
      <a href="/checkout" data-link class="btn" data-testid="go-checkout">${esc(t.checkout)}</a>`;
  });

  defineRoute('/checkout', () => {
    const items = readCart().length ? readCart() : [{ id: '42', qty: 1 }, { id: '43', qty: 1 }];
    const total = items.reduce((s, i) => s + product(i.id).price * i.qty, 0);
    const steps = t.checkoutSteps.map((s, i) => (i === 1 ? `<strong>${esc(s)}</strong>` : esc(s))).join(' › ');
    return `
      <div class="checkout">
        <form class="checkout-form" data-testid="checkout-form" onsubmit="return false">
          <div class="crumbs">${steps}</div>
          <h1>${esc(t.shippingTitle)}</h1>
          <label>${esc(t.email)}<input name="email" value="qa@deepdots.dev" autocomplete="off"></label>
          <div class="two">
            <label>${esc(t.firstName)}<input name="first" value="Test"></label>
            <label>${esc(t.lastName)}<input name="last" value="User"></label>
          </div>
          <label>${esc(t.address)}<input name="address" value="${lang === 'en' ? '1 Test Street' : 'Calle de Prueba 1'}"></label>
          <button type="submit" class="btn" data-testid="continue-payment">${esc(t.continuePay)}</button>
        </form>
        <aside class="summary">
          <strong>${esc(t.summary)}</strong>
          ${items.map((i) => {
            const p = product(i.id);
            return `<div class="line"><div class="swatch sm" style="background:${p.tone}"></div><span class="grow">${esc(p.name[lang])}<br><span class="muted">${esc(t.color[p.color])}</span></span><span>${formatPrice(p.price * i.qty, lang)}</span></div>`;
          }).join('')}
          <div class="line total"><span class="grow">${esc(t.total)}</span><span>${formatPrice(total, lang)}</span></div>
        </aside>
      </div>`;
  });

  defineRoute('/account', () => `
    <h1>${esc(t.accountTitle)}</h1>
    <p class="muted">${esc(t.accountLead)}</p>
    <h2>${esc(t.orders)}</h2>
    <div class="lines"><div class="line"><span class="grow">#10231 · ${PRODUCTS[0].name[lang]}</span><span>${formatPrice(PRODUCTS[0].price, lang)}</span></div></div>`);

  defineRoute('/404', () => `<h1>${esc(t.notFound)}</h1>`);

  return {
    render(html) {
      view.innerHTML = html;
      window.scrollTo(0, 0);
    },
    showBanner() {
      banner.hidden = false;
    },
    hasConsent: () => Boolean(consent),
  };
}
