---
title: Server vs Client Mode
description: Diferencias operativas entre ambos modos.
---

## Server mode

Usa este modo cuando las definiciones de popup viven en Deepdots y deben descargarse en runtime.

```ts
popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  nodeEnv: 'production',
});
```

Caracteristicas:

- Descarga popups desde la API.
- `autoLaunch()` puede llamarse justo despues de `init()`.
- Los triggers se activan cuando las definiciones remotas ya estan cargadas.

## Client mode

Usa este modo cuando quieres controlar las definiciones desde tu codigo.

```ts
popups.init({
  mode: 'client',
  debug: true,
  popups: popupDefinitions,
});
```

Casos de uso:

- demos locales
- QA
- pruebas sin API
- fallback flows controlados por el host

:::caution
`client` mode queda reservado para uso interno. Las implementaciones publicas deben documentarse y soportarse a traves de `server` mode.
:::
