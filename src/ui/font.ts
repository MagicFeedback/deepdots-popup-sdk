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

// family/url provienen de la API y se interpolan en CSS y en el <style> del HTML del WebView.
// Saneamos para evitar romper el string/rule (CSS injection) o cerrar </style> (script injection).
function sanitizeFamily(family: string): string {
  return family.replace(/[^A-Za-z0-9 ._-]/g, '').trim();
}

function isSafeFontUrl(url: string): boolean {
  // Solo http(s)/data y sin caracteres que rompan url("...") o el <style>:
  // comillas, <>, backslash, y cualquier whitespace o carácter de control.
  if (!/^(https?:|data:)/i.test(url)) return false;
  // eslint-disable-next-line no-control-regex
  return !/[\x00-\x20"<>\\]/.test(url);
}

/** Valor a aplicar en `font-family`: nombre custom + fallback de sistema. */
export function buildFontFamilyValue(family: string): string {
  const safe = sanitizeFamily(family);
  return `"${safe}", -apple-system, system-ui, sans-serif`;
}

/** CSS del `@font-face`. Devuelve "" si no hay url (o no es segura). */
export function buildFontFaceCss(family: string, url?: string): string {
  if (!url || !isSafeFontUrl(url)) return '';
  const safe = sanitizeFamily(family);
  const fmt = fontFormatFromUrl(url);
  const src = fmt ? `url("${url}") format("${fmt}")` : `url("${url}")`;
  return `@font-face{font-family:"${safe}";src:${src};font-display:swap;}`;
}
