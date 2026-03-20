---
title: Examples
description: Ejemplos reales incluidos en el repositorio.
---

## Ejemplos disponibles

- `examples/index.html`
- `examples/product.html`
- `examples/demo.html`
- `examples/clients/casino/index.html`

## Demo publicada

El despliegue publico en GitHub Pages publica la demo customer-facing en [`/demo/`](../../../demo/).

El sandbox interno de `client` mode en `examples/demo.html` no se publica a proposito.

## Que demuestra cada uno

- `examples/index.html` y `examples/product.html`: integracion web remota y exit popups entre rutas.
- `examples/demo.html`: `client` mode de uso interno con definiciones inline.
- `examples/clients/casino/index.html`: `triggerEvent` basado en eventos de negocio del host.

## Ejecutarlos localmente

```bash
npm install
npm run build
python3 -m http.server 4173
```

Luego abre:

- `http://localhost:4173/examples/index.html`
- `http://localhost:4173/examples/product.html`
- `http://localhost:4173/examples/demo.html`
- `http://localhost:4173/examples/clients/casino/index.html`
