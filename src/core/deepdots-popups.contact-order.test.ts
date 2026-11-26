import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTACT_SYNC_TIMEOUT_MS, DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage } from '../tracking/tracking-manager';

/**
 * DD-561: the server applies the exclusions by email, domain and attribute (DD-333) from the
 * contact, so the popups GET has to go after the contact POST of `init({ contactAttributes })`,
 * but never wait more than CONTACT_SYNC_TIMEOUT_MS.
 */
describe('DeepdotsPopups — contact POST before popups GET (DD-561)', () => {
  type Call = { kind: 'contact' | 'popups' | 'other'; at: 'start' | 'end' };
  let log: Call[];
  let releaseContact: (() => void) | null;
  let failContact: ((e: Error) => void) | null;

  function kindOf(url: string, method: string): Call['kind'] {
    if (url.includes('/sdk/popups/contact') && method === 'POST') return 'contact';
    if (/\/sdk\/[^/]+\/popups/.test(url) && method === 'GET') return 'popups';
    return 'other';
  }

  function stubFetch(contactMode: 'manual' | 'instant') {
    vi.stubGlobal('fetch', vi.fn((url: unknown, opts?: { method?: string }) => {
      const kind = kindOf(String(url), opts?.method ?? 'GET');
      log.push({ kind, at: 'start' });
      const ok = { ok: true, status: 200, json: async () => ({}), text: async () => '[]' } as unknown as Response;
      if (kind === 'contact' && contactMode === 'manual') {
        return new Promise<Response>((resolve, reject) => {
          releaseContact = () => { log.push({ kind, at: 'end' }); resolve(ok); };
          failContact = (e) => { log.push({ kind, at: 'end' }); reject(e); };
        });
      }
      log.push({ kind, at: 'end' });
      return Promise.resolve(ok);
    }));
  }

  const starts = (kind: Call['kind']) => log.filter((c) => c.kind === kind && c.at === 'start').length;
  const flush = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };

  let popups: DeepdotsPopups;
  beforeEach(() => {
    log = [];
    releaseContact = null;
    failContact = null;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const init = (storage = new InMemoryStorage()) =>
    popups.init({
      apiKey: 'pk',
      nodeEnv: 'development',
      userId: 'new-user',
      storage,
      contactAttributes: { email: 'bo@shop.dd333-internal.com' },
    });

  it('new attributes: the popups GET waits for the contact POST', async () => {
    stubFetch('manual');
    init();
    await flush();
    expect(starts('contact')).toBe(1);
    expect(starts('popups')).toBe(0);

    releaseContact!();
    await flush();
    const contactEnd = log.findIndex((c) => c.kind === 'contact' && c.at === 'end');
    const popupsStart = log.findIndex((c) => c.kind === 'popups' && c.at === 'start');
    expect(popupsStart).toBeGreaterThan(contactEnd);
  });

  it('a failed contact POST does not block the popups', async () => {
    stubFetch('manual');
    init();
    await flush();
    failContact!(new Error('offline'));
    await flush();
    expect(starts('popups')).toBe(1);
  });

  it('a slow contact POST: the popups GET goes after CONTACT_SYNC_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    stubFetch('manual');
    init();
    await vi.advanceTimersByTimeAsync(CONTACT_SYNC_TIMEOUT_MS - 1);
    expect(starts('popups')).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(starts('popups')).toBe(1);
    expect(CONTACT_SYNC_TIMEOUT_MS).toBeLessThanOrEqual(1500);
  });

  it('same attributes as last time: no POST and no wait', async () => {
    const storage = new InMemoryStorage();
    stubFetch('instant');
    init(storage);
    await flush();
    expect(starts('contact')).toBe(1);

    log = [];
    popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
    stubFetch('manual');
    init(storage);
    await flush();
    expect(starts('contact')).toBe(0);
    expect(starts('popups')).toBe(1);
  });

  it('without contactAttributes the popups GET goes in the same tick as before', () => {
    stubFetch('instant');
    popups.init({ apiKey: 'pk', nodeEnv: 'development', userId: 'u', storage: new InMemoryStorage() });
    expect(starts('popups')).toBe(1);
  });
});
