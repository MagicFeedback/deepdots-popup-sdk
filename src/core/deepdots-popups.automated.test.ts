import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage } from '../tracking/tracking-manager';
import { isAutomatedBrowser } from '../analytics/device-info';

/**
 * DD-574: en un crawler o un navegador automatizado (`navigator.webdriver`) `init()` no llama a
 * la API: ni GET de popups, ni POST de contact, ni analytics. En bd.dk (nov-2026) cada visita de
 * bingbot/Googlebot era un userId anónimo nuevo → un contact en el CRM y un hueco menos del cupo
 * diario del popup. User agents tomados de los logs de PROD.
 */
const BOTS: Record<string, string> = {
    bingbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/136.0.0.0 Safari/537.36',
    'Googlebot smartphone': 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.8103.78 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    Baidu: 'Mozilla/5.0 (compatible; Baiduspider-render/2.0; +http://www.baidu.com/search/spider.html)',
    PetalBot: 'Mozilla/5.0 (Linux; Android 7.0;) AppleWebKit/537.36 (HTML, like Gecko) Mobile Safari/537.36 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)',
};
const BROWSERS: Record<string, string> = {
    'Chrome desktop': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    'Safari iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    'Chrome Android': 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36',
};

describe('isAutomatedBrowser', () => {
    it.each(Object.entries(BOTS))('%s → true', (_n, userAgent) => {
        expect(isAutomatedBrowser({ userAgent, webdriver: false })).toBe(true);
    });
    it.each(Object.entries(BROWSERS))('%s → false', (_n, userAgent) => {
        expect(isAutomatedBrowser({ userAgent, webdriver: false })).toBe(false);
    });
    it('navigator.webdriver → true aunque el UA sea de un navegador real', () => {
        expect(isAutomatedBrowser({ userAgent: BROWSERS['Chrome desktop'], webdriver: true })).toBe(true);
    });
    it('sin navigator o sin UA (React Native) → false', () => {
        expect(isAutomatedBrowser(undefined)).toBe(false);
        expect(isAutomatedBrowser({})).toBe(false);
    });
});

describe('DeepdotsPopups.init() en un navegador automatizado', () => {
    let calls: { url: string; method: string }[];

    function setNavigator(userAgent: string, webdriver: boolean) {
        Object.defineProperty(globalThis.navigator, 'userAgent', { value: userAgent, configurable: true });
        Object.defineProperty(globalThis.navigator, 'webdriver', { value: webdriver, configurable: true });
    }

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        calls = [];
        vi.stubGlobal('fetch', vi.fn(async (url: unknown, opts?: { method?: string }) => {
            calls.push({ url: String(url), method: opts?.method ?? 'GET' });
            return { ok: true, status: 200, json: async () => ({}), text: async () => '[]' } as unknown as Response;
        }));
    });

    afterEach(() => {
        // Vuelve al navegador de un visitante real (vitest.setup.ts).
        Object.defineProperty(globalThis.navigator, 'webdriver', { value: false, configurable: true });
        Object.defineProperty(globalThis.navigator, 'userAgent', { value: BROWSERS['Chrome desktop'], configurable: true });
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    /** init como bd.dk: popups + analytics, y un usuario identificado con atributos. */
    async function initLikeBdDk(extra: Record<string, unknown> = {}) {
        const sdk = new DeepdotsPopups();
        sdk.setRenderer(new NoopPopupRenderer());
        sdk.init({
            apiKey: 'pk',
            nodeEnv: 'development',
            userId: 'user-1',
            contactAttributes: { plan: 'x' },
            analytics: { publicKey: 'pub', integration: 'int-1' },
            geolocation: false,
            storage: new InMemoryStorage(),
            ...extra,
        });
        sdk.autoLaunch();
        await new Promise((r) => setTimeout(r, 1700)); // > CONTACT_SYNC_TIMEOUT_MS
        await sdk.setContactAttributes({ plan: 'y' });
        sdk.track('custom_event');
        await (sdk as unknown as { flushAnalytics: () => Promise<void> }).flushAnalytics?.();
        return sdk;
    }

    it.each(Object.entries(BOTS))('%s: ninguna llamada a la API', async (_n, ua) => {
        setNavigator(ua, false);
        await initLikeBdDk();
        expect(calls).toEqual([]);
    });

    it('navigator.webdriver (Playwright, Selenium): ninguna llamada a la API', async () => {
        setNavigator(BROWSERS['Chrome desktop'], true);
        await initLikeBdDk();
        expect(calls).toEqual([]);
    });

    it.each(Object.entries(BROWSERS))('%s: GET de popups y POST de contact como siempre', async (_n, ua) => {
        setNavigator(ua, false);
        await initLikeBdDk();
        expect(calls.some((c) => c.method === 'GET' && c.url.includes('/sdk/pk/popups'))).toBe(true);
        expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/sdk/popups/contact'))).toBe(true);
    });

    it('allowAutomatedBrowsers: true (e2e propios) vuelve a llamar a la API', async () => {
        setNavigator(BROWSERS['Chrome desktop'], true);
        await initLikeBdDk({ allowAutomatedBrowsers: true });
        expect(calls.some((c) => c.url.includes('/sdk/pk/popups'))).toBe(true);
    });
});
