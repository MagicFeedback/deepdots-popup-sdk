/**
 * Sesión de analytics suspendida por un `pagehide` (web).
 *
 * El navegador lanza `pagehide` igual al recargar (Cmd+R / F5) o navegar con carga completa
 * que al cerrar la pestaña, y la página no puede distinguirlo. Cerrar la sesión ahí partía
 * cada recarga en dos registros (dos feedbacks, dos mensajes en Slack). Ahora el `pagehide`
 * SUSPENDE la sesión: manda lo pendiente sin `completed` y deja aquí su `sessionId`.
 *
 *  - Recarga / navegación en la misma pestaña: `init()` lo encuentra y SIGUE en ese registro.
 *  - Cierre de la pestaña: `sessionStorage` muere con ella. El backend (Run_Jobs
 *    `incomplete-surveys`) cierra la sesión cuando su último lote es un
 *    `deepdots_session_suspend` y pasan unos minutos sin otro (`SUSPEND_GRACE_MINUTES`).
 *
 * `sessionStorage` y no `localStorage`: es por pestaña y sobrevive a la recarga, así que
 * otra pestaña nunca hereda la sesión de esta. Todo es tolerante a fallos (storage bloqueado,
 * JSON corrupto): ante cualquier error no hay sesión que reanudar y se abre una nueva.
 */

import type { KeyValueStorage } from '../tracking/tracking-manager';

export const SUSPENDED_SESSION_KEY = 'deepdots.analytics.suspended';

export interface SuspendedSession {
  /** Registro de analytics (`sessionId` de POST /sdk/feedback) que queda abierto. */
  sessionId: string;
  /** Integración de analytics: otra integración en el mismo origen no la hereda. */
  integration: string;
  /** `deepdots_user_id`: un cambio de usuario entre cargas no la hereda. */
  userId: string | null;
  /** Cuándo se suspendió (ms epoch). */
  at: number;
}

/** `window.sessionStorage` si existe y es accesible; null en RN, SSR o con storage bloqueado. */
export function getSessionStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Guarda la sesión suspendida. `false` si no se pudo: entonces hay que cerrarla como antes. */
export function writeSuspendedSession(storage: KeyValueStorage, session: SuspendedSession): boolean {
  try {
    storage.setItem(SUSPENDED_SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

/** Borra la sesión suspendida. Tolerante a fallos. */
export function clearSuspendedSession(storage: KeyValueStorage): void {
  try {
    storage.removeItem(SUSPENDED_SESSION_KEY);
  } catch {
    /* storage no disponible: se ignora */
  }
}

/**
 * Lee y CONSUME la sesión suspendida: el `sessionId` si es de la misma integración y usuario
 * y se suspendió hace como mucho `windowMs`; null en otro caso. La entrada se borra siempre,
 * para que una carga posterior no reanude una sesión que ya no le toca.
 */
export function takeSuspendedSession(
  storage: KeyValueStorage,
  match: { integration: string; userId: string | null },
  now: number,
  windowMs: number,
): SuspendedSession | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(SUSPENDED_SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  clearSuspendedSession(storage);
  try {
    const s = JSON.parse(raw) as Partial<SuspendedSession>;
    if (typeof s.sessionId !== 'string' || !s.sessionId) return null;
    if (typeof s.at !== 'number' || now - s.at < 0 || now - s.at > windowMs) return null;
    if (s.integration !== match.integration) return null;
    if ((s.userId ?? null) !== match.userId) return null;
    return { sessionId: s.sessionId, integration: s.integration, userId: s.userId ?? null, at: s.at };
  } catch {
    return null;
  }
}
