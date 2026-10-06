import { describe, it, expect } from 'vitest';
import { NavigationObserver, normalizeScreen, screenPath, type ScreenVisit } from './navigation-observer';

describe('normalizeScreen', () => {
  it('keeps the path and drops the query string', () => {
    expect(normalizeScreen('https://app.test/home?token=abc')).toBe('/home');
  });

  it('collapses numeric id segments to :id', () => {
    expect(normalizeScreen('https://app.test/user/12345/orders')).toBe('/user/:id/orders');
  });

  it('collapses uuid segments to :id', () => {
    expect(normalizeScreen('https://app.test/p/a9c8c170-bb1c-11f0-9d29-d5fe3dd521d0')).toBe('/p/:id');
  });

  it('preserves hash routes (SPA)', () => {
    expect(normalizeScreen('https://app.test/#/product/9')).toBe('/#/product/:id');
  });
});

describe('NavigationObserver', () => {
  const makeObserver = () => {
    let clock = 1000;
    const visits: ScreenVisit[] = [];
    const obs = new NavigationObserver({ now: () => clock });
    obs.onVisit((v) => visits.push(v));
    return {
      obs,
      visits,
      advance: (ms: number) => {
        clock += ms;
      },
    };
  };

  it('emits a completed visit when leaving a screen, with duration', () => {
    const { obs, visits, advance } = makeObserver();
    obs.begin('https://app.test/home');
    advance(5000);
    obs.visit('https://app.test/product/1');

    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ screen: '/home', durationSeconds: 5 });
  });

  it('does not emit when navigating to the same normalized screen', () => {
    const { obs, visits } = makeObserver();
    obs.begin('https://app.test/home?a=1');
    obs.visit('https://app.test/home?a=2'); // misma screen normalizada
    expect(visits).toHaveLength(0);
  });

  it('stop() closes the current screen emitting its visit', () => {
    const { obs, visits, advance } = makeObserver();
    obs.begin('https://app.test/home');
    advance(3000);
    obs.stop();

    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ screen: '/home', durationSeconds: 3 });
  });

  it('tracks a sequence of distinct screens (revisits are new visits)', () => {
    const { obs, visits, advance } = makeObserver();
    obs.begin('https://app.test/home');
    advance(1000);
    obs.visit('https://app.test/product/1');
    advance(1000);
    obs.visit('https://app.test/home');
    advance(1000);
    obs.stop();

    expect(visits.map((v) => v.screen)).toEqual(['/home', '/product/:id', '/home']);
  });

  /**
   * `restart()` lo usa `openSession`: tras un cierre de sesión sin navegación (cambio de
   * usuario, vuelta de la bfcache) la pantalla en la que está el usuario tiene que volver a
   * contar, con la entrada en el momento de la reapertura y no en la visita anterior.
   */
  describe('restart()', () => {
    it('retoma la pantalla actual tras un stop(), contando desde la reapertura', () => {
      window.history.pushState({}, '', '/settings');
      const { obs, visits, advance } = makeObserver();
      obs.install();
      advance(1000);
      obs.stop();
      advance(4000); // sesión cerrada: este rato no es de nadie
      obs.restart();
      advance(2000);
      obs.stop();
      obs.uninstall();

      expect(visits.map((v) => [v.screen, v.durationSeconds])).toEqual([
        ['/settings', 1],
        ['/settings', 2],
      ]);
    });

    it('no pisa una pantalla en curso', () => {
      window.history.pushState({}, '', '/settings');
      const { obs, visits, advance } = makeObserver();
      obs.install();
      advance(1000);
      obs.restart();
      advance(1000);
      obs.stop();
      obs.uninstall();

      expect(visits.map((v) => [v.screen, v.durationSeconds])).toEqual([['/settings', 2]]);
    });

    it('no hace nada sin install(): la navegación manual (setScreen, RN) va por su cuenta', () => {
      const { obs, visits } = makeObserver();
      obs.restart();
      obs.stop();

      expect(visits).toHaveLength(0);
    });
  });
});

describe('screenPath and the visit path', () => {
  it('keeps the real ids, dropping only the query', () => {
    expect(screenPath('https://app.test/insights/requests/2f1c9a10-bb5e-11f1-9ff7-b9c354c04f0c?project=X')).toBe(
      '/insights/requests/2f1c9a10-bb5e-11f1-9ff7-b9c354c04f0c'
    );
    expect(screenPath('https://app.test/#/orders/42?x=1')).toBe('/#/orders/42');
  });

  it('each visit carries both the normalized screen and the real path', () => {
    let t = 0;
    const obs = new NavigationObserver({ now: () => t });
    const visits: ScreenVisit[] = [];
    obs.onVisit((v) => visits.push(v));
    obs.begin('https://app.test/insights/requests/2f1c9a10-bb5e-11f1-9ff7-b9c354c04f0c?project=X');
    t = 5000;
    obs.visit('https://app.test/insights/requests/new');
    expect(visits[0]).toMatchObject({
      screen: '/insights/requests/:id',
      path: '/insights/requests/2f1c9a10-bb5e-11f1-9ff7-b9c354c04f0c',
      durationSeconds: 5,
    });
  });

  it('moving between two items of the same screen is a new visit', () => {
    let t = 0;
    const obs = new NavigationObserver({ now: () => t });
    const visits: ScreenVisit[] = [];
    obs.onVisit((v) => visits.push(v));
    obs.begin('https://app.test/insights/requests/11111111-1111-1111-1111-111111111111');
    t = 3000;
    obs.visit('https://app.test/insights/requests/22222222-2222-2222-2222-222222222222');
    t = 4000;
    obs.visit('https://app.test/insights/requests/22222222-2222-2222-2222-222222222222?tab=2');
    obs.stop();
    expect(visits.map((v) => v.path)).toEqual([
      '/insights/requests/11111111-1111-1111-1111-111111111111',
      '/insights/requests/22222222-2222-2222-2222-222222222222',
    ]);
    expect(visits.map((v) => v.screen)).toEqual(['/insights/requests/:id', '/insights/requests/:id']);
  });
});

