/**
 * Contraste del chrome del popup (título, X, progreso, Back, textos de carga/fin y
 * `color-scheme`) a partir del fondo final de la tarjeta.
 *
 * El fondo lo decide el Style del survey (`boxBackgroundColor`); `theme` solo es el fondo por
 * defecto cuando el Style no trae uno. Antes los textos salían siempre del `theme` (light por
 * defecto), así que un Style con fondo oscuro dejaba el título y la X casi negros sobre negro.
 */

export interface ChromePalette {
    popupBg: string;
    colorScheme: 'light' | 'dark';
    textPrimary: string;
    closeBtnHoverColor: string;
    textMuted: string;
    progressTrack: string;
}

/** Paleta del chrome para un fondo claro u oscuro. Los valores son los del `theme` de siempre. */
export function chromePalette(dark: boolean): ChromePalette {
    return {
        popupBg: dark ? '#1e1e1e' : '#fff',
        colorScheme: dark ? 'dark' : 'light',
        textPrimary: dark ? '#f0f0f0' : '#111',
        closeBtnHoverColor: dark ? '#fff' : '#000000',
        textMuted: dark ? '#9ca3af' : '#6b7280',
        progressTrack: dark ? '#3f3f46' : '#e5e7eb',
    };
}

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i;

/** [r, g, b] 0–255, o null si el color no es hex ni rgb() (nombres, var(), gradientes…). */
export function parseColor(value?: string | null): [number, number, number] | null {
    const v = (value ?? '').trim();
    const hex = HEX.exec(v);
    if (hex) {
        let h = hex[1];
        if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    const rgb = RGB.exec(v);
    if (rgb) {
        const parts = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
        if (parts.every((n) => n <= 255)) return parts as [number, number, number];
    }
    return null;
}

/** Luminancia relativa WCAG (0 = negro, 1 = blanco). */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
    const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Punto en el que el texto blanco pasa a contrastar más que el negro:
 * (1 + 0.05) / (L + 0.05) = (L + 0.05) / 0.05 → L ≈ 0.179.
 */
const DARK_THRESHOLD = 0.179;

/** true si el fondo es oscuro, false si es claro, null si no se puede leer el color. */
export function isDarkBackground(color?: string | null): boolean | null {
    const rgb = parseColor(color);
    return rgb ? relativeLuminance(rgb) < DARK_THRESHOLD : null;
}

/**
 * Espejo ES5 para el JS que corre DENTRO del WebView (React Native), que no comparte módulos con
 * el bundle. `chromeContrast.test.ts` evalúa este texto y lo compara con el módulo.
 */
export const CHROME_CONTRAST_JS = `
function ddIsDarkBackground(value){
  var v=(value||'').trim();
  var rgb=null;
  var hex=/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v);
  if(hex){
    var h=hex[1];
    if(h.length<=4){ var e=''; for(var i=0;i<h.length;i++){ e+=h.charAt(i)+h.charAt(i); } h=e; }
    rgb=[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
  } else {
    var m=/^rgba?\\(\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})\\s*(?:,\\s*[\\d.]+\\s*)?\\)$/i.exec(v);
    if(m && +m[1]<=255 && +m[2]<=255 && +m[3]<=255){ rgb=[+m[1],+m[2],+m[3]]; }
  }
  if(!rgb){ return null; }
  var lin=function(c){ var s=c/255; return s<=0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055,2.4); };
  var l=0.2126*lin(rgb[0])+0.7152*lin(rgb[1])+0.0722*lin(rgb[2]);
  return l<${DARK_THRESHOLD};
}
function ddChromePalette(dark){
  return {
    colorScheme: dark?'dark':'light',
    textPrimary: dark?'#f0f0f0':'#111',
    closeBtnHoverColor: dark?'#fff':'#000000',
    textMuted: dark?'#9ca3af':'#6b7280',
    progressTrack: dark?'#3f3f46':'#e5e7eb'
  };
}`;
