/**
 * Identidad + sesión para el tracking de navegación (Fase 1).
 * Implementa el "Contrato común Web+KMP".
 *
 * Modelo: el SDK gestiona el `user_id` (persistente). El `session_id` es propiedad
 * del BACKEND: llega en la respuesta de `POST /sdk/popups` y se cachea; el backend
 * cose sesiones por `user_id` + ventana. El SDK NO genera ni expira sesiones.
 *
 * Sin dependencias de DOM: recibe el storage y (opcionalmente) el reloj y el
 * generador de uuid por inyección. El binding a `localStorage` vive en `createDefaultStorage`.
 */

/** Store clave/valor mínimo (espejo conceptual del `KeyValueStorage` de KMP). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Impl en memoria — usada en tests y como fallback sin `localStorage`. */
export class InMemoryStorage implements KeyValueStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** Storage por defecto en Web: `localStorage` si está disponible, si no in-memory. */
export function createDefaultStorage(): KeyValueStorage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const ls = window.localStorage;
      const probe = '__deepdots_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return {
        getItem: (k) => ls.getItem(k),
        setItem: (k, v) => ls.setItem(k, v),
        removeItem: (k) => ls.removeItem(k),
      };
    }
  } catch {
    // cae a in-memory
  }
  return new InMemoryStorage();
}

/** Claves de storage — namespace `deepdots.*`. Solo identidad (la sesión no se persiste). */
export const STORAGE_KEYS = {
  userId: 'deepdots.user_id',
  firstSeen: 'deepdots.user.first_seen',
} as const;

/** Par clave/valor con el formato `NativeAnswer` que espera `@magicfeedback/native`. */
export interface IdentityAnswer {
  key: string;
  value: string[];
}

/**
 * Construye el `profile` y el `metadata` de identidad para inyectar en el survey
 * (`magicfeedback.form(appId, publicKey, profile, metadata)`), según el contrato §5.
 * `session_id` solo se incluye si el backend ya lo proveyó.
 */
export function buildSurveyIdentity(
  userId: string | null,
  sessionId: string | null,
  miniService: string | null = null,
): { profile: IdentityAnswer[]; metadata: IdentityAnswer[] } {
  const profile: IdentityAnswer[] = userId ? [{ key: 'external-user-id', value: [userId] }] : [];
  const metadata: IdentityAnswer[] = [];
  if (sessionId) metadata.push({ key: 'session_id', value: [sessionId] });
  if (userId) metadata.push({ key: 'user_id', value: [userId] });
  if (miniService) metadata.push({ key: 'mini_service', value: [miniService] });
  return { profile, metadata };
}

export interface TrackingManagerOptions {
  storage: KeyValueStorage;
  /** Id provisto por el cliente; si existe se usa y NO se persiste. */
  clientUserId?: string;
  /** Reloj inyectable (default `Date.now`). */
  now?: () => number;
  /** Generador de uuid inyectable (default uuid v4). */
  uuid?: () => string;
  /** Estado inicial del tracking (default `true`). */
  enabled?: boolean;
}

function defaultUuid(): string {
  const g = (typeof globalThis !== 'undefined' ? globalThis : {}) as {
    crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array };
  };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

export class TrackingManager {
  private storage: KeyValueStorage;
  private clientUserId?: string;
  private now: () => number;
  private uuid: () => string;
  private enabled: boolean;

  /** session_id cacheado, provisto por el backend (no se genera ni se persiste). */
  private sessionId: string | null = null;
  private userWasJustCreated = false;

  constructor(options: TrackingManagerOptions) {
    this.storage = options.storage;
    this.clientUserId = options.clientUserId;
    this.now = options.now ?? (() => Date.now());
    this.uuid = options.uuid ?? defaultUuid;
    this.enabled = options.enabled ?? true;
  }

  isTrackingEnabled(): boolean {
    return this.enabled;
  }

  setTrackingEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Resuelve el user_id según la regla: cliente > persistido > generar+persistir. */
  getUserId(): string | null {
    if (!this.enabled) return null;
    if (this.clientUserId) return this.clientUserId;

    const persisted = this.storage.getItem(STORAGE_KEYS.userId);
    if (persisted) return persisted;

    const id = this.uuid();
    this.storage.setItem(STORAGE_KEYS.userId, id);
    this.storage.setItem(STORAGE_KEYS.firstSeen, String(this.now()));
    this.userWasJustCreated = true;
    return id;
  }

  /** `true` solo en la primera sesión tras crear el user_id propio del SDK. */
  isNewUser(): boolean {
    return this.userWasJustCreated;
  }

  /** session_id actual provisto por el backend, o null si aún no llegó. */
  getSessionId(): string | null {
    if (!this.enabled) return null;
    return this.sessionId;
  }

  /** Cachea el session_id devuelto por el backend (respuesta de POST /sdk/popups). */
  setSessionId(sessionId: string | null): void {
    if (!this.enabled) return;
    this.sessionId = sessionId;
  }
}
