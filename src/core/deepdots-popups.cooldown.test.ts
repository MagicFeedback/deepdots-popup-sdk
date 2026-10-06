import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { InMemoryStorage } from '../tracking/tracking-manager';
import { mockPopupsApi, flushPopupsLoad } from './test-helpers';
import { POPUP_STATE_STORAGE_KEY } from './popup-state-store';
import type { PopupDefinition } from '../types';
import type { KeyValueStorage } from '../tracking/tracking-manager';

const DAY = 24 * 60 * 60 * 1000;
const POPUP_ID = 'a1479ea0-97bb-11f1-bb6a-8573ba5fc256';
const SURVEY_ID = '34236750-97bb-11f1-99c4-6b8588937fc8';
const EVENT = 'file-review-opened';

/**
 * Definición REAL servida por la API para el popup de evento de un cliente
 * (`GET /sdk/{publicKey}/popups`): redisplay de 7 días en los tres estados.
 */
const defs: PopupDefinition[] = [
  {
    id: POPUP_ID,
    title: '',
    message: '',
    triggers: [{ type: 'event', value: EVENT, delaySeconds: 0 }],
    cooldown: [
      { answered: 'SHOWED', cooldownDays: 7 },
      { answered: 'PARTIAL', cooldownDays: 7 },
      { answered: 'COMPLETED', cooldownDays: 7 },
    ],
    conditions: [],
    actions: {},
    style: { theme: 'light', position: 'center', imageUrl: null },
    segments: { lang: ['en'], path: ['/'] },
    surveyId: SURVEY_ID,
    productId: '80be8cfcbb933eeed486bfbda3b238d2',
  } as unknown as PopupDefinition,
];

/** Arranca una instancia nueva del SDK sobre el storage dado (= recarga de página). */
async function boot(storage: KeyValueStorage, userId?: string) {
  const popups = new DeepdotsPopups();
  popups.setRenderer(new NoopPopupRenderer());
  const shown = vi.fn();
  popups.on('popup_shown', shown);
  mockPopupsApi(defs);
  popups.init({ apiKey: 'test-key', language: 'en', storage, userId });
  await flushPopupsLoad();
  popups.autoLaunch();
  return { popups, shown };
}

describe('DeepdotsPopups · persistencia del cooldown', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    window.location.hash = '';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('bloquea el segundo disparo dentro de la misma sesión', async () => {
    const { popups, shown } = await boot(new InMemoryStorage());

    popups.triggerEvent(EVENT);
    popups.triggerEvent(EVENT);

    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('sigue bloqueado tras recargar la página (cooldown SHOWED)', async () => {
    const storage = new InMemoryStorage();

    const first = await boot(storage);
    first.popups.triggerEvent(EVENT);
    expect(first.shown).toHaveBeenCalledTimes(1);

    const afterReload = await boot(storage);
    afterReload.popups.triggerEvent(EVENT);
    expect(afterReload.shown).not.toHaveBeenCalled();
  });

  it('sigue bloqueado tras completar el survey y recargar (cooldown COMPLETED)', async () => {
    const storage = new InMemoryStorage();

    const first = await boot(storage);
    first.popups.triggerEvent(EVENT);
    first.popups.markSurveyAnswered(SURVEY_ID);

    const afterReload = await boot(storage);
    afterReload.popups.triggerEvent(EVENT);
    expect(afterReload.shown).not.toHaveBeenCalled();
  });

  it('vuelve a mostrarse cuando el cooldown ya venció', async () => {
    const storage = new InMemoryStorage();
    storage.setItem(
      POPUP_STATE_STORAGE_KEY,
      JSON.stringify({ lastShown: { [POPUP_ID]: Date.now() - 8 * DAY }, progress: {} }),
    );

    const { popups, shown } = await boot(storage);
    popups.triggerEvent(EVENT);

    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('un cambio de usuario limpia el historial del anterior', async () => {
    const storage = new InMemoryStorage();

    const { popups, shown } = await boot(storage, 'user-a');
    popups.triggerEvent(EVENT);
    expect(shown).toHaveBeenCalledTimes(1);

    popups.setUserId('user-b');
    popups.triggerEvent(EVENT);
    expect(shown).toHaveBeenCalledTimes(2);
  });

  /**
   * Dos pestañas comparten `localStorage` pero cada instancia leía el historial SOLO en su
   * `init()`: la que ya estaba abierta no se enteraba de lo que hacía la otra.
   */
  it('una pestaña no vuelve a enseñar un popup que otra ya enseñó', async () => {
    const storage = new InMemoryStorage();
    const tabA = await boot(storage);
    const tabB = await boot(storage); // abierta antes de que A enseñe nada

    tabA.popups.triggerEvent(EVENT);
    tabB.popups.triggerEvent(EVENT);

    expect(tabA.shown).toHaveBeenCalledTimes(1);
    expect(tabB.shown).not.toHaveBeenCalled();
  });

  /**
   * Además cada pestaña reescribía el registro ENTERO con su foto en memoria, así que la que
   * guardaba después borraba lo de la otra: un survey contestado dejaba de constar y volvía
   * a salir tras recargar.
   */
  it('una pestaña no borra lo que guardó la otra', async () => {
    const storage = new InMemoryStorage();
    const tabA = await boot(storage);
    const tabB = await boot(storage);

    tabA.popups.triggerEvent(EVENT);
    tabA.popups.markSurveyAnswered(SURVEY_ID);
    tabB.popups.markSurveyAnswered('otro-survey'); // B guarda con su foto vieja

    const persisted = JSON.parse(storage.getItem(POPUP_STATE_STORAGE_KEY) as string);
    expect(persisted.lastShown[POPUP_ID]).toBeDefined();
    expect(persisted.progress[SURVEY_ID]?.status).toBe('COMPLETED');
    expect(persisted.progress['otro-survey']?.status).toBe('COMPLETED');
  });

  it('degrada a solo-memoria si el storage no llega a persistir', async () => {
    // Cuota llena / navegador que traga las escrituras: lo escrito nunca se vuelve a leer.
    // El cooldown debe seguir valiendo DENTRO de la sesión, aunque no sobreviva a la recarga.
    const dropped: KeyValueStorage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    const { popups, shown } = await boot(dropped);
    popups.triggerEvent(EVENT);
    popups.triggerEvent(EVENT);

    expect(shown).toHaveBeenCalledTimes(1);
  });
});
