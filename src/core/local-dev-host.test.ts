import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDevOrTestHost, isLocalDevHost } from './local-dev-host';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';

describe('isLocalDevHost (DD-540)', () => {
  it.each(['localhost', 'LOCALHOST', 'admin.localhost', '127.0.0.1', '127.1.2.3', '0.0.0.0', '::1', '[::1]'])('%s is local', (h) => {
    expect(isLocalDevHost(h)).toBe(true);
  });
  it.each(['app.deepdots.com', 'app-dev.deepdots.com', 'localhost.example.com', '10.0.0.5', '192.168.1.10', '', undefined])('%s is not local', (h) => {
    expect(isLocalDevHost(h)).toBe(false);
  });
});

describe('isDevOrTestHost (DD-574, same list as the API)', () => {
  it.each([
    'localhost', '127.0.0.1', '::1', '[::1]', 'admin.localhost',
    'localfrontend.holsel-ttst01.holte.test', 'shop.local', 'svc.internal', 'demo.example',
    'app.deepdots.com', 'APP-DEV.deepdots.com',
  ])('%s is a dev/test host', (h) => {
    expect(isDevOrTestHost(h)).toBe(true);
  });
  it.each([
    'www.bd.dk', 'deepdots.com', 'api.deepdots.com', 'host.example.com', 'test.com', 'mytest',
    'app.deepdots.com.evil.io', '10.0.0.5', '', undefined,
  ])('%s is not', (h) => {
    expect(isDevOrTestHost(h)).toBe(false);
  });
  it('does not widen isLocalDevHost (that one gates analytics)', () => {
    expect(isLocalDevHost('localfrontend.holsel-ttst01.holte.test')).toBe(false);
    expect(isLocalDevHost('app-dev.deepdots.com')).toBe(false);
  });
});

describe('analytics on localhost (DD-540)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function run(hostname: string, trackLocalhost?: boolean) {
    vi.stubGlobal('location', { ...window.location, hostname, href: `http://${hostname}:8083/`, pathname: '/', search: '', hash: '' });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as unknown as Response);
    vi.stubGlobal('fetch', fetchSpy);
    const sdk = new DeepdotsPopups();
    sdk.setRenderer(new NoopPopupRenderer());
    sdk.init({
      apiKey: 'pk-1',
      nodeEnv: 'development',
      geolocation: false,
      analytics: { publicKey: 'pub-a', integration: 'int-7' },
      ...(trackLocalhost !== undefined ? { trackLocalhost } : {}),
    });
    sdk.reportError(new TypeError("Cannot read properties of null (reading 'useContext')"));
    sdk.flushAnalytics();
    return fetchSpy.mock.calls.filter(([u]) => typeof u === 'string' && u.endsWith('/sdk/feedback'));
  }

  it('sends nothing on localhost by default (crash included)', () => {
    expect(run('localhost')).toHaveLength(0);
    expect(run('127.0.0.1')).toHaveLength(0);
  });

  it('sends on localhost with trackLocalhost: true', () => {
    const calls = run('localhost', true);
    expect(calls.length).toBeGreaterThan(0);
    const body = JSON.parse((calls[0][1] as RequestInit).body as string);
    expect(body.feedback.metadata.some((m: { key: string }) => m.key === 'deepdots_app_crash')).toBe(true);
  });

  it('sends on a real host', () => {
    expect(run('app.deepdots.com').length).toBeGreaterThan(0);
  });
});
