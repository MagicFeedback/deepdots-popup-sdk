---
title: Events
description: Eventos emitidos por el SDK y el payload que recibe el host.
---

## Eventos

- `popup_shown`
- `popup_clicked`
- `survey_completed`

## Tipo base

```ts
interface DeepdotsEvent {
  type: 'popup_shown' | 'popup_clicked' | 'survey_completed';
  surveyId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}
```

## Suscripcion

```ts
const onShown = (event) => console.log(event);

popups.on('popup_shown', onShown);
popups.off('popup_shown', onShown);
```

## Datos frecuentes en `data`

- `popupId`
- `action`
- `userId`

## Nota sobre `popup_clicked`

`popup_clicked` es un evento de interaccion general. Dependiendo del flujo, `data.action` puede incluir valores como `loaded`, `start_survey`, `manual_send`, `back`, `complete` o `close_icon`.
