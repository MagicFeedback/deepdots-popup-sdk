---
title: Triggers
description: Understøttede trigger-typer og hvordan de konfigureres i dag.
---

## Understøttede typer

- `time_on_page`: viser popupen efter N sekunder.
- `scroll`: viser popupen ved en bestemt scroll-procent.
- `click`: viser popupen når der klikkes på et element med et bestemt id.
- `exit`: køer popupen når brugeren forlader en rute og viser den bagefter på den næste.
- `event`: viser popupen når hosten kalder `triggerEvent(name)`.

## Eksempel

```ts
const popupDefinition = {
  id: 'popup-search-feedback',
  title: 'Found what you need?',
  message: '<p>Help us improve search results.</p>',
  triggers: [{ type: 'event', value: 'search' }],
  cooldown: [{ answered: 'COMPLETED', cooldownDays: 30 }],
  actions: {
    accept: {
      label: 'Give feedback',
      surveyId: 'survey-search-001',
    },
  },
  surveyId: 'survey-search-001',
  productId: 'product-main',
};
```

## Exit-popups

Exit-popups:

- gemmes i `sessionStorage`
- planlægges når man forlader oprindelsesruten
- vises kun hvis ruten faktisk ændrer sig

## Manuel trigger via event

```ts
popups.triggerEvent('search');
```
