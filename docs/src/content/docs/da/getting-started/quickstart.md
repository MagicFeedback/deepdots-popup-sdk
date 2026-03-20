---
title: Quickstart
description: Første fungerende integration i server mode samt interne noter til client mode.
---

## Server mode

`server` er den anbefalede mode til produktion.

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

`client` mode er reserveret til intern brug. Til offentlige integrationer og kundevendte implementeringer bør I fortsat bruge `server` mode.

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

## Typiske fejl

:::caution
Brug ikke `triggers` som et enkelt objekt. I den nuværende model er det altid et array.
:::

:::caution
Læg ikke `condition` inde i triggeren i ny dokumentation. Den aktuelle model bruger `cooldown` på niveauet `PopupDefinition`.
:::

:::caution
Behandl `client` mode som intern dokumentation. For offentlige integrationsguides bør teams altid henvises til `server` mode.
:::
