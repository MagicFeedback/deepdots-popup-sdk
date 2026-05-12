---
title: Quickstart
description: Pon el SDK a funcionar en tu producto en tres pasos.
---

El SDK funciona en **modo server**: tus popups, triggers y segmentación viven en Deepdots y se cargan en tiempo de ejecución. Solo tienes que montar el SDK, darle tu API key y arrancarlo.

## 1. Instalación

```bash
npm install @magicfeedback/popup-sdk
```

## 2. Inicialización y auto-launch

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();

popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  userId: 'customer-123', // opcional — tu identificador interno de usuario
});

popups.autoLaunch();
```

Con esto basta para que los popups aparezcan en los momentos configurados en Deepdots.

## 3. (Opcional) Suscríbete a los eventos

Si quieres registrar las interacciones con los popups en tu analítica, suscríbete a los eventos del SDK.

```ts
popups.on('popup_shown', (event) => analytics.track('popup_shown', event));
popups.on('survey_completed', (event) => analytics.track('survey_completed', event));
```

## 4. (Opcional) Lanza un evento de negocio

Si alguno de tus popups en Deepdots está configurado con un **trigger de tipo event**, lanza ese evento desde tu código cuando se cumpla la condición de negocio.

```ts
popups.triggerEvent('checkout_completed');
```

Consulta [Triggers](/es/guides/triggers/) para la lista completa de tipos de trigger y ejemplos de código.

## Y ya está

No deberías necesitar definir payloads de popup en código. Popups, copys, triggers, cooldowns y segmentación por ruta se gestionan en Deepdots.
