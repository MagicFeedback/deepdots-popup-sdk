---
title: Modo Server
description: El SDK funciona en modo server — los popups se gestionan en Deepdots y se cargan en tiempo de ejecución.
---

El Deepdots Popup SDK funciona en **modo server**. No hay otro modo soportado para integraciones de cliente.

## Qué significa el modo server

- Las definiciones de popup, los copys, los triggers, la segmentación y los cooldowns viven en **Deepdots**.
- El SDK los carga en tiempo de ejecución usando tu `apiKey`.
- Tu código nunca define popups a mano — solo monta el SDK y reacciona a sus eventos.

## Configuración mínima

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();

popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
});

popups.autoLaunch();
```

## Campos opcionales

| Campo    | Tipo     | Por defecto | Qué hace                                                  |
| -------- | -------- | ----------- | --------------------------------------------------------- |
| `userId` | `string` | ninguno     | Se envía con cada evento de popup para identificar al usuario. |

## ¿Por qué no se definen popups en cliente?

Definir popups en tu código repartiría la propiedad de la experiencia entre tu repositorio y Deepdots. El modo server mantiene una única fuente de verdad, de modo que producto, marketing y CS pueden cambiar copys, segmentación y triggers sin necesitar un despliegue por tu parte.
