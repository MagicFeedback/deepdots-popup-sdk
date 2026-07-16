# Personalización de font family (PopupStyle.font) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un popup emitido por la API defina `style.font = { family, url? }` y que esa fuente se aplique al popup y al survey en los tres caminos de render (Web navegador, WebView RN, KMP).

**Architecture:** Un módulo puro `font.ts` genera el `@font-face` (desde una URL de archivo de fuente) y el valor `font-family` con fallback de sistema. En web se aplica fijando la fuente en el contenedor `.deepdots-popup` (el survey hereda) y dejando el `<h2>` del título como `var(--deepdots-font, 'Montserrat')` para que la fuente custom lo sobreescriba. En el WebView (RN y KMP) se inyecta el `@font-face` y el `font-family` en el HTML autocontenido. KMP replica el módulo puro y el cableado con tests de paridad.

**Tech Stack:** TypeScript, tsup, vitest (Web); Kotlin Multiplatform, commonTest (KMP).

**Contexto del contrato (del spec `docs/superpowers/specs/2026-07-16-popup-font-customization-design.md`):**
- `family` es un nombre limpio (ej. `"Inter"`), NO un stack. Se aplica `"Inter", -apple-system, system-ui, sans-serif`.
- `url` es opcional y apunta a un archivo de fuente (woff2/ttf/otf). Si viene, se arma un `@font-face`. El `format()` sale de la extensión.
- Si `font` está ausente: comportamiento actual intacto (título en `Montserrat`, resto hereda del body).

---

## File Structure (Web)

- `src/types/index.ts` — añade `PopupFont` y `PopupStyle.font`.
- `src/ui/font.ts` (nuevo) — helpers puros `buildFontFaceCss`, `buildFontFamilyValue`, `fontFormatFromUrl`.
- `src/ui/font.test.ts` (nuevo) — tests de los helpers.
- `src/ui/surveyHtml.ts` — `font?` en opciones + inyección en el HTML del WebView.
- `src/ui/surveyHtml.test.ts` (nuevo) — tests del HTML con/ sin `font`.
- `src/ui/renderPopup.ts` — fija la fuente en el contenedor + `@font-face` deduped.
- `src/assets/style.css` — el `<h2>` del título pasa a `var(--deepdots-font, 'Montserrat')`.
- `src/platform/react-native-renderer.ts` — threadea `style.font` a `buildSurveyHtml`.
- `src/platform/react-native-renderer.test.ts` — añade caso de font en el HTML entregado.

## File Structure (KMP, repo `/Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK`)

- `shared/src/commonMain/kotlin/com/deepdots/sdk/ui/Font.kt` (nuevo) — espejo de `font.ts`.
- `shared/src/commonTest/kotlin/com/deepdots/sdk/ui/FontHtmlParityTest.kt` (nuevo) — paridad con Web.
- `shared/src/commonMain/kotlin/com/deepdots/sdk/ui/MagicFeedbackHtml.kt` — inyección de `@font-face` + `font-family`.
- El modelo `PopupStyle`/`PopupFont` en el paquete de tipos KMP.

---

# FASE 1 — WEB

## Task 1: Tipos `PopupFont` y `PopupStyle.font`

**Files:**
- Modify: `src/types/index.ts` (interfaz `PopupStyle`, ~línea 176)

- [ ] **Step 1: Añadir la interfaz `PopupFont` y el campo `font`**

En `src/types/index.ts`, justo antes de `export interface PopupStyle {`, añade:

```ts
/** Fuente personalizable del popup + survey (viene de la API por popup) */
export interface PopupFont {
    /** Nombre de la familia. Ej: "Inter" (nombre limpio, NO un stack). */
    family: string;
    /** Opcional: URL a un archivo de fuente (woff2/ttf/otf) para armar un @font-face. */
    url?: string;
}
```

Y dentro de `PopupStyle`, tras `imageUrl?: string | null;`, añade:

```ts
    /** Fuente personalizada. Si falta, se mantiene el comportamiento actual. */
    font?: PopupFont;
```

- [ ] **Step 2: Verificar que compila los tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): PopupFont + PopupStyle.font"
```

---

## Task 2: Helpers puros `src/ui/font.ts`

**Files:**
- Create: `src/ui/font.ts`
- Test: `src/ui/font.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/ui/font.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFontFaceCss, buildFontFamilyValue, fontFormatFromUrl } from './font';

describe('fontFormatFromUrl', () => {
  it('deriva el format de la extensión', () => {
    expect(fontFormatFromUrl('https://x.com/Inter.woff2')).toBe('woff2');
    expect(fontFormatFromUrl('https://x.com/Inter.ttf')).toBe('truetype');
    expect(fontFormatFromUrl('https://x.com/Inter.otf')).toBe('opentype');
  });
  it('ignora query/hash', () => {
    expect(fontFormatFromUrl('https://x.com/Inter.woff2?v=3#a')).toBe('woff2');
  });
  it('devuelve undefined si no reconoce la extensión', () => {
    expect(fontFormatFromUrl('https://x.com/Inter.eot')).toBeUndefined();
  });
});

describe('buildFontFamilyValue', () => {
  it('añade el fallback de sistema', () => {
    expect(buildFontFamilyValue('Inter')).toBe('"Inter", -apple-system, system-ui, sans-serif');
  });
});

describe('buildFontFaceCss', () => {
  it('devuelve "" sin url', () => {
    expect(buildFontFaceCss('Inter', undefined)).toBe('');
  });
  it('arma el @font-face con format conocido', () => {
    expect(buildFontFaceCss('Inter', 'https://x.com/Inter.woff2')).toBe(
      '@font-face{font-family:"Inter";src:url("https://x.com/Inter.woff2") format("woff2");font-display:swap;}',
    );
  });
  it('omite format() si la extensión no se reconoce', () => {
    expect(buildFontFaceCss('Inter', 'https://x.com/Inter.eot')).toBe(
      '@font-face{font-family:"Inter";src:url("https://x.com/Inter.eot");font-display:swap;}',
    );
  });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run src/ui/font.test.ts`
Expected: FAIL ("Failed to resolve import './font'").

- [ ] **Step 3: Implementar `src/ui/font.ts`**

```ts
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
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npx vitest run src/ui/font.test.ts`
Expected: PASS (todos verdes).

- [ ] **Step 5: Commit**

```bash
git add src/ui/font.ts src/ui/font.test.ts
git commit -m "feat(font): helpers puros buildFontFaceCss/buildFontFamilyValue"
```

---

## Task 3: `surveyHtml.ts` acepta y aplica `font`

**Files:**
- Modify: `src/ui/surveyHtml.ts`
- Test: `src/ui/surveyHtml.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/ui/surveyHtml.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSurveyHtml } from './surveyHtml';

describe('buildSurveyHtml font', () => {
  it('sin font: usa la fuente de sistema y no incluye @font-face', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('font-family:-apple-system,system-ui,sans-serif');
    expect(html).not.toContain('@font-face');
  });

  it('con font.family: aplica la familia con fallback', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', font: { family: 'Inter' } });
    expect(html).toContain('"Inter", -apple-system, system-ui, sans-serif');
    expect(html).not.toContain('@font-face');
  });

  it('con font.url: inyecta el @font-face y aplica la familia', () => {
    const html = buildSurveyHtml({
      surveyId: 's1',
      productId: 'p1',
      font: { family: 'Inter', url: 'https://x.com/Inter.woff2' },
    });
    expect(html).toContain('@font-face{font-family:"Inter";src:url("https://x.com/Inter.woff2") format("woff2")');
    expect(html).toContain('"Inter", -apple-system, system-ui, sans-serif');
  });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run src/ui/surveyHtml.test.ts`
Expected: FAIL (el 2º y 3º test fallan: `font` no existe / no se aplica).

- [ ] **Step 3: Implementar en `src/ui/surveyHtml.ts`**

3a. Añade el import arriba (tras el import de tipos existente):

```ts
import { buildFontFaceCss, buildFontFamilyValue } from './font';
import type { PopupFont } from '../types';
```

3b. En `BuildSurveyHtmlOptions`, añade el campo (tras `version?`):

```ts
  font?: PopupFont; // fuente personalizada (family + url opcional)
```

3c. Dentro de `buildSurveyHtml`, tras la línea `const metaJson = JSON.stringify(opts.metadata ?? []);`, añade:

```ts
  const fontFaceCss = opts.font ? buildFontFaceCss(opts.font.family, opts.font.url) : '';
  const fontFamilyCss = opts.font ? buildFontFamilyValue(opts.font.family) : '-apple-system,system-ui,sans-serif';
```

3d. Sustituye la línea del `<style>` (la que hoy es):

```
<style>html,body{margin:0;padding:0;background:transparent;font-family:-apple-system,system-ui,sans-serif}#mf{width:100%;box-sizing:border-box}#mf *{max-width:100%;box-sizing:border-box}</style>
```

por (interpolando las dos variables nuevas):

```ts
<style>${fontFaceCss}html,body{margin:0;padding:0;background:transparent;font-family:${fontFamilyCss}}#mf{width:100%;box-sizing:border-box}#mf *{max-width:100%;box-sizing:border-box}</style>
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npx vitest run src/ui/surveyHtml.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/surveyHtml.ts src/ui/surveyHtml.test.ts
git commit -m "feat(surveyHtml): aplica font (family + @font-face) en el WebView"
```

---

## Task 4: Threading `style.font` en el renderer RN

**Files:**
- Modify: `src/platform/react-native-renderer.ts:52-71`
- Test: `src/platform/react-native-renderer.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade a `src/platform/react-native-renderer.test.ts` (dentro del `describe` existente) este caso:

```ts
it('pasa style.font al HTML del survey', () => {
  let captured: { html: string } | null = null;
  const renderer = new ReactNativePopupRenderer({ onShow: (p) => { captured = p; } });
  renderer.show(
    's1', 'p1', undefined,
    () => {}, () => {},
    'production', 'u1',
    { theme: 'light', position: 'center', font: { family: 'Inter', url: 'https://x.com/Inter.woff2' } },
  );
  expect(captured).not.toBeNull();
  expect(captured!.html).toContain('@font-face{font-family:"Inter"');
  expect(captured!.html).toContain('"Inter", -apple-system, system-ui, sans-serif');
});
```

Nota: si el import de `ReactNativePopupRenderer` no está en el fichero de test, añádelo:
`import { ReactNativePopupRenderer } from './react-native-renderer';`

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run src/platform/react-native-renderer.test.ts`
Expected: FAIL (el HTML no contiene el `@font-face` porque `style` está ignorado).

- [ ] **Step 3: Implementar el threading**

En `src/platform/react-native-renderer.ts`, en el método `show`, renombra el parámetro `_style?: PopupStyle,` a `style?: PopupStyle,` (línea ~60) y cambia la construcción del HTML (línea ~71) de:

```ts
    const html = buildSurveyHtml({ surveyId, productId, env, profile, metadata });
```

a:

```ts
    const html = buildSurveyHtml({ surveyId, productId, env, profile, metadata, font: style?.font });
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npx vitest run src/platform/react-native-renderer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/platform/react-native-renderer.ts src/platform/react-native-renderer.test.ts
git commit -m "feat(rn): threadea style.font a buildSurveyHtml"
```

---

## Task 5: Aplicar la fuente en el popup web (`renderPopup.ts` + `style.css`)

**Files:**
- Modify: `src/ui/renderPopup.ts` (imports + creación del contenedor, ~línea 108)
- Modify: `src/assets/style.css:141`

- [ ] **Step 1: Añadir el import de los helpers en `renderPopup.ts`**

En la cabecera de `src/ui/renderPopup.ts`, tras `import { buildSurveyIdentity } from '../tracking/tracking-manager';`, añade:

```ts
import { buildFontFaceCss, buildFontFamilyValue } from './font';
```

- [ ] **Step 2: Añadir el helper de inyección de `@font-face` (deduped)**

En `src/ui/renderPopup.ts`, junto a los otros `ensure*Styles` (tras `ensureMagicFeedbackStyles`), añade:

```ts
// Inyecta (una sola vez) el @font-face de la fuente personalizada.
function ensureFontFace(family: string, url: string) {
    const css = buildFontFaceCss(family, url);
    if (!css) return;
    const STYLE_ID = 'deepdots-font-face';
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
        el = document.createElement('style');
        el.id = STYLE_ID;
        document.head.appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
}
```

- [ ] **Step 3: Aplicar la fuente al contenedor**

En `src/ui/renderPopup.ts`, justo después del bloque que fija `popup.style.cssText = \`...\`;` (creación del `.deepdots-popup`, ~línea 108-120), añade:

```ts
    const font = style?.font;
    if (font?.family) {
        const familyValue = buildFontFamilyValue(font.family);
        // El survey vive dentro del contenedor y hereda esta fuente.
        popup.style.fontFamily = familyValue;
        // La variable habilita que el <h2> (Montserrat por defecto) también la use.
        popup.style.setProperty('--deepdots-font', familyValue);
        if (font.url) ensureFontFace(font.family, font.url);
    }
```

- [ ] **Step 4: Hacer el título sobreescribible en `style.css`**

En `src/assets/style.css:141`, cambia:

```css
    font-family: 'Montserrat';
```

por:

```css
    font-family: var(--deepdots-font, 'Montserrat');
```

- [ ] **Step 5: Build para verificar que compila (incluye CSS embebido)**

Run: `npm run build`
Expected: build OK (CJS + ESM + d.ts), sin errores de tipos.

- [ ] **Step 6: Ejecutar toda la suite web**

Run: `npx vitest run`
Expected: PASS salvo el fallo preexistente ajeno `src/ui/renderPopup.inject-style.test.ts` (documentado en CLAUDE.md). Ningún fallo nuevo.

- [ ] **Step 7: Commit**

```bash
git add src/ui/renderPopup.ts src/assets/style.css
git commit -m "feat(popup): aplica font custom al contenedor + título sobreescribible"
```

---

## Task 6: Verificación E2E del popup web (Playwright)

**Files:**
- Create: `tests/e2e/font.spec.ts`
- Modify: `examples/e2e-tracking.html` (fixture)

Nota: happy-dom no calcula `getComputedStyle` de fuentes de forma fiable; por eso la validación de que la fuente se aplica de verdad va por E2E (mismo patrón que `page_view`, ver CLAUDE.md).

- [ ] **Step 1: Ajustar el fixture para servir un popup con `font`**

En `examples/e2e-tracking.html`, en el mock del `GET /sdk/popups` (o el `mockPopupsApi`/`debugLoadPopups` que use el fixture), añade a la definición del popup un `style: { theme: 'light', position: 'center', font: { family: 'Inter', url: 'https://fonts.gstatic.com/s/inter/v13/Inter.woff2' } }` y asegúrate de que el trigger lo muestre. Sigue el patrón ya presente en el fixture para las otras definiciones.

- [ ] **Step 2: Escribir el test E2E**

Crea `tests/e2e/font.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('la fuente custom se aplica al contenedor del popup', async ({ page }) => {
  await page.goto('http://localhost:5173/examples/e2e-tracking.html');
  // Espera a que el popup se muestre (ajusta el selector/trigger según el fixture).
  await page.waitForSelector('.deepdots-popup', { timeout: 5000 });
  const family = await page.evaluate(() => {
    const el = document.querySelector('.deepdots-popup') as HTMLElement | null;
    return el ? getComputedStyle(el).fontFamily : null;
  });
  expect(family).toContain('Inter');
});
```

- [ ] **Step 3: Ejecutar el E2E**

Run: `npm run e2e -- font.spec.ts`
Expected: PASS en Chromium (`.deepdots-popup` computed `font-family` contiene `Inter`).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/font.spec.ts examples/e2e-tracking.html
git commit -m "test(e2e): la fuente custom se aplica al popup"
```

---

# FASE 2 — KMP (repo `/Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK`)

> Ejecutar en el repo KMP. Mantener PARIDAD EXACTA con la Fase 1: mismos strings de `@font-face` y de `font-family`.

## Task 7: Módulo puro Kotlin `ui/Font.kt` + test de paridad

**Files:**
- Create: `shared/src/commonMain/kotlin/com/deepdots/sdk/ui/Font.kt`
- Test: `shared/src/commonTest/kotlin/com/deepdots/sdk/ui/FontHtmlParityTest.kt`

- [ ] **Step 1: Escribir el test de paridad que falla**

Crea `FontHtmlParityTest.kt`:

```kotlin
package com.deepdots.sdk.ui

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class FontHtmlParityTest {
    @Test fun formatFromExtension() {
        assertEquals("woff2", fontFormatFromUrl("https://x.com/Inter.woff2"))
        assertEquals("truetype", fontFormatFromUrl("https://x.com/Inter.ttf"))
        assertEquals("opentype", fontFormatFromUrl("https://x.com/Inter.otf"))
        assertEquals("woff2", fontFormatFromUrl("https://x.com/Inter.woff2?v=3#a"))
        assertNull(fontFormatFromUrl("https://x.com/Inter.eot"))
    }

    @Test fun familyValueAddsFallback() {
        assertEquals("\"Inter\", -apple-system, system-ui, sans-serif", buildFontFamilyValue("Inter"))
    }

    @Test fun fontFaceCss() {
        assertEquals("", buildFontFaceCss("Inter", null))
        assertEquals(
            "@font-face{font-family:\"Inter\";src:url(\"https://x.com/Inter.woff2\") format(\"woff2\");font-display:swap;}",
            buildFontFaceCss("Inter", "https://x.com/Inter.woff2"),
        )
        assertEquals(
            "@font-face{font-family:\"Inter\";src:url(\"https://x.com/Inter.eot\");font-display:swap;}",
            buildFontFaceCss("Inter", "https://x.com/Inter.eot"),
        )
    }
}
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `./gradlew :shared:testDebugUnitTest --tests "*FontHtmlParityTest*"`
Expected: FAIL de compilación (funciones no definidas).

- [ ] **Step 3: Implementar `ui/Font.kt`**

```kotlin
package com.deepdots.sdk.ui

/**
 * Espejo EXACTO de `src/ui/font.ts` (Web). Cualquier cambio se replica allí.
 */

private val FORMAT_BY_EXT = mapOf(
    "woff2" to "woff2",
    "woff" to "woff",
    "ttf" to "truetype",
    "otf" to "opentype",
)

fun fontFormatFromUrl(url: String): String? {
    val clean = url.substringBefore('?').substringBefore('#')
    val ext = clean.substringAfterLast('.', "").lowercase()
    return FORMAT_BY_EXT[ext]
}

fun buildFontFamilyValue(family: String): String =
    "\"$family\", -apple-system, system-ui, sans-serif"

fun buildFontFaceCss(family: String, url: String?): String {
    if (url == null) return ""
    val fmt = fontFormatFromUrl(url)
    val src = if (fmt != null) "url(\"$url\") format(\"$fmt\")" else "url(\"$url\")"
    return "@font-face{font-family:\"$family\";src:$src;font-display:swap;}"
}
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `./gradlew :shared:testDebugUnitTest --tests "*FontHtmlParityTest*"`
Expected: PASS.

- [ ] **Step 5: Commit (en el repo KMP)**

```bash
git add shared/src/commonMain/kotlin/com/deepdots/sdk/ui/Font.kt shared/src/commonTest/kotlin/com/deepdots/sdk/ui/FontHtmlParityTest.kt
git commit -m "feat(font): helpers puros Kotlin (paridad con Web)"
```

---

## Task 8: Modelo `PopupFont` + cableado en `MagicFeedbackHtml.kt`

**Files:**
- Modify: el fichero de tipos KMP donde vive `PopupStyle` (localizarlo en el Step 1)
- Modify: `shared/src/commonMain/kotlin/com/deepdots/sdk/ui/MagicFeedbackHtml.kt`

- [ ] **Step 1: Localizar `PopupStyle` y `buildMagicFeedbackHtml`**

Run: `grep -rn "PopupStyle\|fun buildMagicFeedbackHtml" shared/src/commonMain`
Expected: la definición del modelo y la firma del builder del HTML.

- [ ] **Step 2: Añadir `PopupFont` y `font` al modelo**

Junto a `PopupStyle` añade:

```kotlin
data class PopupFont(
    val family: String,
    val url: String? = null,
)
```

y en `PopupStyle` añade el campo `val font: PopupFont? = null`. Si `PopupStyle` es `@Serializable`, marca `PopupFont` también `@Serializable`.

- [ ] **Step 3: Escribir el test que falla (HTML del WebView con font)**

En el test existente de `MagicFeedbackHtml` (o uno nuevo `MagicFeedbackHtmlFontTest`), añade un caso que llame a `buildMagicFeedbackHtml` con los mismos argumentos que el test existente MÁS `font = PopupFont("Inter", "https://x.com/Inter.woff2")`, y verifique:

```kotlin
assertTrue(html.contains("@font-face{font-family:\"Inter\""))
assertTrue(html.contains("\"Inter\", -apple-system, system-ui, sans-serif"))
```

Nota: ajusta los parámetros al de la firma real vista en el Step 1. Si hoy `buildMagicFeedbackHtml` no acepta `font`, este test no compila hasta el Step 4.

- [ ] **Step 4: Cablear `font` en `buildMagicFeedbackHtml`**

Añade un parámetro `font: PopupFont? = null` a `buildMagicFeedbackHtml`. Dentro, calcula:

```kotlin
val fontFaceCss = if (font != null) buildFontFaceCss(font.family, font.url) else ""
val fontFamilyCss = if (font != null) buildFontFamilyValue(font.family) else "-apple-system,system-ui,sans-serif"
```

e intégralos en el `<style>` del HTML igual que en Web: prepende `fontFaceCss` y usa `font-family:$fontFamilyCss` en `html,body`. Después, en el/los call-site(s) de `buildMagicFeedbackHtml` (donde se resuelve la identidad del survey), pasa `font = style?.font` tomando el `PopupStyle` del popup que se está mostrando.

- [ ] **Step 5: Ejecutar los tests**

Run: `./gradlew :shared:testDebugUnitTest`
Expected: PASS (incluye `FontHtmlParityTest` y el de HTML).

- [ ] **Step 6: Compilar iOS**

Run: `./gradlew compileKotlinIosSimulatorArm64`
Expected: compila sin errores.

- [ ] **Step 7: Commit (en el repo KMP)**

```bash
git add -A
git commit -m "feat(font): PopupFont en el modelo + @font-face/font-family en el WebView"
```

---

## Cierre

- [ ] **Actualizar CLAUDE.md** (ambos repos): añadir una línea al bloque de "Contexto de trabajo activo" documentando `PopupStyle.font = { family, url? }`, que aplica a popup + survey, que la fuente cae por herencia en web (título vía `var(--deepdots-font, 'Montserrat')`) y por `@font-face`+`font-family` en el WebView (RN + KMP), con paridad `font.ts` <-> `Font.kt`.
- [ ] **Actualizar la doc de integración** (`INTEGRACION-WEB.md` / `INTEGRACION-REACT-NATIVE.md`) con un ejemplo de la definición de popup con `font`.
