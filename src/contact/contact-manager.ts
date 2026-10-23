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
  /**
   * Envío real (inyectable para tests): hace el `POST /sdk/popups/contact`. Tiene que
   * RECHAZAR si la API no acepta el envío (sin red o respuesta no-2xx): solo así se sabe
   * que no hay que guardar la caché y que la llamada siguiente debe reintentar.
   */
  post: (body: ContactBody) => Promise<void>;
}

/**
 * Serialización estable (claves ordenadas) para el diff contra lo último enviado. Incluye el
 * `userId`: la clave de storage es una sola por dispositivo, y sin él un segundo usuario con
 * los mismos atributos que el anterior no llegaría a enviar los suyos.
 */
function stableSerialize(userId: string, attrs: ContactAttributes): string {
  const sorted: ContactAttributes = {};
  for (const key of Object.keys(attrs).sort()) {
    sorted[key] = attrs[key];
  }
  return JSON.stringify({ userId, attributes: sorted });
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
   * Envía los atributos si cambiaron respecto a lo último enviado. La caché solo se guarda
   * cuando la API acepta el envío; si falla, la llamada siguiente reintenta. Nunca rechaza.
   * @returns `true` si se envió, `false` si no hubo cambios o el envío falló.
   */
  async setAttributes(attributes: ContactAttributes): Promise<boolean> {
    const serialized = stableSerialize(this.userId, attributes);
    const last = this.storage.getItem(STORAGE_KEYS.contactAttributes);
    if (last === serialized) return false;

    try {
      await this.post({
        publicKey: this.publicKey,
        userId: this.userId,
        userAttributes: attributes,
      });
    } catch {
      return false;
    }
    this.storage.setItem(STORAGE_KEYS.contactAttributes, serialized);
    return true;
  }
}
