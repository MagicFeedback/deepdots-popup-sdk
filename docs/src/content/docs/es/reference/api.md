---
title: API
description: Metodos publicos mas importantes del SDK.
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

Arranca los triggers derivados de las definiciones cargadas durante `init()`.

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

## `on()` y `off()`

```ts
const onShown = (event) => console.log(event);

popups.on('popup_shown', onShown);
popups.off('popup_shown', onShown);
```

## `configureTriggers(triggers)`

Este metodo existe, pero normalmente no hace falta usarlo porque `autoLaunch()` deriva los triggers desde `PopupDefinition`.
