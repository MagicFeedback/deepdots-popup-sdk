---
title: Ejemplos
description: Fragmentos de código listos para copiar y pegar para las funciones principales del SDK.
---

Snippets cortos y ejecutables para lo que harás más a menudo con el SDK. Todos los ejemplos asumen que ya tienes el paquete instalado:

```bash
npm install @magicfeedback/popup-sdk
```

## Configuración mínima

La integración más corta posible: inicializar, auto-launch, listo.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();

popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
});

popups.autoLaunch();
```

## Identificar al usuario

Pasa un `userId` para que los eventos de popup queden vinculados al usuario en tu analítica y en Deepdots.

```ts
popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  userId: 'customer-123',
});
```

## Suscribirse a los eventos del popup

Registra las interacciones con los popups en tu herramienta de analítica.

```ts
popups.on('popup_shown', (event) => {
  analytics.track('popup_shown', {
    surveyId: event.surveyId,
    popupId: event.data?.popupId,
  });
});

popups.on('survey_completed', (event) => {
  analytics.track('survey_completed', {
    surveyId: event.surveyId,
    answers: event.data,
  });
});
```

Desuscríbete cuando ya no necesites el listener:

```ts
const onShown = (event) => console.log(event);

popups.on('popup_shown', onShown);
// más tarde…
popups.off('popup_shown', onShown);
```

## Lanzar un evento de negocio

Para los popups configurados en Deepdots con un trigger de tipo `event`.

```ts
async function placeOrder(cart) {
  await api.checkout(cart);
  popups.triggerEvent('checkout_completed');
}

function onSearchAttempt(searchAttempts) {
  if (searchAttempts >= 3) {
    popups.triggerEvent('search_no_results');
  }
}
```

## Mostrar un popup manualmente

Sáltate los triggers — útil para un botón permanente de "Feedback".

```ts
document.getElementById('feedback-btn')?.addEventListener('click', () => {
  popups.show({
    surveyId: 'survey-feedback-001',
    productId: 'product-main',
  });
});
```

## Mostrar un popup por su id de Deepdots

Cuando conoces el id del popup desde el panel de Deepdots.

```ts
popups.showByPopupId('popup-footer-feedback');
```

## Ejemplo completo: botón de feedback con analítica

Todo junto.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();

popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  userId: currentUser.id,
});

popups.on('popup_shown', (event) => {
  analytics.track('popup_shown', event);
});

popups.on('survey_completed', (event) => {
  analytics.track('survey_completed', event);
});

popups.autoLaunch();

document.getElementById('feedback-btn')?.addEventListener('click', () => {
  popups.showByPopupId('popup-footer-feedback');
});
```

## Demo en vivo

La demo pública ejecuta el SDK en modo server contra una cuenta real de Deepdots.

[Abrir la demo en vivo](https://docs.deepdots.com/demo/).

## Integraciones de referencia en este repositorio

Para integradores que quieran ver el cableado, el repositorio incluye varios ejemplos HTML mínimos:

- `examples/index.html` — página básica con triggers de tiempo y de evento.
- `examples/product.html` — exit trigger entre cambios de ruta.
- `examples/clients/casino/index.html` — triggers de eventos de negocio personalizados disparados con `triggerEvent`.

Ejecutarlos localmente:

```bash
npm install
npm run build
python3 -m http.server 4173
```

:::tip
Para integraciones específicas de framework, mira [React](/es/reference/react/) y [React Native](/es/reference/react-native/).
:::
