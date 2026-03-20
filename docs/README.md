# Starlight Docs

Esta carpeta contiene la documentacion del SDK en `Starlight`.

## Idiomas

La documentacion esta preparada en:

- ingles como idioma por defecto
- espanol en rutas `/es/...`
- danes en rutas `/da/...`

## Desarrollo local

```bash
npm install
npm run docs:dev
```

Si Astro intenta escribir su configuracion de telemetria fuera del workspace en un entorno restringido, ejecuta:

```bash
ASTRO_TELEMETRY_DISABLED=1 npm run docs:dev
```

## Build local

```bash
ASTRO_TELEMETRY_DISABLED=1 npm run docs:build
```

## Despliegue en Vercel

El repo incluye [vercel.json](/Users/sarias/develop/deepdots-popup-sdk/vercel.json) para que Vercel:

- instale dependencias dentro de `docs/`
- ejecute el build de la app de Starlight
- publique `docs/dist`

La configuracion de Astro intenta resolver `site` automaticamente a partir de `VERCEL_PROJECT_PRODUCTION_URL` o `VERCEL_URL`, para que el sitemap funcione tambien en despliegues de Vercel.

## Despliegue en GitHub Pages

El repo incluye el workflow [docs-gh-pages.yml](/Users/sarias/develop/deepdots-popup-sdk/.github/workflows/docs-gh-pages.yml) para construir y publicar la documentacion automaticamente desde `main`.

Pasos recomendados en GitHub:

- En `Settings > Pages`, selecciona `GitHub Actions` como fuente.
- Haz merge de los cambios a `main`.
- El workflow construira `docs/` y publicara `docs/dist`.

La configuracion de Astro tambien resuelve `site` y `base` para GitHub Pages usando variables del workflow.
