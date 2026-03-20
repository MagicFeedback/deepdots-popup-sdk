---
title: Triggers
description: Supported trigger types and how they are configured today.
---

## Supported types

- `time_on_page`: shows the popup after N seconds.
- `scroll`: shows the popup after reaching a scroll percentage.
- `click`: shows the popup after clicking an element with a specific id.
- `exit`: queues the popup when leaving a route and shows it later on the next one.
- `event`: shows the popup when the host calls `triggerEvent(name)`.

## Example

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

Exit popups:

- are stored in `sessionStorage`
- are scheduled when leaving the source route
- are only shown if the route actually changed

## Manual event trigger

```ts
popups.triggerEvent('search');
```
