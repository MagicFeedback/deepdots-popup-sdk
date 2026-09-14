/**
 * Precalentado del chunk de `renderPopup`.
 *
 * `renderPopup` se carga por dynamic import para que importar el SDK sea seguro en React Native
 * y en SSR, pero eso deja su descarga (DOM del popup + `@magicfeedback/native` + el CSS
 * vendorizado, ~238 KB sin comprimir) dentro del camino crítico: empieza cuando el trigger ya ha
 * disparado y el usuario está mirando. Traerlo en idle en cuanto se sabe que hay algún popup que
 * puede abrirse deja el import de `show()` resuelto al instante.
 *
 * Es oportunista por diseño: si falla, no rompe nada porque `show()` hace su propio import.
 */

type Loader = () => Promise<unknown>;

const defaultLoader: Loader = () => import('./renderPopup');

/** Precalentado en curso o ya resuelto. Null tras un fallo, para permitir reintento. */
let pending: Promise<void> | null = null;

/**
 * Descarga el chunk una sola vez por sesión. Nunca rechaza: un precalentado que falla es un
 * no-evento, la carga de verdad la hará `show()`.
 */
export function preloadRenderPopup(loader: Loader = defaultLoader): Promise<void> {
    if (pending) return pending;
    try {
        // El loader se invoca ya, no en un microtask: el import debe empezar en este tick.
        pending = loader().then(() => undefined).catch(() => { pending = null; });
    } catch {
        pending = null;
        return Promise.resolve();
    }
    return pending;
}

/**
 * Agenda el precalentado para cuando el navegador esté ocioso, para no competir con el render
 * de la página del host. `requestIdleCallback` no existe en Safari, ahí basta con salir del
 * tick actual.
 */
export function schedulePreloadRenderPopup(loader?: Loader): void {
    const run = () => { void preloadRenderPopup(loader); };
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => unknown }).requestIdleCallback;
    if (typeof idle === 'function') {
        idle(run, { timeout: 2000 });
        return;
    }
    setTimeout(run, 0);
}
