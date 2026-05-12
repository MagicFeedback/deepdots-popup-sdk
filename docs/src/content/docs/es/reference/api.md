---
title: API
description: Métodos públicos que usarás desde tu aplicación.
---

Estos son los métodos públicos de la clase `DeepdotsPopups`. Cubren todo lo que una aplicación host necesita para montar el SDK, reaccionar a los popups y lanzar eventos de negocio.

## `init(config)`

Inicializa el SDK y carga las definiciones de popup desde Deepdots.

```ts
popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  userId: 'customer-123', // opcional
});
```

| Campo    | Obligatorio | Descripción                                              |
| -------- | ----------- | -------------------------------------------------------- |
| `mode`   | sí          | Siempre `'server'` en integraciones de cliente.          |
| `apiKey` | sí          | Tu API key pública de Deepdots.                          |
| `userId` | no          | Identificador enviado con cada evento de popup.          |

## `autoLaunch()`

Arranca los triggers derivados de las definiciones cargadas durante `init()`. Llámalo una vez después de `init()`.

```ts
popups.autoLaunch();
```

## `triggerEvent(eventName)`

Lanza un evento de negocio personalizado. Cualquier popup en Deepdots configurado con un trigger de tipo `event` cuyo nombre coincida con `eventName` se mostrará (respetando cooldowns y segmentación).

```ts
popups.triggerEvent('checkout_completed');
```

Consulta [Triggers → event](/es/guides/triggers/#event) para más detalles.

## `show({ surveyId, productId })`

Muestra un popup directamente, saltándose los triggers. Los cooldowns y la segmentación por ruta se siguen respetando.

```ts
popups.show({
  surveyId: 'survey-home-001',
  productId: 'product-main',
});
```

## `showByPopupId(popupId)`

Igual que `show()`, pero direccionando el popup por su `id` de Deepdots en lugar de por el par survey/product.

```ts
popups.showByPopupId('popup-home-5s');
```

## `on(event, listener)` / `off(event, listener)`

Suscríbete a los eventos del SDK: `popup_shown`, `popup_clicked`, `survey_completed`.

```ts
const onShown = (event) => analytics.track('popup_shown', event);

popups.on('popup_shown', onShown);
popups.off('popup_shown', onShown);
```

Mira [Events](/es/guides/events/) para el payload completo.
