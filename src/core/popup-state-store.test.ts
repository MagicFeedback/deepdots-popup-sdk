import { describe, expect, it } from 'vitest';
import { InMemoryStorage } from '../tracking/tracking-manager';
import {
  MAX_TRACKED_POPUP_ENTRIES,
  POPUP_STATE_STORAGE_KEY,
  clearPopupState,
  readPopupState,
  writePopupState,
} from './popup-state-store';

describe('popup-state-store', () => {
  it('round-trip: lo escrito se lee igual', () => {
    const storage = new InMemoryStorage();
    writePopupState(storage, {
      lastShown: { 'popup-a': 1000 },
      progress: { 'survey-a': { status: 'COMPLETED', timestamp: 2000 } },
    });

    expect(readPopupState(storage)).toEqual({
      lastShown: { 'popup-a': 1000 },
      progress: { 'survey-a': { status: 'COMPLETED', timestamp: 2000 } },
    });
  });

  it('storage vacío devuelve estado vacío', () => {
    expect(readPopupState(new InMemoryStorage())).toEqual({ lastShown: {}, progress: {} });
  });

  it('JSON corrupto no revienta: devuelve estado vacío', () => {
    const storage = new InMemoryStorage();
    storage.setItem(POPUP_STATE_STORAGE_KEY, '{no es json');
    expect(readPopupState(storage)).toEqual({ lastShown: {}, progress: {} });
  });

  it('descarta entradas con forma inválida y conserva las buenas', () => {
    const storage = new InMemoryStorage();
    storage.setItem(
      POPUP_STATE_STORAGE_KEY,
      JSON.stringify({
        lastShown: { ok: 1000, malo: 'ayer', nulo: null, infinito: Infinity },
        progress: {
          ok: { status: 'PARTIAL', timestamp: 2000 },
          estadoRaro: { status: 'NOPE', timestamp: 2000 },
          sinTimestamp: { status: 'COMPLETED' },
        },
      }),
    );

    expect(readPopupState(storage)).toEqual({
      lastShown: { ok: 1000 },
      progress: { ok: { status: 'PARTIAL', timestamp: 2000 } },
    });
  });

  it('un storage que lanza al leer/escribir no rompe al SDK', () => {
    const broken = {
      getItem: () => { throw new Error('bloqueado'); },
      setItem: () => { throw new Error('bloqueado'); },
      removeItem: () => { throw new Error('bloqueado'); },
    };
    expect(readPopupState(broken)).toEqual({ lastShown: {}, progress: {} });
    expect(() => writePopupState(broken, { lastShown: { a: 1 }, progress: {} })).not.toThrow();
    expect(() => clearPopupState(broken)).not.toThrow();
  });

  it('acota el número de entradas quedándose con las más recientes', () => {
    const storage = new InMemoryStorage();
    const lastShown: Record<string, number> = {};
    for (let i = 0; i < MAX_TRACKED_POPUP_ENTRIES + 50; i += 1) {
      lastShown[`popup-${i}`] = i; // timestamp creciente → los primeros son los más viejos
    }
    writePopupState(storage, { lastShown, progress: {} });

    const read = readPopupState(storage);
    const keys = Object.keys(read.lastShown);
    expect(keys).toHaveLength(MAX_TRACKED_POPUP_ENTRIES);
    expect(read.lastShown['popup-0']).toBeUndefined();
    expect(read.lastShown[`popup-${MAX_TRACKED_POPUP_ENTRIES + 49}`]).toBe(MAX_TRACKED_POPUP_ENTRIES + 49);
  });

  it('clearPopupState borra la clave', () => {
    const storage = new InMemoryStorage();
    writePopupState(storage, { lastShown: { a: 1 }, progress: {} });
    clearPopupState(storage);
    expect(storage.getItem(POPUP_STATE_STORAGE_KEY)).toBeNull();
  });
});
