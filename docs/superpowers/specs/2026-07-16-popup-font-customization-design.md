# Personalización de la font family del popup y el survey

Fecha: 2026-07-16
Repos afectados: `@magicfeedback/popup-sdk` (Web, este repo) y `DeepdotsPopupSDK` (KMP).

## Objetivo

Permitir que un cliente personalice la familia tipográfica que se aplica al popup Y al survey que renderiza. La configuración viaja dentro de la definición del popup que emite la API (`PopupStyle`), por popup, no como config global de `init()`.

## Modelo / API

`PopupStyle` (en `src/types/index.ts` y su espejo Kotlin) gana un campo opcional:

```ts
export interface PopupFont {
  /** Nombre de la familia. Ej: "Inter" (nombre limpio, NO un stack). */
  family: string;
  /** Opcional: URL a un archivo de fuente (woff2/ttf/otf) para armar un @font-face. */
  url?: string;
}

export interface PopupStyle {
  theme: 'light' | 'dark';
  position: 'bottom' | 'bottom-right' | 'bottom-left' | 'top' | 'top-right' | 'top-left' | 'center';
  /** @deprecated */
  imageUrl?: string | null;
  font?: PopupFont; // NUEVO, viene de la API por popup
}
```

### Reglas del contrato

- `family` es el **nombre de la familia** (ej. `"Inter"`), no un stack CSS. El SDK aplica
  `font-family: "Inter", -apple-system, system-ui, sans-serif` (añade fallback de sistema).
- `url` es **opcional** y apunta a un **archivo de fuente** (woff2/ttf/otf). Si viene, el SDK
  genera un `@font-face { font-family:"<family>"; src:url("<url>") format("<fmt>") }`. Si no viene,
  se asume que la fuente ya está disponible (fuente de sistema o cargada por el host web).
- El `format()` se deriva de la extensión de la URL: `.woff2`->`woff2`, `.ttf`->`truetype`,
  `.otf`->`opentype`; si no se reconoce, se omite `format()` y el navegador olfatea.
- Si `font` está **ausente**: comportamiento actual intacto (hereda del body; el `<h2>` del título
  sigue en `Montserrat`).
- `font` aplica a **todo el popup + survey**, incluido el título (hoy hardcodeado a `Montserrat`),
  que pasa a usar la fuente custom cuando `font` está presente.

### Por qué `family` = nombre y no stack

La decisión de que `url` arme un `@font-face` obliga a un nombre único: un `@font-face` no puede
declararse sobre un stack. Con nombre + fallback del SDK siempre hay red de seguridad si la fuente
no carga, y la regla es idéntica en TS y Kotlin (paridad simple). Un stack a medida sin `url` queda
como posible extensión futura (YAGNI hoy).

## Mecanismo común: variable CSS `--deepdots-font`

El SDK fija `--deepdots-font` en el contenedor raíz y todo lo demás la consume vía
`var(--deepdots-font, <fallback>)`. Una sola línea gobierna popup + survey, y el fallback conserva
el comportamiento actual.

## Caminos de render

### Camino A: Web navegador (`src/ui/renderPopup.ts` + `src/assets/style.css`)

1. `renderPopup` recibe `style?.font` (el `PopupStyle` ya llega por el threading actual, ver
   `src/platform/renderer.ts`).
2. Si hay `font.url`: inyectar una vez (deduped por id) un `<style>` con el `@font-face` en
   `document.head`.
3. Fijar en el contenedor `.deepdots-popup`:
   `popup.style.setProperty('--deepdots-font', '"<family>", -apple-system, system-ui, sans-serif')`.
4. En `src/assets/style.css`: los `font-family: inherit` pasan a `var(--deepdots-font, inherit)` y
   el `<h2>` (línea ~141) pasa a `var(--deepdots-font, 'Montserrat')`. El survey de magicfeedback,
   al estar dentro del contenedor y usar `inherit`, hereda la variable sin tocar nada más.

### Camino B: Survey en WebView (`src/ui/surveyHtml.ts`)

1. `BuildSurveyHtmlOptions` gana `font?: PopupFont`.
2. En el `<head>` del HTML: si hay `url`, un `@font-face`; y el `<style>` base cambia
   `font-family:-apple-system,...` por la familia custom con su fallback.
3. Threading nuevo: `PopupStyle.font` -> `ReactNativePopupRenderer.show` -> `buildSurveyHtml`
   (hoy la ruta RN no recibe `PopupStyle`; es el único cableado nuevo real).

### Camino C: KMP (`ui/MagicFeedbackHtml.kt` en el repo `DeepdotsPopupSDK`)

Espejo exacto del camino B en Kotlin: `PopupStyle`/`PopupFont` en el modelo Kotlin,
`buildMagicFeedbackHtml` inyecta `@font-face` + `font-family` en el HTML del WebView.

## Componentes aislados y testeables

Se extrae la lógica pura a un módulo sin DOM para poder testearla directamente:

- `buildFontFaceCss(family, url)`: devuelve el string del `@font-face` (deriva `format()` de la
  extensión). Devuelve vacío/undefined si no hay `url`.
- `buildFontFamilyValue(family)`: devuelve el valor a aplicar (`"<family>", -apple-system,
  system-ui, sans-serif`).

Estos helpers viven en `src/ui/font.ts` (Web) y su espejo en Kotlin, y son la base de la paridad.

## Tests (TDD, test primero)

### Web (`vitest`)

- `src/ui/font.test.ts`: `buildFontFaceCss` (woff2/ttf/otf/desconocido) y `buildFontFamilyValue`
  (nombre + fallback).
- `src/ui/surveyHtml.test.ts`: el HTML incluye `@font-face` y aplica la familia cuando hay `font`;
  y no la incluye cuando no hay `font`.
- Integración en `renderPopup` (o E2E si happy-dom no basta): `--deepdots-font` queda fijada en el
  contenedor y el `@font-face` se inyecta una sola vez (dedup).

### KMP (`commonTest`)

- Modelo `PopupStyle`/`PopupFont` en Kotlin.
- `buildMagicFeedbackHtml` inyecta `@font-face` + `font-family`.
- `FontHtmlParityTest`: espejo de los casos Web (misma tabla de extensiones y mismo string de
  familia+fallback), para garantizar que Web y KMP generan lo mismo.

## Archivos tocados

### Web (este repo)

- `src/types/index.ts`: `PopupFont` + `PopupStyle.font`.
- `src/ui/font.ts` (nuevo): helpers puros.
- `src/ui/renderPopup.ts`: inyección de `@font-face` (deduped) + fijar `--deepdots-font`.
- `src/assets/style.css`: `inherit` -> `var(--deepdots-font, inherit)`; h2 -> `var(--deepdots-font, 'Montserrat')`.
- `src/ui/surveyHtml.ts`: `font?` en opciones + `@font-face`/`font-family` en el HTML.
- Threading RN: `ReactNativePopupRenderer.show` -> `buildSurveyHtml`.

### KMP (repo `DeepdotsPopupSDK`)

- Modelo `PopupStyle`/`PopupFont` en Kotlin.
- `ui/MagicFeedbackHtml.kt`: inyección de `@font-face` + `font-family`.
- Tests de paridad en `commonTest`.

## Fuera de scope

- Cambiar el backend/plataforma para que emita `font` en `PopupStyle` (equipo de plataforma).
- Cargar la fuente en el host web cuando `font` no trae `url` (se asume disponible).
- Soporte de stack CSS a medida en `family` (posible extensión futura).
