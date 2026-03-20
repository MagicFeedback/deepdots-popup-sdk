---
title: Events
description: Events emitted by the SDK and the payload received by the host.
---

## Events

- `popup_shown`
- `popup_clicked`
- `survey_completed`

## Base type

```ts
interface DeepdotsEvent {
  type: 'popup_shown' | 'popup_clicked' | 'survey_completed';
  surveyId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}
```

## Subscription

```ts
const onShown = (event) => console.log(event);

popups.on('popup_shown', onShown);
popups.off('popup_shown', onShown);
```

## Common fields in `data`

- `popupId`
- `action`
- `userId`

## Note on `popup_clicked`

`popup_clicked` is a general interaction event. Depending on the flow, `data.action` can include values such as `loaded`, `start_survey`, `manual_send`, `back`, `complete`, or `close_icon`.
