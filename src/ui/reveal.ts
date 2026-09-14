/**
 * Apertura diferida del popup: el chrome se monta invisible y se enseña cuando el survey ya
 * está pintado, en vez de enseñar un spinner girando mientras se espera.
 *
 * Vive en su propio módulo porque lo comparten las dos rutas de render y `renderPopup` arrastra
 * `@magicfeedback/native`: importar la constante desde allí metería el survey entero en el bundle
 * de React Native. La ruta del WebView (`surveyHtml`) hornea el valor en el HTML y lleva su
 * propio espejo del algoritmo en ES5, porque ese código corre dentro del WebView.
 */

/**
 * Techo de la espera. Pasado este tiempo el popup se abre igualmente (con spinner, el
 * comportamiento de siempre), para que una red mala retrase la apertura pero nunca la impida.
 *
 * 1200 ms sale de medir contra producción: el `GET .../info` del survey tarda unos 250 ms de
 * mediana desde Europa, pero con el servicio frío se han visto 775 ms. El techo tiene que quedar
 * por encima de esa cola: si cayera justo encima, el popup se abriría con el spinner para
 * quitarlo 30 ms después, que es peor que cualquiera de las dos opciones.
 */
export const REVEAL_TIMEOUT_MS = 1200;

/**
 * Llama a `reveal` cuando no queden imágenes por llegar dentro de `root`, o ya mismo si no hay
 * ninguna pendiente. Las imágenes (los emojis del rating son SVG, y el logo del survey) llegan
 * DESPUÉS de que el formulario esté montado: sin esperarlas, el popup aparece y se rellena
 * delante del usuario. Quien llama debe mantener su propio techo de tiempo para las que no
 * lleguen nunca.
 */
export function revealWhenPainted(root: ParentNode, reveal: () => void): void {
    const pending = Array.from(root.querySelectorAll('img')).filter((img) => !img.complete);
    if (!pending.length) {
        reveal();
        return;
    }
    let left = pending.length;
    const onSettled = () => {
        left -= 1;
        if (left <= 0) reveal();
    };
    pending.forEach((img) => {
        img.addEventListener('load', onSettled, { once: true });
        img.addEventListener('error', onSettled, { once: true });
    });
}
