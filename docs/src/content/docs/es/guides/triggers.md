---
title: Triggers
description: Todas las formas en que un popup puede dispararse, con ejemplos de código para cada una.
---

Un **trigger** decide *cuándo* aparece un popup. El trigger lo configura tu equipo en Deepdots y se entrega al SDK automáticamente — nunca escribes definiciones de trigger en código.

Sin embargo, según el tipo de trigger, tu aplicación puede tener que hacer algo para que pueda dispararse: renderizar un elemento con un id concreto, emitir un evento de negocio, etc. Esta página explica cada tipo y muestra el **código del lado del host** necesario.

## Los cinco tipos de trigger

| Tipo            | Se dispara cuando…                                       | Semántica de `value`                                |
| --------------- | -------------------------------------------------------- | --------------------------------------------------- |
| `time_on_page`  | El usuario lleva N segundos en la página.                | `number` — **segundos** en página                   |
| `scroll`        | El usuario ha scrolleado el N% del alto de la página.    | `number` — porcentaje `0–100`                       |
| `click`         | El usuario hace click en un elemento con un id concreto. | `string` — el atributo `id` del elemento            |
| `exit`          | El usuario navega fuera de la ruta actual.               | `number` — **segundos** de retraso en la ruta siguiente |
| `event`         | Tu aplicación llama a `popups.triggerEvent(name)`.       | `string` — el nombre del evento                     |

---

## `time_on_page`

Se dispara cuando el usuario lleva N segundos en la página.

**Código en tu app:** ninguno. Mientras el SDK esté inicializado y se haya llamado a `autoLaunch()`, el SDK arranca el temporizador al cargar la página.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();
popups.init({ mode: 'server', apiKey: 'YOUR_PUBLIC_API_KEY' });
popups.autoLaunch();
// Los triggers de tiempo configurados en Deepdots se disparan solos.
```

:::tip
Usa `time_on_page` para encuestas de engagement: "¿qué tal esta página?", NPS al aterrizar, etc.
:::

---

## `scroll`

Se dispara cuando el usuario ha scrolleado por encima de un porcentaje del alto de la página.

**Código en tu app:** ninguno. El SDK añade su propio listener de scroll y lo retira en cuanto se alcanza el umbral.

```ts
popups.init({ mode: 'server', apiKey: 'YOUR_PUBLIC_API_KEY' });
popups.autoLaunch();
// Un trigger de scroll configurado al 70% en Deepdots se dispara
// automáticamente cuando el usuario llega al 70% de la página.
```

:::caution
El porcentaje se mide contra `document.documentElement.scrollHeight`. En páginas muy cortas o con footer sticky, el usuario puede llegar al 100% sin interacción real. Pruébalo antes de poner en producción.
:::

---

## `click`

Se dispara cuando el usuario hace click sobre un elemento del DOM con un `id` concreto.

**Código en tu app:** tu aplicación debe renderizar un elemento cuyo `id` coincida con el valor configurado en Deepdots.

```html
<!-- Cualquier elemento con el id configurado disparará el popup -->
<button id="feedback-btn">Enviar feedback</button>
```

O, en un framework:

```tsx
// React
<button id="feedback-btn" onClick={handleClick}>
  Enviar feedback
</button>
```

El SDK adjunta un listener de un solo uso al elemento. Una vez se dispara, el listener se quita automáticamente.

:::caution
Si el elemento todavía no existe cuando se registra el trigger, el SDK reintenta tras `DOMContentLoaded`. Para elementos que se montan más tarde (SPAs, modales, lazy components) asegúrate de que el id esté en el DOM cuando el usuario pueda hacer click.
:::

---

## `exit`

Programa un popup para que aparezca en la **siguiente** ruta después de que el usuario salga de la actual. Útil para encuestas "antes de irte" sin bloquear la navegación.

**Código en tu app:** ninguno para navegación SPA estándar. El SDK parchea `history.pushState` / `history.replaceState` y escucha `popstate`, `hashchange` y clicks en enlaces del mismo origen. Cualquier cambio de ruta cliente normal queda detectado.

```ts
popups.init({ mode: 'server', apiKey: 'YOUR_PUBLIC_API_KEY' });
popups.autoLaunch();
// Cuando el usuario navega fuera de una ruta segmentada,
// el popup se encola y se muestra en la siguiente ruta tras el retraso configurado.
```

Cómo funciona en la práctica:

1. El usuario está en `/precios` (donde hay un exit trigger segmentado).
2. El usuario hace click en un enlace hacia `/funcionalidades`.
3. El SDK encola el popup en `sessionStorage`.
4. En `/funcionalidades`, tras el retraso configurado en Deepdots, aparece el popup.

:::tip
Es el patrón recomendado para encuestas "antes de salir de precios" — respeta la intención del usuario sin romper su navegación.
:::

---

## `event`

Se dispara cuando tu aplicación emite un evento de negocio por nombre. **Es el tipo de trigger que usarás más a menudo en código.**

**Código en tu app:** llama a `popups.triggerEvent(eventName)` cuando se cumpla la condición de negocio. El nombre del evento debe coincidir exactamente con el valor configurado para el trigger en Deepdots.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();
popups.init({ mode: 'server', apiKey: 'YOUR_PUBLIC_API_KEY' });
popups.autoLaunch();

// Después, cuando ocurre algo relevante en tu app:
function onCheckoutCompleted() {
  popups.triggerEvent('checkout_completed');
}

function onSearchAttempted(query: string) {
  if (searchAttempts >= 3) {
    popups.triggerEvent('search_no_results');
  }
}
```

### Ejemplo: React

```tsx
function CheckoutButton({ popups }: { popups: DeepdotsPopups }) {
  return (
    <button
      onClick={async () => {
        await placeOrder();
        popups.triggerEvent('checkout_completed');
      }}
    >
      Pagar
    </button>
  );
}
```

### Ejemplo: JS plano en cualquier flujo

```js
async function submitContactForm(data) {
  const ok = await api.submit(data);
  if (ok) {
    popups.triggerEvent('contact_form_sent');
  }
}
```

:::tip
Los triggers de tipo `event` te dan el máximo control. Úsalos para cualquier popup que deba dispararse tras un resultado de negocio: compra, registro, upgrade de plan, fallo repetido, etc.
:::

:::caution
Los nombres de evento se comparan literalmente. `'CheckoutCompleted'` **no** es lo mismo que `'checkout_completed'`. Acuerda una convención de nombres (recomendamos lowercase snake_case) con el equipo que configura popups en Deepdots.
:::

---

## Varios triggers en el mismo popup

Un popup en Deepdots puede tener más de un trigger. Cualquiera de ellos al dispararse mostrará el popup (sujeto a cooldowns y a segmentación por ruta). Por ejemplo: un popup puede estar configurado para dispararse tras 30 segundos **o** cuando el usuario emita `cart_abandoned`, lo que ocurra antes.

No tienes que hacer nada especial en código — solo asegúrate de que tu aplicación aporta las señales del host (montar el id del elemento clicable, llamar a `triggerEvent`, etc.) para cada tipo de trigger que use el popup.

---

## Mostrar un popup manualmente sin pasar por triggers

Si necesitas saltarte los triggers — por ejemplo, un botón "Feedback" siempre disponible en el footer — llama a `show()` o `showByPopupId()` directamente:

```ts
popups.show({
  surveyId: 'survey-feedback-001',
  productId: 'product-main',
});

// O, si conoces el popup id de Deepdots:
popups.showByPopupId('popup-footer-feedback');
```

Los cooldowns y la segmentación por ruta se siguen respetando.
