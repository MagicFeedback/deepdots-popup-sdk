/**
 * Color de marca dentro del survey.
 *
 * El survey pinta sus controles (chips del rating, bordes, foco, selección) con `--mf-primary`,
 * que `@magicfeedback/native` rellena desde `formData.style.primaryColor`. Las integraciones
 * configuran `buttonPrimaryColor` para el botón, pero muchas dejan `primaryColor` vacío, así que
 * el popup acababa mezclando un botón con el color de la marca y unos controles con el `#5d7bad`
 * por defecto del paquete.
 *
 * Aquí se rellena ese hueco: sin `primaryColor`, se usa `buttonPrimaryColor`. Cuando la
 * integración sí define `primaryColor`, ese manda y el SDK no interviene.
 */

/** Estilo del survey, tal y como llega en `formData.style`. */
export interface SurveyPaletteStyle {
    primaryColor?: string;
    buttonPrimaryColor?: string;
}

/**
 * Solo hex. El estilo viene de la API y se interpola en CSS, así que cualquier otra cosa
 * (`red; background: url(...)`, `var(--x)`, …) se descarta en vez de colarse en la hoja.
 */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Color que debe usar el survey, o null para dejar el del paquete. */
export function resolveSurveyPrimaryColor(style?: SurveyPaletteStyle | null): string | null {
    for (const candidate of [style?.primaryColor, style?.buttonPrimaryColor]) {
        const value = (candidate ?? '').trim();
        if (HEX_COLOR.test(value)) return value;
    }
    return null;
}

/**
 * Las cinco variables que `applyPrimaryColor` del Surveys SDK escribe en el contenedor. Las
 * derivadas hay que redeclararlas y no solo cambiar `--mf-primary`: un `color-mix` escrito en
 * `:root` ya se resolvió allí contra el color por defecto, y heredaría ese valor ya calculado.
 */
export function surveyPrimaryVars(color: string): Array<[string, string]> {
    return [
        ['--mf-primary', color],
        ['--mf-primary-hover', `color-mix(in srgb, ${color} 85%, black)`],
        ['--mf-primary-light', `color-mix(in srgb, ${color} 15%, white)`],
        ['--mf-primary-border', `color-mix(in srgb, ${color} 35%, transparent)`],
        ['--mf-border-focus', color],
    ];
}

/** Pinta el color de marca del survey en `el`. No-op si no hay color utilizable. */
export function applySurveyPrimaryColor(el: HTMLElement, style?: SurveyPaletteStyle | null): void {
    const color = resolveSurveyPrimaryColor(style);
    if (!color) return;
    for (const [name, value] of surveyPrimaryVars(color)) {
        el.style.setProperty(name, value);
    }
}

/**
 * Espejo ES5 de lo anterior, para el JS que corre DENTRO del WebView (React Native y KMP), que no
 * comparte módulos con el bundle. `surveyPalette.test.ts` evalúa este texto y compara el
 * resultado con el del módulo, para que las dos implementaciones no se separen.
 */
export const PRIMARY_COLOR_JS = `
function ddResolveSurveyPrimaryColor(style){
  var hex=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  var candidates=[style&&style.primaryColor, style&&style.buttonPrimaryColor];
  for(var i=0;i<candidates.length;i++){
    var value=(candidates[i]||'').trim();
    if(hex.test(value)){ return value; }
  }
  return null;
}
function ddApplySurveyPrimaryColor(el, style){
  var color=ddResolveSurveyPrimaryColor(style);
  if(!color||!el){ return; }
  el.style.setProperty('--mf-primary', color);
  el.style.setProperty('--mf-primary-hover', 'color-mix(in srgb, '+color+' 85%, black)');
  el.style.setProperty('--mf-primary-light', 'color-mix(in srgb, '+color+' 15%, white)');
  el.style.setProperty('--mf-primary-border', 'color-mix(in srgb, '+color+' 35%, transparent)');
  el.style.setProperty('--mf-border-focus', color);
}`;
