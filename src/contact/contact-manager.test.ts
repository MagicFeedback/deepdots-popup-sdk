import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ContactManager } from './contact-manager';
import type { ContactBody } from './contact-manager';
import { InMemoryStorage, STORAGE_KEYS } from '../tracking/tracking-manager';

/**
 * ContactManager: envía los atributos internos del usuario (que solo conoce el host)
 * al backend vía `POST /sdk/popups/contact`, identificados por el `userId` del init.
 * Solo envía cuando los atributos CAMBIAN respecto a lo último enviado (diff en storage).
 */
describe('ContactManager', () => {
  let storage: InMemoryStorage;
  let post: Mock<(body: ContactBody) => Promise<void>>;

  beforeEach(() => {
    storage = new InMemoryStorage();
    post = vi.fn<(body: ContactBody) => Promise<void>>(async () => {});
  });

  it('envía el contact en la primera llamada con publicKey + userId + userAttributes', async () => {
    const manager = new ContactManager({ storage, publicKey: 'pk', userId: 'user123', post });

    const sent = await manager.setAttributes({ language: 'es', age: 34 });

    expect(sent).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({
      publicKey: 'pk',
      userId: 'user123',
      userAttributes: { language: 'es', age: 34 },
    });
    // persiste lo enviado para el diff posterior
    expect(storage.getItem(STORAGE_KEYS.contactAttributes)).toBeTruthy();
  });

  it('NO reenvía si los atributos no cambian (mismo valor, distinto orden de claves)', async () => {
    const manager = new ContactManager({ storage, publicKey: 'pk', userId: 'user123', post });

    await manager.setAttributes({ language: 'es', age: 34 });
    const sent = await manager.setAttributes({ age: 34, language: 'es' });

    expect(sent).toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('reenvía cuando algún atributo cambia', async () => {
    const manager = new ContactManager({ storage, publicKey: 'pk', userId: 'user123', post });

    await manager.setAttributes({ language: 'es', age: 34 });
    const sent = await manager.setAttributes({ language: 'es', age: 35 });

    expect(sent).toBe(true);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('reusa lo persistido entre instancias: no reenvía tras reinicio si no cambió', async () => {
    const first = new ContactManager({ storage, publicKey: 'pk', userId: 'user123', post });
    await first.setAttributes({ plan: 'premium' });

    // "segundo arranque" con el mismo storage
    const second = new ContactManager({ storage, publicKey: 'pk', userId: 'user123', post });
    const sent = await second.setAttributes({ plan: 'premium' });

    expect(sent).toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
