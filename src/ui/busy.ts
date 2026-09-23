/**
 * Bloqueo del survey mientras carga.
 *
 * El spinner de las transiciones entre páginas no tapa nada (es un círculo de 28px en posición
 * absoluta) y `setLoading(true)` solo ocultaba el footer y deshabilitaba SUS botones, así que el
 * contenido del survey seguía respondiendo: el usuario podía cambiar de opción mientras se
 * enviaba la página. Ese cambio ya no viajaba con ella, porque la respuesta se había mandado, de
 * modo que creía haber corregido su respuesta y no era así.
 *
 * Se bloquea el contenedor entero en vez de deshabilitar campo por campo: el survey lo pinta
 * `@magicfeedback/native` y su marcado cambia con cada tipo de pregunta.
 */

/** Marca (o suelta) el contenedor del survey como ocupado. No-op sin elemento. */
export function setSurveyBusy(el: HTMLElement | null | undefined, busy: boolean): void {
    if (!el) return;
    // Cadena vacía al soltar, no 'auto': así el CSS del host sigue mandando sobre el elemento.
    el.style.pointerEvents = busy ? 'none' : '';
    el.setAttribute('aria-busy', busy ? 'true' : 'false');
    // `inert` lo saca además del tab order y del lector de pantalla. No está en WebViews
    // antiguos, donde `pointer-events` ya cubre el caso del vídeo del cliente.
    if ('inert' in el) {
        (el as HTMLElement & { inert?: boolean }).inert = busy;
    }
}

/**
 * Espejo ES5 para el JS que corre DENTRO del WebView (React Native y KMP), que no comparte
 * módulos con el bundle. `busy.test.ts` lo evalúa y compara su efecto con el del módulo, para
 * que las dos implementaciones no se separen.
 */
export const BUSY_JS = `
function ddSetSurveyBusy(el, busy){
  if(!el){ return; }
  el.style.pointerEvents = busy ? 'none' : '';
  el.setAttribute('aria-busy', busy ? 'true' : 'false');
  if('inert' in el){ el.inert = busy; }
}`;
