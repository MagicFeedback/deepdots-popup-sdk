import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { mockPopupsApi, flushPopupsLoad } from './test-helpers';
import type { PopupDefinition } from '../types';

/**
 * Segmentación por idioma de los popups (`segments.lang`).
 *
 * Regresión reportada por un cliente en React Native (SDK 1.1.7):
 * `matchesSegmentsLang` leía `navigator.language` directamente en vez de usar el
 * `resolveLanguage()` que el SDK ya emplea para el context de analytics. En RN
 * `navigator` EXISTE (`product: 'ReactNative'`) pero NO tiene `language`, así que
 * `navigator.language.toLowerCase()` lanzaba
 * `TypeError: Cannot read property 'toLowerCase' of undefined` al disparar un popup
 * con segmentación de idioma — abortando la evaluación COMPLETA del evento.
 */
function langPopup(langs: unknown[]): PopupDefinition[] {
  return [
    {
      id: 'popup-rating',
      title: 'Rating',
      message: '',
      triggers: [{ type: 'event', value: 'RATING' }],
      surveyId: 'survey-rating',
      productId: 'product-1',
      segments: { lang: langs as string[] },
    },
  ];
}

async function bootWithLangPopup(
  popups: DeepdotsPopups,
  langs: unknown[],
  init: Parameters<DeepdotsPopups['init']>[0] = { apiKey: 'k' },
): Promise<ReturnType<typeof vi.fn>> {
  const listener = vi.fn();
  popups.on('popup_shown', listener);
  mockPopupsApi(langPopup(langs));
  popups.init(init);
  await flushPopupsLoad();
  popups.autoLaunch();
  return listener;
}

describe('DeepdotsPopups — segmentación por idioma', () => {
  let popups: DeepdotsPopups;

  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('no lanza cuando navigator existe pero no tiene language (React Native)', async () => {
    // RN: navigator definido, sin `language`. El SDK debe caer al locale de Intl (Hermes).
    vi.stubGlobal('navigator', { product: 'ReactNative' });

    const listener = await bootWithLangPopup(popups, ['EN']);

    expect(() => popups.triggerEvent('RATING')).not.toThrow();
    // Intl resuelve 'en-US' en el entorno de test → matchea el segmento 'EN'
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ surveyId: 'survey-rating' }),
    );
  });

  it('no lanza ni filtra cuando no hay NINGUNA fuente de idioma (ni navigator ni Intl)', async () => {
    vi.stubGlobal('navigator', { product: 'ReactNative' });
    vi.stubGlobal('Intl', undefined);

    const listener = await bootWithLangPopup(popups, ['DA']);

    expect(() => popups.triggerEvent('RATING')).not.toThrow();
    // Sin idioma conocido no se puede segmentar → se muestra
    expect(listener).toHaveBeenCalled();
  });

  it('ignora entradas no-string dentro de segments.lang sin lanzar', async () => {
    const listener = await bootWithLangPopup(popups, [null, 'en']);

    expect(() => popups.triggerEvent('RATING')).not.toThrow();
    expect(listener).toHaveBeenCalled();
  });

  it('usa el idioma declarado en init({ language }) para segmentar', async () => {
    vi.stubGlobal('navigator', { product: 'ReactNative' });

    const listener = await bootWithLangPopup(popups, ['EN'], { apiKey: 'k', language: 'en-US' });

    popups.triggerEvent('RATING');
    expect(listener).toHaveBeenCalled();
  });

  it('no muestra el popup cuando el idioma declarado no coincide con segments.lang', async () => {
    vi.stubGlobal('navigator', { product: 'ReactNative' });

    const listener = await bootWithLangPopup(popups, ['EN'], { apiKey: 'k', language: 'da-DK' });

    popups.triggerEvent('RATING');
    expect(listener).not.toHaveBeenCalled();
  });

  it('init({ language }) tiene prioridad sobre navigator.language', async () => {
    vi.stubGlobal('navigator', { language: 'da-DK' });

    const listener = await bootWithLangPopup(popups, ['EN'], { apiKey: 'k', language: 'en-GB' });

    popups.triggerEvent('RATING');
    expect(listener).toHaveBeenCalled();
  });

  it('sigue segmentando por navigator.language en web (sin language explícito)', async () => {
    vi.stubGlobal('navigator', { language: 'da-DK' });

    const listener = await bootWithLangPopup(popups, ['EN']);

    popups.triggerEvent('RATING');
    expect(listener).not.toHaveBeenCalled();
  });

  it('la segmentación usa el MISMO idioma que reporta el context de analytics', async () => {
    vi.stubGlobal('navigator', { product: 'ReactNative' });
    const listener = await bootWithLangPopup(popups, ['EN'], { apiKey: 'k', language: 'en-AU' });

    popups.triggerEvent('RATING');

    expect(popups.previewAnalytics().context.language).toBe('en-AU');
    expect(listener).toHaveBeenCalled();
  });
});
