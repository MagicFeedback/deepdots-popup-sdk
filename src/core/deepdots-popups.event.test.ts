import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import type { PopupDefinition } from '../types';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('DeepdotsPopups event trigger', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    window.location.hash = '#/home';
  });

  it('shows matching event popup when current route matches segments.path', () => {
    const popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());

    const defs: PopupDefinition[] = [
      {
        id: 'popup-search-event',
        title: 'Search event',
        message: '',
        triggers: { type: 'event', value: 'search', condition: [] },
        surveyId: 'survey-search',
        productId: 'product-1',
        segments: { path: ['/#/home'] },
      },
    ];

    const listener = vi.fn();
    popups.on('popup_shown', listener);
    popups.init({ mode: 'client', popups: defs });
    popups.autoLaunch();

    popups.triggerEvent('search');

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'popup_shown',
        surveyId: 'survey-search',
        data: expect.objectContaining({ popupId: 'popup-search-event' }),
      }),
    );
  });

  it('does not show event popup when route does not match segments.path', () => {
    const popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());

    const defs: PopupDefinition[] = [
      {
        id: 'popup-search-event',
        title: 'Search event',
        message: '',
        triggers: { type: 'event', value: 'search', condition: [] },
        surveyId: 'survey-search',
        productId: 'product-1',
        segments: { path: ['/#/game'] },
      },
    ];

    const listener = vi.fn();
    popups.on('popup_shown', listener);
    popups.init({ mode: 'client', popups: defs });
    popups.autoLaunch();

    popups.triggerEvent('search');

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('DeepdotsPopups trigger disambiguation by popupId', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    window.location.hash = '#/game';
  });

  it('queues and shows the popup tied to popupId even when surveyId is shared', async () => {
    const popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());

    const defs: PopupDefinition[] = [
      {
        id: 'popup-login-exit',
        title: 'Exit login',
        message: '',
        triggers: { type: 'exit', value: 0, condition: [] },
        surveyId: 'shared-survey',
        productId: 'product-1',
        segments: { path: ['/#/login'] },
      },
      {
        id: 'popup-game-exit',
        title: 'Exit game',
        message: '',
        triggers: { type: 'exit', value: 0, condition: [] },
        surveyId: 'shared-survey',
        productId: 'product-1',
        segments: { path: ['/#/game'] },
      },
    ];

    const listener = vi.fn();
    popups.on('popup_shown', listener);
    popups.init({ mode: 'client', popups: defs });
    popups.autoLaunch();

    popups.queueExitPopup('shared-survey', 0, 'http://localhost:3000/#/game', 'popup-game-exit');
    window.location.hash = '#/home';
    await wait(20);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        surveyId: 'shared-survey',
        data: expect.objectContaining({ popupId: 'popup-game-exit' }),
      }),
    );
  });
});
