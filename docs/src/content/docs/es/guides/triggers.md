---
title: Triggers
description: Tipos de trigger soportados y como se configuran hoy.
---

## Tipos soportados

- `time_on_page`: muestra el popup tras N segundos.
- `scroll`: muestra el popup al llegar a un porcentaje de scroll.
- `click`: muestra el popup al hacer click en un elemento con un id concreto.
- `exit`: encola el popup al salir de una ruta y lo muestra despues en la siguiente.
- `event`: muestra el popup cuando el host llama a `triggerEvent(name)`.

## Ejemplo

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

## Exit popups

Los exit popups:

- se almacenan en `sessionStorage`
- se programan al abandonar la ruta origen
- solo se muestran si realmente hubo cambio de ruta

## Trigger manual por evento

```ts
popups.triggerEvent('search');
```
