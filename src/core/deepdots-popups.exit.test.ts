import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import type { PopupDefinition } from '../types';

function createExitDefinition(seconds: number): PopupDefinition {
  return {
    id: 'popup-exit-login',
    title: 'Exit popup',
    message: 'Exit flow',
    triggers: {
      type: 'exit',
      value: seconds,
      condition: [],
    },
    surveyId: 'survey-exit-login',
    productId: 'product-1',
    segments: {
      path: ['/#/login'],
    },
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function navigateHash(hash: string): void {
  const oldURL = window.location.href;
  window.location.hash = hash;
  const newURL = window.location.href;
  window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL }));
}

describe('DeepdotsPopups exit trigger', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    window.location.hash = '#/login';
  });

  it('shows the popup after leaving the configured route', async () => {
    const popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
    popups.init({
      mode: 'client',
      popups: [createExitDefinition(0)],
    });

    const shown = vi.fn();
    popups.on('popup_shown', shown);
    popups.autoLaunch();

    navigateHash('#/home');
    await wait(15);

    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('applies the configured delay in seconds before showing on destination route', async () => {
    const popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
    popups.init({
      mode: 'client',
      popups: [createExitDefinition(0.05)],
    });

    const shown = vi.fn();
    popups.on('popup_shown', shown);
    popups.autoLaunch();

    navigateHash('#/home');
    await wait(20);
    expect(shown).not.toHaveBeenCalled();

    await wait(45);
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('does not show when leaving from a non-matching source route', async () => {
    window.location.hash = '#/home';

    const popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
    popups.init({
      mode: 'client',
      popups: [createExitDefinition(0)],
    });

    const shown = vi.fn();
    popups.on('popup_shown', shown);
    popups.autoLaunch();

    navigateHash('#/game');
    await wait(15);

    expect(shown).not.toHaveBeenCalled();
  });
});
