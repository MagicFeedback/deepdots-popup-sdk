---
title: API
description: Public methods you will use from your application code.
---

These are the public methods of the `DeepdotsPopups` class. They cover everything a host application needs to mount the SDK, react to popups, and fire business events.

## `init(config)`

Initializes the SDK and fetches the popup definitions from Deepdots.

```ts
popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  userId: 'customer-123', // optional
});
```

| Field    | Required | Description                                              |
| -------- | -------- | -------------------------------------------------------- |
| `mode`   | yes      | Always `'server'` for customer integrations.             |
| `apiKey` | yes      | Your Deepdots public API key.                            |
| `userId` | no       | Identifier sent with every popup event.                  |

## `autoLaunch()`

Starts the triggers derived from the definitions loaded during `init()`. Call once after `init()`.

```ts
popups.autoLaunch();
```

## `triggerEvent(eventName)`

Fires a custom business event. Any popup in Deepdots configured with an event trigger that matches `eventName` will be shown (subject to cooldowns and targeting).

```ts
popups.triggerEvent('checkout_completed');
```

See [Triggers → event](/guides/triggers/#event) for details.

## `show({ surveyId, productId })`

Shows a popup directly, bypassing triggers. Cooldowns and route targeting are still respected.

```ts
popups.show({
  surveyId: 'survey-home-001',
  productId: 'product-main',
});
```

## `showByPopupId(popupId)`

Same as `show()`, but you address the popup by its Deepdots `id` instead of its survey/product pair.

```ts
popups.showByPopupId('popup-home-5s');
```

## `on(event, listener)` / `off(event, listener)`

Subscribe to the SDK events: `popup_shown`, `popup_clicked`, `survey_completed`.

```ts
const onShown = (event) => analytics.track('popup_shown', event);

popups.on('popup_shown', onShown);
popups.off('popup_shown', onShown);
```

See [Events](/guides/events/) for the full payload shape.
