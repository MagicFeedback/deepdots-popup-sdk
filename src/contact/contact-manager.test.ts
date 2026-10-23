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

  it('si el envío falla NO guarda la caché: la llamada siguiente reintenta', async () => {
    post.mockRejectedValueOnce(new Error('HTTP 503'));
    const manager = new ContactManager({ storage, publicKey: 'pk', userId: 'user123', post });

    const first = await manager.setAttributes({ plan: 'premium' });
    expect(first).toBe(false);
    expect(storage.getItem(STORAGE_KEYS.contactAttributes)).toBeNull();

    const second = await manager.setAttributes({ plan: 'premium' });
    expect(second).toBe(true);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('un fallo no propaga: setAttributes resuelve a false en vez de rechazar', async () => {
    post.mockRejectedValueOnce(new Error('network'));
    const manager = new ContactManager({ storage, publicKey: 'pk', userId: 'user123', post });

    await expect(manager.setAttributes({ plan: 'premium' })).resolves.toBe(false);
  });

  it('la caché es por usuario: otro userId con los mismos atributos SÍ envía', async () => {
    const a = new ContactManager({ storage, publicKey: 'pk', userId: 'user-a', post });
    await a.setAttributes({ customer_number: '12345' });

    // mismo dispositivo (mismo storage), otro usuario
    const b = new ContactManager({ storage, publicKey: 'pk', userId: 'user-b', post });
    const sent = await b.setAttributes({ customer_number: '12345' });

    expect(sent).toBe(true);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith({ publicKey: 'pk', userId: 'user-b', userAttributes: { customer_number: '12345' } });
  });
});
