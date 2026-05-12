---
title: API
description: Offentlige metoder du vil bruge fra din applikation.
---

Dette er de offentlige metoder på `DeepdotsPopups`-klassen. De dækker alt, hvad en host-applikation har brug for til at montere SDK'et, reagere på popups og udløse forretnings-events.

## `init(config)`

Initialiserer SDK'et og henter popup-definitionerne fra Deepdots.

```ts
popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  userId: 'customer-123', // valgfrit
});
```

| Felt     | Påkrævet | Beskrivelse                                                  |
| -------- | -------- | ------------------------------------------------------------ |
| `mode`   | ja       | Altid `'server'` for kundeintegrationer.                     |
| `apiKey` | ja       | Din offentlige Deepdots-API-nøgle.                           |
| `userId` | nej      | Identifikator sendt med hver popup-event.                    |

## `autoLaunch()`

Starter de triggers, der er afledt af definitionerne indlæst under `init()`. Kald én gang efter `init()`.

```ts
popups.autoLaunch();
```

## `triggerEvent(eventName)`

Udløser en brugerdefineret forretnings-event. Enhver popup i Deepdots konfigureret med en event-trigger, der matcher `eventName`, vises (med forbehold for cooldowns og targeting).

```ts
popups.triggerEvent('checkout_completed');
```

Se [Triggers → event](/da/guides/triggers/#event) for detaljer.

## `show({ surveyId, productId })`

Viser en popup direkte og omgår triggers. Cooldowns og rute-targeting respekteres stadig.

```ts
popups.show({
  surveyId: 'survey-home-001',
  productId: 'product-main',
});
```

## `showByPopupId(popupId)`

Samme som `show()`, men du adresserer popup'en med dens Deepdots-`id` i stedet for survey/product-parret.

```ts
popups.showByPopupId('popup-home-5s');
```

## `on(event, listener)` / `off(event, listener)`

Abonnér på SDK-events: `popup_shown`, `popup_clicked`, `survey_completed`.

```ts
const onShown = (event) => analytics.track('popup_shown', event);

popups.on('popup_shown', onShown);
popups.off('popup_shown', onShown);
```

Se [Events](/da/guides/events/) for den fulde payload-form.
