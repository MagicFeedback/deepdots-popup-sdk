---
title: Instalacion
description: Como instalar el SDK y preparar el entorno de desarrollo.
---

## Instalar el paquete

```bash
npm install @magicfeedback/popup-sdk
```

## Requisitos

- Navegador moderno con soporte ES2015+.
- `fetch`.
- `sessionStorage` para la cola de exit popups.

## Entornos

- `nodeEnv: 'production'` usa `https://api.deepdots.com`.
- `nodeEnv: 'development'` usa `https://api-dev.deepdots.com`.

## Nota sobre SSR

En entornos sin `window` o `document`, el SDK cae en un renderer no operativo para no romper el renderizado del host.
