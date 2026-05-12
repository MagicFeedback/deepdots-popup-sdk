---
title: Eksempler
description: Klar-til-kopi kodefragmenter til SDK'ets vigtigste funktioner.
---

Korte, kørbare snippets til det du oftest vil gøre med SDK'et. Alle eksempler antager, at du allerede har installeret pakken:

```bash
npm install @magicfeedback/popup-sdk
```

## Minimal opsætning

Den kortest mulige integration: initialisér, auto-launch, færdig.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();

popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
});

popups.autoLaunch();
```

## Identificér brugeren

Send et `userId`, så popup-events bliver knyttet til brugeren i din analytics og i Deepdots.

```ts
popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  userId: 'customer-123',
});
```

## Abonnér på popup-events

Spor popup-interaktioner i dit analytics-værktøj.

```ts
popups.on('popup_shown', (event) => {
  analytics.track('popup_shown', {
    surveyId: event.surveyId,
    popupId: event.data?.popupId,
  });
});

popups.on('survey_completed', (event) => {
  analytics.track('survey_completed', {
    surveyId: event.surveyId,
    answers: event.data,
  });
});
```

Afmeld dig, når du ikke længere har brug for listeneren:

```ts
const onShown = (event) => console.log(event);

popups.on('popup_shown', onShown);
// senere…
popups.off('popup_shown', onShown);
```

## Udløs en forretnings-event

Til popups konfigureret i Deepdots med en `event`-trigger.

```ts
async function placeOrder(cart) {
  await api.checkout(cart);
  popups.triggerEvent('checkout_completed');
}

function onSearchAttempt(searchAttempts) {
  if (searchAttempts >= 3) {
    popups.triggerEvent('search_no_results');
  }
}
```

## Vis en popup manuelt

Omgå triggers helt — nyttigt til en permanent "Feedback"-knap.

```ts
document.getElementById('feedback-btn')?.addEventListener('click', () => {
  popups.show({
    surveyId: 'survey-feedback-001',
    productId: 'product-main',
  });
});
```

## Vis en popup ud fra dens Deepdots-id

Når du kender popup-id'et fra Deepdots-dashboardet.

```ts
popups.showByPopupId('popup-footer-feedback');
```

## Fuldt eksempel: feedback-knap med analytics

Det hele samlet.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();

popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  userId: currentUser.id,
});

popups.on('popup_shown', (event) => {
  analytics.track('popup_shown', event);
});

popups.on('survey_completed', (event) => {
  analytics.track('survey_completed', event);
});

popups.autoLaunch();

document.getElementById('feedback-btn')?.addEventListener('click', () => {
  popups.showByPopupId('popup-footer-feedback');
});
```

## Live demo

Den offentlige demo kører SDK'et i server mode mod en rigtig Deepdots-konto.

[Åbn live-demoen](https://docs.deepdots.com/demo/).

## Reference-integrationer i dette repository

For integratorer der vil se sammenhængen, leveres repository'et med nogle minimale HTML-eksempler:

- `examples/index.html` — grundlæggende side med tids- og event-triggers.
- `examples/product.html` — exit-trigger på tværs af rute-skift.
- `examples/clients/casino/index.html` — brugerdefinerede forretnings-event-triggers drevet af `triggerEvent`.

Kør dem lokalt:

```bash
npm install
npm run build
python3 -m http.server 4173
```

:::tip
For framework-specifikke integrationer, se [React](/da/reference/react/) og [React Native](/da/reference/react-native/).
:::
