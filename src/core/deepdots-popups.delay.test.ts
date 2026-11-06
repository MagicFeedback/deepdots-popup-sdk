import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import type { PopupRenderer } from '../platform/renderer';
import { mockPopupsApi, flushPopupsLoad } from './test-helpers';
import type { PopupDefinition, PopupTrigger } from '../types';

/**
 * "Delay (seconds)" del Admin (`trigger.delaySeconds`) en todos los tipos de trigger
 * (reportado por MOM: event RATING + 60 s salía al momento).
 */

function popup(id: string, triggers: PopupTrigger[], extra: Partial<PopupDefinition> = {}): PopupDefinition {
  return {
    id,
    title: id,
    message: '',
    triggers,
    surveyId: `survey-${id}`,
    productId: 'product-1',
    ...extra,
  };
}

function navigateHash(hash: string): void {
  const oldURL = window.location.href;
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: window.location.href }));
}

/** Carga las definiciones con timers reales y pasa a timers falsos para medir el retraso. */
async function setup(defs: PopupDefinition[], renderer: PopupRenderer = new NoopPopupRenderer()) {
  const popups = new DeepdotsPopups();
  popups.setRenderer(renderer);
  mockPopupsApi(defs);
  popups.init({ apiKey: 'k' });
  await flushPopupsLoad();
  const shown = vi.fn();
  popups.on('popup_shown', shown);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  popups.autoLaunch();
  const shownIds = () => shown.mock.calls.map(([event]) => (event.data as { popupId: string }).popupId);
  return { popups, shown, shownIds };
}

describe('DeepdotsPopups trigger delaySeconds', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    window.location.hash = '#/home';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('event', () => {
    it('delaySeconds 0 shows at once', async () => {
      const { popups, shown } = await setup([popup('p-rating', [{ type: 'event', value: 'RATING', delaySeconds: 0 }])]);
      popups.triggerEvent('RATING');
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('without delaySeconds (older popups) shows at once', async () => {
      const { popups, shown } = await setup([popup('p-rating', [{ type: 'event', value: 'RATING' }])]);
      popups.triggerEvent('RATING');
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('delaySeconds 60 shows 60 s after triggerEvent, not before (MOM)', async () => {
      const { popups, shown } = await setup([popup('p-rating', [{ type: 'event', value: 'RATING', delaySeconds: 60 }])]);
      popups.triggerEvent('RATING');
      expect(shown).not.toHaveBeenCalled();
      vi.advanceTimersByTime(59_999);
      expect(shown).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('firing the event again while waiting neither restarts nor duplicates it', async () => {
      const { popups, shown } = await setup([popup('p-rating', [{ type: 'event', value: 'RATING', delaySeconds: 60 }])]);
      popups.triggerEvent('RATING');
      vi.advanceTimersByTime(30_000);
      popups.triggerEvent('RATING');
      vi.advanceTimersByTime(30_000);
      expect(shown).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(60_000);
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('an event fired before the popups load keeps its delay when replayed', async () => {
      const popups = new DeepdotsPopups();
      popups.setRenderer(new NoopPopupRenderer());
      mockPopupsApi([popup('p-rating', [{ type: 'event', value: 'RATING', delaySeconds: 10 }])]);
      popups.init({ apiKey: 'k' });
      const shown = vi.fn();
      popups.on('popup_shown', shown);
      popups.triggerEvent('RATING'); // buffered: the GET is still in flight
      await flushPopupsLoad();
      // Replayed after the load, but still waiting for its 10 s (before the fix it showed here).
      expect(shown).not.toHaveBeenCalled();
      popups.onBackground(); // clears the pending real timer
    });
  });

  describe('time_on_page', () => {
    it('delaySeconds 0 shows after value seconds', async () => {
      const { shown } = await setup([popup('p-time', [{ type: 'time_on_page', value: 2, delaySeconds: 0 }])]);
      vi.advanceTimersByTime(1_999);
      expect(shown).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('delaySeconds N waits N s more after the time on page is reached', async () => {
      const { shown } = await setup([popup('p-time', [{ type: 'time_on_page', value: 2, delaySeconds: 3 }])]);
      vi.advanceTimersByTime(4_999);
      expect(shown).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(shown).toHaveBeenCalledTimes(1);
    });
  });

  describe('scroll', () => {
    function scrollToBottom(): void {
      Object.defineProperty(window, 'scrollY', { value: 1000, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 100, configurable: true });
      Object.defineProperty(document.documentElement, 'scrollHeight', { value: 1100, configurable: true });
      window.dispatchEvent(new Event('scroll'));
    }

    it('delaySeconds 0 shows when the threshold is reached', async () => {
      const { shown } = await setup([popup('p-scroll', [{ type: 'scroll', value: 50, delaySeconds: 0 }])]);
      scrollToBottom();
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('delaySeconds N shows N s after the threshold is reached', async () => {
      const { shown } = await setup([popup('p-scroll', [{ type: 'scroll', value: 50, delaySeconds: 5 }])]);
      scrollToBottom();
      vi.advanceTimersByTime(4_999);
      expect(shown).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(shown).toHaveBeenCalledTimes(1);
    });
  });

  describe('click', () => {
    function addButton(): HTMLButtonElement {
      const button = document.createElement('button');
      button.id = 'help-button';
      document.body.appendChild(button);
      return button;
    }

    it('delaySeconds 0 shows on click', async () => {
      const button = addButton();
      const { shown } = await setup([popup('p-click', [{ type: 'click', value: 'help-button', delaySeconds: 0 }])]);
      button.click();
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('delaySeconds N shows N s after the click', async () => {
      const button = addButton();
      const { shown } = await setup([popup('p-click', [{ type: 'click', value: 'help-button', delaySeconds: 4 }])]);
      button.click();
      vi.advanceTimersByTime(3_999);
      expect(shown).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(shown).toHaveBeenCalledTimes(1);
    });
  });

  describe('exit', () => {
    beforeEach(() => {
      window.location.hash = '#/login';
    });

    it('delaySeconds 0 (value 0, as the Admin saves it) shows on the next route at once', async () => {
      const { shown } = await setup([
        popup('p-exit', [{ type: 'exit', value: 0, delaySeconds: 0 }], { segments: { path: ['/#/login'] } }),
      ]);
      navigateHash('#/next');
      vi.advanceTimersByTime(0);
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('delaySeconds N (value 0, as the Admin saves it) waits N s on the next route', async () => {
      const { shown } = await setup([
        popup('p-exit', [{ type: 'exit', value: 0, delaySeconds: 3 }], { segments: { path: ['/#/login'] } }),
      ]);
      navigateHash('#/next');
      vi.advanceTimersByTime(2_999);
      expect(shown).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('older exit popups with the delay in value keep working', async () => {
      const { shown } = await setup([popup('p-exit', [{ type: 'exit', value: 2 }], { segments: { path: ['/#/login'] } })]);
      navigateHash('#/next');
      vi.advanceTimersByTime(1_999);
      expect(shown).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(shown).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancellation and re-check at due time', () => {
    it('changing route while waiting cancels it', async () => {
      const { popups, shown } = await setup([popup('p-rating', [{ type: 'event', value: 'RATING', delaySeconds: 60 }])]);
      popups.triggerEvent('RATING');
      vi.advanceTimersByTime(10_000);
      navigateHash('#/other');
      vi.advanceTimersByTime(60_000);
      expect(shown).not.toHaveBeenCalled();
    });

    it('React Native: setScreen to another screen cancels it; the same screen does not', async () => {
      const { popups, shown, shownIds } = await setup([
        popup('p-a', [{ type: 'event', value: 'A', delaySeconds: 60 }]),
        popup('p-b', [{ type: 'event', value: 'B', delaySeconds: 60 }]),
      ]);
      popups.setScreen('Rating');
      popups.triggerEvent('A');
      popups.setScreen('Rating'); // same screen reported again (re-render): keeps waiting
      vi.advanceTimersByTime(60_000);
      expect(shownIds()).toEqual(['p-a']);

      popups.triggerEvent('B');
      vi.advanceTimersByTime(10_000);
      popups.setScreen('Home');
      vi.advanceTimersByTime(60_000);
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('app to background cancels it', async () => {
      const { popups, shown } = await setup([popup('p-rating', [{ type: 'event', value: 'RATING', delaySeconds: 60 }])]);
      popups.triggerEvent('RATING');
      popups.onBackground();
      popups.onForeground();
      vi.advanceTimersByTime(60_000);
      expect(shown).not.toHaveBeenCalled();
    });

    it('is dropped if the survey was completed while waiting (cooldown re-checked)', async () => {
      const { popups, shown } = await setup([
        popup('p-rating', [{ type: 'event', value: 'RATING', delaySeconds: 60 }], {
          cooldown: [{ answered: 'COMPLETED', cooldownDays: 30 }],
        }),
      ]);
      popups.triggerEvent('RATING');
      popups.markSurveyAnswered('survey-p-rating');
      vi.advanceTimersByTime(60_000);
      expect(shown).not.toHaveBeenCalled();
    });

    it('is dropped if the same popup was shown by another trigger while waiting', async () => {
      const { popups, shown } = await setup([
        popup('p-rating', [
          { type: 'event', value: 'RATING', delaySeconds: 60 },
          { type: 'event', value: 'NOW', delaySeconds: 0 },
        ]),
      ]);
      popups.triggerEvent('RATING');
      popups.triggerEvent('NOW');
      expect(shown).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(60_000);
      expect(shown).toHaveBeenCalledTimes(1);
    });

    it('is skipped without effects if another popup is open at due time', async () => {
      let open = false;
      const renderer: PopupRenderer = {
        init: () => undefined,
        show: () => undefined,
        hide: () => undefined,
        isShowing: () => open,
      } as unknown as PopupRenderer;
      const { popups, shown } = await setup([popup('p-rating', [{ type: 'event', value: 'RATING', delaySeconds: 60 }])], renderer);
      popups.triggerEvent('RATING');
      open = true;
      vi.advanceTimersByTime(60_000);
      expect(shown).not.toHaveBeenCalled();
    });

    it('a negative or invalid delaySeconds counts as 0 and does not drop the popup', async () => {
      const { popups, shown } = await setup([
        popup('p-neg', [{ type: 'event', value: 'NEG', delaySeconds: -5 }]),
        popup('p-bad', [{ type: 'event', value: 'BAD', delaySeconds: 'x' as unknown as number }]),
      ]);
      popups.triggerEvent('NEG');
      expect(shown).toHaveBeenCalledTimes(1);
      shown.mockClear();
      popups.triggerEvent('BAD');
      expect(shown).toHaveBeenCalledTimes(1);
    });
  });
});
