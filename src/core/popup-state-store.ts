/**
 * Persistencia del estado que alimenta las reglas de redisplay (cooldown) de los popups.
 *
 * Hasta la 1.7.0 `lastShown`/`surveyProgress` vivían SOLO en memoria, así que cualquier
 * recarga de página reiniciaba el cooldown y el popup volvía a salir aunque su regla
 * dijese "no antes de N días". El SDK nativo (KMP) sí lo persistía (`getLastShown`/
 * `setLastShown` contra el `KeyValueStorage`); esto cierra esa divergencia en Web.
 *
 * ⚠️ El alcance es POR NAVEGADOR: otro dispositivo, otro perfil o un borrado de datos
 * vuelven a empezar. El cooldown por usuario de verdad exige que el backend filtre el
 * `GET /sdk/{publicKey}/popups` con el historial que ya recibe en `POST /sdk/popups`.
 */
import type { KeyValueStorage } from '../tracking/tracking-manager';
import { POPUP_TRIGGER_CONDITION_STATUSES } from '../types';
import type { PopupTriggerConditionStatus } from '../types';

/** Clave única en el namespace `deepdots.*` (mismo que `STORAGE_KEYS`). */
export const POPUP_STATE_STORAGE_KEY = 'deepdots.popups.state';

/**
 * Techo de entradas por mapa, con desalojo del más ANTIGUO (mismo trade-off explícito
 * que `MAX_TRACKED_MESSAGES` en `MessageGuard`). Una cuenta real tiene unos pocos popups;
 * el techo solo evita que el registro crezca sin límite si se rotan definiciones.
 * No se poda por antigüedad a propósito: un `cooldownDays` largo debe seguir valiendo.
 */
export const MAX_TRACKED_POPUP_ENTRIES = 200;

export interface PersistedProgressEntry {
  status: PopupTriggerConditionStatus;
  timestamp: number;
}

export interface PersistedPopupState {
  /** popupId → timestamp de la última vez que se mostró. */
  lastShown: Record<string, number>;
  /** surveyId → último estado conocido (PARTIAL/COMPLETED) y cuándo. */
  progress: Record<string, PersistedProgressEntry>;
}

function emptyState(): PersistedPopupState {
  return { lastShown: {}, progress: {} };
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Se queda con las `MAX_TRACKED_POPUP_ENTRIES` entradas de timestamp más reciente. */
function capEntries<T>(entries: Array<[string, T]>, timestampOf: (value: T) => number): Array<[string, T]> {
  if (entries.length <= MAX_TRACKED_POPUP_ENTRIES) return entries;
  return [...entries]
    .sort((a, b) => timestampOf(b[1]) - timestampOf(a[1]))
    .slice(0, MAX_TRACKED_POPUP_ENTRIES);
}

/**
 * Lee el estado persistido. Tolerante a todo: sin clave, JSON corrupto, entradas con
 * forma inválida o un storage que lanza (Safari en privado, cookies bloqueadas) →
 * estado vacío o entradas buenas, nunca una excepción.
 */
export function readPopupState(storage: KeyValueStorage): PersistedPopupState {
  let raw: string | null = null;
  try {
    raw = storage.getItem(POPUP_STATE_STORAGE_KEY);
  } catch {
    return emptyState();
  }
  if (!raw) return emptyState();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyState();
  }
  if (typeof parsed !== 'object' || parsed === null) return emptyState();

  const source = parsed as Partial<Record<keyof PersistedPopupState, unknown>>;
  const state = emptyState();

  if (typeof source.lastShown === 'object' && source.lastShown !== null) {
    const valid = Object.entries(source.lastShown as Record<string, unknown>)
      .filter((entry): entry is [string, number] => isValidTimestamp(entry[1]));
    capEntries(valid, (timestamp) => timestamp).forEach(([popupId, timestamp]) => {
      state.lastShown[popupId] = timestamp;
    });
  }

  if (typeof source.progress === 'object' && source.progress !== null) {
    const valid = Object.entries(source.progress as Record<string, unknown>)
      .filter((entry): entry is [string, PersistedProgressEntry] => {
        const value = entry[1];
        if (typeof value !== 'object' || value === null) return false;
        const candidate = value as Partial<PersistedProgressEntry>;
        return (
          POPUP_TRIGGER_CONDITION_STATUSES.includes(candidate.status as PopupTriggerConditionStatus)
          && isValidTimestamp(candidate.timestamp)
        );
      });
    capEntries(valid, (entry) => entry.timestamp).forEach(([surveyId, entry]) => {
      state.progress[surveyId] = { status: entry.status, timestamp: entry.timestamp };
    });
  }

  return state;
}

/** Escribe el estado (acotado). Un storage que lanza se ignora en silencio. */
export function writePopupState(storage: KeyValueStorage, state: PersistedPopupState): void {
  const capped: PersistedPopupState = emptyState();
  capEntries(Object.entries(state.lastShown), (timestamp) => timestamp).forEach(([popupId, timestamp]) => {
    capped.lastShown[popupId] = timestamp;
  });
  capEntries(Object.entries(state.progress), (entry) => entry.timestamp).forEach(([surveyId, entry]) => {
    capped.progress[surveyId] = entry;
  });

  try {
    storage.setItem(POPUP_STATE_STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // Storage lleno o bloqueado por el navegador: el cooldown degrada a solo-memoria.
  }
}

/** Borra el registro (cambio de usuario: el historial era del anterior). */
export function clearPopupState(storage: KeyValueStorage): void {
  try {
    storage.removeItem(POPUP_STATE_STORAGE_KEY);
  } catch {
    // idem
  }
}
