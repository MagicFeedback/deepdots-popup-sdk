import type { KeyValueStorage } from '../tracking/tracking-manager';
import { STORAGE_KEYS } from '../tracking/tracking-manager';

/** Valor de un atributo de contact (info interna del usuario que solo conoce el host). */
export type ContactAttributeValue = string | number | boolean;
export type ContactAttributes = Record<string, ContactAttributeValue>;

/** Body de `POST /sdk/popups/contact`. */
export interface ContactBody {
  publicKey: string;
  userId: string;
  userAttributes: ContactAttributes;
}

export interface ContactManagerOptions {
  storage: KeyValueStorage;
  publicKey: string;
  userId: string;
  /** Envío real (inyectable para tests): hace el `POST /sdk/popups/contact`. */
  post: (body: ContactBody) => Promise<void>;
}

/** Serialización estable (claves ordenadas) para el diff contra lo último enviado. */
function stableSerialize(attrs: ContactAttributes): string {
  const sorted: ContactAttributes = {};
  for (const key of Object.keys(attrs).sort()) {
    sorted[key] = attrs[key];
  }
  return JSON.stringify(sorted);
}

/**
 * Gestiona los atributos de contact del usuario identificado (`userId` del init).
 * Solo envía cuando cambian respecto a lo último persistido en storage, para ahorrar
 * peticiones (el host puede llamar `setAttributes` en cada identificación sin miedo).
 */
export class ContactManager {
  private readonly storage: KeyValueStorage;
  private readonly publicKey: string;
  private readonly userId: string;
  private readonly post: (body: ContactBody) => Promise<void>;

  constructor(options: ContactManagerOptions) {
    this.storage = options.storage;
    this.publicKey = options.publicKey;
    this.userId = options.userId;
    this.post = options.post;
  }

  /**
   * Envía los atributos si cambiaron respecto a lo último enviado.
   * @returns `true` si se envió, `false` si no hubo cambios.
   */
  async setAttributes(attributes: ContactAttributes): Promise<boolean> {
    const serialized = stableSerialize(attributes);
    const last = this.storage.getItem(STORAGE_KEYS.contactAttributes);
    if (last === serialized) return false;

    await this.post({
      publicKey: this.publicKey,
      userId: this.userId,
      userAttributes: attributes,
    });
    this.storage.setItem(STORAGE_KEYS.contactAttributes, serialized);
    return true;
  }
}
