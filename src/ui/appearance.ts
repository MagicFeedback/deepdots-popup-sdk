/**
 * Claro u oscuro forzado por la app (DD-241, espejo del nativo DD-240).
 *
 * `appearance` en `init()` o `setAppearance()`: `'light'`, `'dark'` o `'system'` (el del sistema).
 * Sin él (`undefined`/`null`) no se fuerza nada y mandan los colores del Style del survey, como en
 * DD-247. En oscuro forzado se usan los colores opcionales `dark` del Style (DD-239); si no, el
 * del Style si ya es oscuro; si no, un oscuro por defecto.
 */
import { isDarkBackground } from './chromeContrast';

export type Appearance = 'system' | 'light' | 'dark';
export type ColorMode = 'light' | 'dark';

/** Colores del Style que usa el chrome, con el bloque opcional `dark` (DD-239). */
export interface StyleColors {
    boxBackgroundColor?: string | null;
    buttonPrimaryColor?: string | null;
    buttonSecondaryColor?: string | null;
    loadingBarColor?: string | null;
    dark?: {
        boxBackgroundColor?: string | null;
        buttonPrimaryColor?: string | null;
        buttonSecondaryColor?: string | null;
        loadingBarColor?: string | null;
    } | null;
}

export const LIGHT_DEFAULT_BG = '#fff';
export const DARK_DEFAULT_BG = '#1e1e1e';
/** Botón principal sin color de marca sobre tarjeta oscura: el slate de siempre casi no se ve. */
export const DARK_DEFAULT_PRIMARY = '#E2E8F0';
/** Texto sobre un botón claro en tarjeta oscura. */
export const ON_LIGHT_PRIMARY = '#0F172A';

/** Modo forzado por la app, o `null` si la app no dice nada. `system` = el del sistema. */
export function resolveForcedMode(appearance: Appearance | null | undefined, systemDark: boolean): ColorMode | null {
    if (appearance === 'light' || appearance === 'dark') return appearance;
    if (appearance === 'system') return systemDark ? 'dark' : 'light';
    return null;
}

/** `prefers-color-scheme: dark` del sistema; false donde no hay `matchMedia` (SSR, tests). */
export function systemPrefersDark(): boolean {
    try {
        return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
        return false;
    }
}

/** Valor válido de `appearance`, o undefined (cualquier otra cosa se ignora). */
export function normalizeAppearance(value: unknown): Appearance | undefined {
    return value === 'system' || value === 'light' || value === 'dark' ? value : undefined;
}

export interface ChromeColors {
    /** Fondo de la tarjeta. */
    background: string;
    /** Si la tarjeta es oscura (decide textos, `color-scheme` y botones). */
    dark: boolean;
    /** Botón principal; null = el del CSS de siempre (tarjeta clara sin color de marca). */
    primary: string | null;
    /** Texto del botón principal. */
    onPrimary: string;
    secondary: string | null;
    loadingBar: string | null;
}

const isDark = (c?: string | null) => isDarkBackground(c) === true;

/**
 * Colores del chrome para un Style, el `theme` del popup y el modo forzado por la app.
 * - Sin modo: el `boxBackgroundColor` del Style o el fondo del `theme` (DD-247).
 * - Light: el del Style o blanco.
 * - Dark: `dark.boxBackgroundColor` si es oscuro; si no, el del Style si es oscuro; si no, el
 *   oscuro por defecto (un color de marca claro no sirve en oscuro).
 * En tarjeta oscura los botones y la barra usan primero el bloque `dark`.
 */
export function chromeColors(
    style: StyleColors | null | undefined,
    theme: string | undefined,
    forced: ColorMode | null,
): ChromeColors {
    const box = style?.boxBackgroundColor || null;
    const darkBlock = style?.dark || null;
    let background: string;
    if (forced === 'dark') {
        if (isDark(darkBlock?.boxBackgroundColor)) background = darkBlock!.boxBackgroundColor as string;
        else if (isDark(box)) background = box as string;
        else background = DARK_DEFAULT_BG;
    } else if (forced === 'light') {
        background = box || LIGHT_DEFAULT_BG;
    } else {
        background = box || (theme === 'dark' ? DARK_DEFAULT_BG : LIGHT_DEFAULT_BG);
    }
    const parsed = isDarkBackground(background);
    const dark = parsed === null ? (forced ? forced === 'dark' : theme === 'dark') : parsed;
    const primary = dark
        ? darkBlock?.buttonPrimaryColor || style?.buttonPrimaryColor || DARK_DEFAULT_PRIMARY
        : style?.buttonPrimaryColor || null;
    const onPrimary = dark && primary && isDarkBackground(primary) === false ? ON_LIGHT_PRIMARY : '#fff';
    return {
        background,
        dark,
        primary,
        onPrimary,
        secondary: (dark && darkBlock?.buttonSecondaryColor) || style?.buttonSecondaryColor || null,
        loadingBar: (dark && darkBlock?.loadingBarColor) || style?.loadingBarColor || null,
    };
}

/**
 * Espejo ES5 para el JS que corre dentro del WebView (React Native). Necesita
 * `ddIsDarkBackground` de CHROME_CONTRAST_JS. `appearance.test.ts` lo evalúa y lo compara.
 */
export const APPEARANCE_JS = `
function ddChromeColors(style, theme, forced){
  var s=style||{}; var box=s.boxBackgroundColor||null; var d=s.dark||null;
  var isDark=function(c){ return ddIsDarkBackground(c)===true; };
  var bg;
  if(forced==='dark'){ bg = (d && isDark(d.boxBackgroundColor)) ? d.boxBackgroundColor : (isDark(box) ? box : '${DARK_DEFAULT_BG}'); }
  else if(forced==='light'){ bg = box || '${LIGHT_DEFAULT_BG}'; }
  else { bg = box || (theme==='dark' ? '${DARK_DEFAULT_BG}' : '${LIGHT_DEFAULT_BG}'); }
  var parsed=ddIsDarkBackground(bg);
  var dark = parsed===null ? (forced ? forced==='dark' : theme==='dark') : parsed;
  var primary = dark ? ((d && d.buttonPrimaryColor) || s.buttonPrimaryColor || '${DARK_DEFAULT_PRIMARY}') : (s.buttonPrimaryColor || null);
  var onPrimary = (dark && primary && ddIsDarkBackground(primary)===false) ? '${ON_LIGHT_PRIMARY}' : '#fff';
  return {
    background: bg, dark: dark, primary: primary, onPrimary: onPrimary,
    secondary: (dark && d && d.buttonSecondaryColor) || s.buttonSecondaryColor || null,
    loadingBar: (dark && d && d.loadingBarColor) || s.loadingBarColor || null
  };
}
function ddResolveForcedMode(appearance){
  if(appearance==='light'||appearance==='dark'){ return appearance; }
  if(appearance==='system'){
    try { return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; } catch(e){ return 'light'; }
  }
  return null;
}`;
