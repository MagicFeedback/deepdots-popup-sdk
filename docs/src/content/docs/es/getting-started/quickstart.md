---
title: Quickstart
description: Primera integracion funcional en server mode, con notas de client mode solo para uso interno.
---

## Server mode

`server` es el modo recomendado para produccion.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();

popups.init({
  mode: 'server',
  nodeEnv: 'production',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  userId: 'customer-123',
  debug: false,
});

popups.on('popup_shown', (event) => {
  console.log('Popup shown', event);
});

popups.on('survey_completed', (event) => {
  console.log('Survey completed', event);
});

popups.autoLaunch();
```

## Client mode

`client` mode queda reservado para uso interno. Para integraciones publicas y customer-facing, mantened `server` mode como via recomendada.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popupDefinitions = [
  {
    id: 'popup-home-5s',
    title: 'Help us improve',
    message: '<p>Thanks for visiting our homepage.</p>',
    triggers: [{ type: 'time_on_page', value: 5 }],
    cooldown: [
      { answered: 'SHOWED', cooldownDays: 7 },
      { answered: 'COMPLETED', cooldownDays: 30 },
    ],
    actions: {
      accept: {
        label: 'Open survey',
        surveyId: 'survey-home-001',
      },
    },
    surveyId: 'survey-home-001',
    productId: 'product-main',
    segments: {
      path: ['/', '/pricing', '/#/home'],
    },
  },
];

const popups = new DeepdotsPopups();

popups.init({
  mode: 'client',
  debug: true,
  popups: popupDefinitions,
});

popups.autoLaunch();
```

## Errores comunes

:::caution
No uses `triggers` como objeto unico. En el modelo actual siempre es un array.
:::

:::caution
No pongas `condition` dentro del trigger en la documentacion nueva. El modelo actual usa `cooldown` al nivel de `PopupDefinition`.
:::

:::caution
Trata `client` mode como documentacion interna. Para guias publicas de implementacion, dirige siempre a `server` mode.
:::
