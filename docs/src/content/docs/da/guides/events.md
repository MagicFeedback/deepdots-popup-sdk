---
title: Events
description: Events udsendt af SDK'et og payloaden som hosten modtager.
---

## Events

- `popup_shown`
- `popup_clicked`
- `survey_completed`

## Basistype

```ts
interface DeepdotsEvent {
  type: 'popup_shown' | 'popup_clicked' | 'survey_completed';
  surveyId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}
```

## Abonnement

```ts
const onShown = (event) => console.log(event);

popups.on('popup_shown', onShown);
popups.off('popup_shown', onShown);
```

## Hyppige felter i `data`

- `popupId`
- `action`
- `userId`

## Note om `popup_clicked`

`popup_clicked` er et generelt interaktions-event. Afhængigt af flowet kan `data.action` indeholde værdier som `loaded`, `start_survey`, `manual_send`, `back`, `complete` eller `close_icon`.
