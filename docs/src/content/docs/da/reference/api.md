---
title: API
description: De vigtigste offentlige metoder i SDK'et.
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

Starter triggerne der afledes af definitionerne indlæst under `init()`.

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

## `on()` og `off()`

```ts
const onShown = (event) => console.log(event);

popups.on('popup_shown', onShown);
popups.off('popup_shown', onShown);
```

## `configureTriggers(triggers)`

Denne metode findes, men den er normalt ikke nødvendig, fordi `autoLaunch()` afleder triggerne fra `PopupDefinition`.
