/**
 * Helpers puros (sin DOM) para la fuente personalizable del popup/survey.
 * Espejo exacto en KMP: `ui/Font.kt`. Cualquier cambio aquí se replica allí.
 */

const FORMAT_BY_EXT: Record<string, string> = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype',
};

/** Deriva el `format()` del `@font-face` a partir de la extensión de la URL. */
export function fontFormatFromUrl(url: string): string | undefined {
  const clean = url.split('?')[0].split('#')[0];
  const ext = clean.slice(clean.lastIndexOf('.') + 1).toLowerCase();
  return FORMAT_BY_EXT[ext];
}

/** Valor a aplicar en `font-family`: nombre custom + fallback de sistema. */
export function buildFontFamilyValue(family: string): string {
  return `"${family}", -apple-system, system-ui, sans-serif`;
}

/** CSS del `@font-face`. Devuelve "" si no hay url. */
export function buildFontFaceCss(family: string, url?: string): string {
  if (!url) return '';
  const fmt = fontFormatFromUrl(url);
  const src = fmt ? `url("${url}") format("${fmt}")` : `url("${url}")`;
  return `@font-face{font-family:"${family}";src:${src};font-display:swap;}`;
}
