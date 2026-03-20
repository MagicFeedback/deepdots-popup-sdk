---
title: Quickstart
description: First working integration in server mode, plus internal-only notes for client mode.
---

## Server mode

`server` is the recommended mode for production.

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

`client` mode is reserved for internal use. Keep using `server` mode for public integrations and customer-facing implementations.

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

## Common mistakes

:::caution
Do not use `triggers` as a single object. In the current model it is always an array.
:::

:::caution
Do not put `condition` inside the trigger in the current documentation. The current model uses `cooldown` at the `PopupDefinition` level.
:::

:::caution
Treat `client` mode as internal-only documentation. For public implementation guidance, point teams to `server` mode.
:::
