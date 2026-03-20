---
title: API
description: Most important public methods in the SDK.
---

## `init(config)`

```ts
popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  userId: 'customer-123',
  nodeEnv: 'production',
  debug: false,
});
```

## `autoLaunch()`

Starts the triggers derived from the definitions loaded during `init()`.

```ts
popups.autoLaunch();
```

## `triggerEvent(eventName)`

```ts
popups.triggerEvent('search');
```

## `show({ surveyId, productId })`

```ts
popups.show({
  surveyId: 'survey-home-001',
  productId: 'product-main',
});
```

## `showByPopupId(popupId)`

```ts
popups.showByPopupId('popup-home-5s');
```

## `markSurveyAnswered(surveyId)`

```ts
popups.markSurveyAnswered('survey-home-001');
```

## `on()` and `off()`

```ts
const onShown = (event) => console.log(event);

popups.on('popup_shown', onShown);
popups.off('popup_shown', onShown);
```

## `configureTriggers(triggers)`

This method exists, but it is usually not needed because `autoLaunch()` derives triggers from `PopupDefinition`.
