# Deepdots Documentation — Diseño

**Fecha:** 2026-06-17
**Estado:** Aprobado (pendiente revisión del spec)
**Repo destino:** `git@github.com:MagicFeedback/Deepdots-Documentation.git`
**Carpeta local de trabajo:** `/Users/sarias/develop/Deepdots-Documentation` (ya clonada, vacía)

## Problema

La documentación de los SDKs del ecosistema Deepdots vive hoy dentro del repo del Popup
Web (`deepdots-popup-sdk`) como **dos sitios Astro + Starlight independientes**:

- `docs/` → "Deepdots Popup SDK" (se despliega en Vercel vía `vercel.json`).
- `docs-magicfeedback-sdk/` → "MagicFeedback SDK" (el Surveys SDK).

Además existe un tercer SDK (Popup Nativo KMP) sin docs todavía. Tener la documentación
acoplada al repo del Popup Web dificulta centralizar estilo, reglas y branding, y mezcla
el ciclo de vida de las docs con el del código del SDK.

## Objetivo

Mover toda la documentación a un repo propio y genérico (`Deepdots-Documentation`),
unificada en **un único sitio** con una sección por SDK, y **centralizar el estilo y las
reglas** de redacción en un `CLAUDE.md` del repo nuevo.

## Decisiones cerradas

1. **Arquitectura:** un único sitio Astro + Starlight (no monorepo de sitios separados).
2. **Navegación:** selector de producto (plugin `starlight-sidebar-topics`), un "topic" por SDK.
3. **Deploy:** GitHub Pages vía GitHub Actions. El repo pasará a **público**.
4. **Alcance KMP:** se incluye la sección Popup Nativo desde el principio, con páginas *stub*.
5. **Forma de trabajo:** se construye en la carpeta clonada nueva; **no** se tocan/borran las
   docs de los repos SDK en este trabajo (borrado diferido a un PR posterior, cuando el sitio
   nuevo despliegue correctamente).

## Arquitectura

### Stack

- Astro + `@astrojs/starlight` (mismo stack actual → migración casi copy-paste).
- Plugin `starlight-sidebar-topics` para el selector de producto.
- i18n nativo de Starlight: **inglés = fuente de verdad** en `root`, `es/` y `da/` como espejos.

### Estructura de contenido

```
src/content/docs/
├── index.md                    landing: "elige tu SDK" (tarjetas a cada topic)
├── popup-web/                  ← migrado desde docs/
│   ├── getting-started/  guides/  reference/
├── popup-native/               ← NUEVO (stubs KMP Android+iOS)
│   ├── getting-started/  guides/  reference/
├── surveys/                    ← migrado desde docs-magicfeedback-sdk/
│   ├── getting-started/  guides/  reference/
├── es/   (espejo es de los 3 topics)
└── da/   (espejo da de los 3 topics)
```

Cada topic define su propio sidebar (Getting Started / Guides / Reference). El selector
de producto conmuta entre topics. La estructura interna de cada SDK respeta la que ya
existe en sus docs actuales.

### Branding centralizado

Un único `astro.config.mjs`: título "Deepdots Documentation", logo/favicon comunes,
los tres locales, configuración de topics y `social` enlazando a los tres repos de SDK.
CSS/theme común compartido por los tres productos.

### Deploy

GitHub Actions → GitHub Pages.
- `site: https://magicfeedback.github.io`, `base: /Deepdots-Documentation`.
- Alternativa futura: CNAME `docs.deepdots.com` (sin `base`).
- Se reaprovecha como base el workflow `docs-gh-pages.yml` ya existente.

## CLAUDE.md del repo nuevo (reglas centralizadas)

El `CLAUDE.md` debe fijar:

- **Comandos y stack:** `npm run dev` / `build` / `preview`; versión de Astro/Starlight.
- **Dónde vive cada SDK** y **cómo añadir un SDK nuevo**: crear topic + sus 3 secciones +
  espejos `es/` y `da/`, registrar el topic en config.
- **Reglas i18n:** inglés es la fuente; `es/` y `da/` deben espejar la estructura de árbol,
  nunca divergir en ficheros.
- **Estilo y voz:** tono, terminología consistente (nombres de producto, `publicKey`/`apiKey`,
  URLs backend prod `https://api.deepdots.com` / dev `https://api-dev.deepdots.com`), uso de
  componentes Starlight (Tabs, Aside, Steps, Card), convención de bloques de código.
- **Mapa del ecosistema:** versión recortada del que existe en `deepdots-popup-sdk/CLAUDE.md`.
- **Enlaces/cross-references** entre productos.

## Plan de migración (alto nivel)

1. Scaffold del sitio único en la carpeta clonada + plugin de topics.
2. Migrar `docs/**` → `popup-web/**` y `docs-magicfeedback-sdk/**` → `surveys/**` (con es/da).
3. Crear stubs de `popup-native/**` (en/es/da).
4. Unificar `astro.config.mjs` + branding + workflow de GitHub Pages.
5. Escribir `CLAUDE.md`.
6. **Verificar:** `astro build` limpio (detecta enlaces internos rotos), dev server,
   comprobar selector de producto y los tres idiomas.
7. Commit + push al repo nuevo; activar GitHub Pages (repo público).

## Fuera de alcance (este trabajo)

- Borrar `docs/` y `docs-magicfeedback-sdk/` del repo `deepdots-popup-sdk` (y equivalentes en
  el repo de Surveys). Se hará en un PR posterior, una vez el sitio nuevo despliegue bien,
  dejando un puntero en los README a la nueva documentación.
- Redactar contenido real del SDK Nativo KMP (solo stubs en este trabajo).
- Configurar el CNAME `docs.deepdots.com` (queda como mejora futura).

## Verificación / criterios de éxito

- `astro build` termina sin errores ni enlaces internos rotos.
- El dev server muestra los 3 topics, el selector de producto funciona y los 3 idiomas
  (en/es/da) están presentes en cada topic.
- El contenido migrado es idéntico al original (sin pérdida de páginas).
- GitHub Pages publica el sitio.
