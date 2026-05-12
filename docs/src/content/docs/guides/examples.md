---
title: Examples
description: Copy-pasteable code snippets for the most common SDK functions.
---

Short, runnable snippets for the main things you'll do with the SDK. All examples assume you have already installed the package:

```bash
npm install @magicfeedback/popup-sdk
```

## Minimal setup

The shortest possible integration: initialize, auto-launch, done.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();

popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
});

popups.autoLaunch();
```

## Identify the user

Pass a `userId` so popup events are linked to the user in your analytics and in Deepdots.

```ts
popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  userId: 'customer-123',
});
```

## Subscribe to popup events

Track popup interactions in your analytics tool.

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

Unsubscribe when you no longer need the listener:

```ts
const onShown = (event) => console.log(event);

popups.on('popup_shown', onShown);
// later…
popups.off('popup_shown', onShown);
```

## Fire a business event

For popups configured in Deepdots with an `event` trigger.

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

## Show a popup manually

Bypass triggers entirely — useful for a permanent "Feedback" button.

```ts
document.getElementById('feedback-btn')?.addEventListener('click', () => {
  popups.show({
    surveyId: 'survey-feedback-001',
    productId: 'product-main',
  });
});
```

## Show a popup by its Deepdots id

When you know the popup's id from the Deepdots dashboard.

```ts
popups.showByPopupId('popup-footer-feedback');
```

## Full example: feedback button with analytics

Putting it all together.

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

The public demo runs the SDK in server mode against a real Deepdots account.

[Open the live demo](https://docs.deepdots.com/demo/).

## Reference integrations in this repository

For integrators who want to see the wiring, the repository ships a few minimal HTML examples:

- `examples/index.html` — basic page with time and event triggers.
- `examples/product.html` — exit trigger across route changes.
- `examples/clients/casino/index.html` — custom business-event triggers driven by `triggerEvent`.

Run them locally:

```bash
npm install
npm run build
python3 -m http.server 4173
```

:::tip
For framework-specific integrations, see [React](/reference/react/) and [React Native](/reference/react-native/).
:::
