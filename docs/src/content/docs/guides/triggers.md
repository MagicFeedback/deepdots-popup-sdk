---
title: Triggers
description: Every way a popup can be launched, with code examples for each one.
---

A **trigger** decides *when* a popup shows. The trigger is configured by your team in Deepdots and delivered to the SDK automatically — you never write trigger definitions in code.

However, depending on the trigger type, your application may need to do something so the trigger can actually fire: render an element with a specific id, emit a custom business event, etc. This page explains each type and shows the **host-side code** required.

## The five trigger types

| Type            | Fires when…                                            | Value semantics                                  |
| --------------- | ------------------------------------------------------ | ------------------------------------------------ |
| `time_on_page`  | The user has been on a page for N seconds.             | `number` — **seconds** on page                   |
| `scroll`        | The user has scrolled N% of the page height.           | `number` — percentage `0–100`                    |
| `click`         | The user clicks an element with a specific DOM id.     | `string` — the element's `id` attribute          |
| `exit`          | The user navigates away from the current route.        | `number` — **seconds** of delay on the next route |
| `event`         | Your application calls `popups.triggerEvent(name)`.    | `string` — the event name                        |

---

## `time_on_page`

Fires after the user has spent a number of seconds on the page.

**Host-side code:** none. As long as the SDK has been initialized and `autoLaunch()` was called, the SDK starts the timer when the page loads.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();
popups.init({ mode: 'server', apiKey: 'YOUR_PUBLIC_API_KEY' });
popups.autoLaunch();
// Time triggers configured in Deepdots will now fire on their own.
```

:::tip
Use `time_on_page` for engagement surveys: "how is this page so far?", NPS after landing, etc.
:::

---

## `scroll`

Fires when the user has scrolled past a given percentage of the page height.

**Host-side code:** none. The SDK attaches its own scroll listener and removes it once the threshold is reached.

```ts
popups.init({ mode: 'server', apiKey: 'YOUR_PUBLIC_API_KEY' });
popups.autoLaunch();
// A scroll trigger configured at 70% in Deepdots fires automatically
// when the user reaches 70% of the page.
```

:::caution
The percentage is measured against `document.documentElement.scrollHeight`. On very short pages or sticky-footer layouts, the user may reach 100% without meaningful interaction. Test before going live.
:::

---

## `click`

Fires when the user clicks a DOM element with a specific `id`.

**Host-side code:** your application must render an element whose `id` matches the value configured in Deepdots.

```html
<!-- Any element with the configured id will trigger the popup -->
<button id="feedback-btn">Give feedback</button>
```

Or, in a framework:

```tsx
// React
<button id="feedback-btn" onClick={handleClick}>
  Give feedback
</button>
```

The SDK attaches a one-shot click listener to the element. Once it fires, the listener is removed automatically.

:::caution
If the element does not yet exist when the trigger is registered, the SDK retries after `DOMContentLoaded`. For elements that mount later (SPAs, modals, lazy components) make sure the id is present in the DOM by the time the user can click it.
:::

---

## `exit`

Queues a popup to appear on the **next** route after the user leaves the current one. Useful for "before you go" surveys without blocking navigation.

**Host-side code:** none for standard SPA navigation. The SDK monkey-patches `history.pushState` / `history.replaceState` and listens to `popstate`, `hashchange`, and same-origin link clicks. Any normal client-side route change is detected.

```ts
popups.init({ mode: 'server', apiKey: 'YOUR_PUBLIC_API_KEY' });
popups.autoLaunch();
// When the user navigates away from a targeted route,
// the popup is queued and shown on the next route after the configured delay.
```

How it works in practice:

1. The user is on `/pricing` (where an exit trigger is targeted).
2. The user clicks a link to `/features`.
3. The SDK queues the popup in `sessionStorage`.
4. On `/features`, after the delay configured in Deepdots, the popup appears.

:::tip
This is the recommended pattern for "before you leave the pricing page" surveys — it preserves the user's intent without breaking their navigation.
:::

---

## `event`

Fires when your application emits a custom business event by name. **This is the trigger type you will use most often in code.**

**Host-side code:** call `popups.triggerEvent(eventName)` whenever the business condition is met. The event name must match exactly the value configured for the trigger in Deepdots.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();
popups.init({ mode: 'server', apiKey: 'YOUR_PUBLIC_API_KEY' });
popups.autoLaunch();

// Later, when something interesting happens in your app:
function onCheckoutCompleted() {
  popups.triggerEvent('checkout_completed');
}

function onSearchAttempted(query: string) {
  if (searchAttempts >= 3) {
    popups.triggerEvent('search_no_results');
  }
}
```

### Example: React

```tsx
function CheckoutButton({ popups }: { popups: DeepdotsPopups }) {
  return (
    <button
      onClick={async () => {
        await placeOrder();
        popups.triggerEvent('checkout_completed');
      }}
    >
      Pay
    </button>
  );
}
```

### Example: Vanilla JS in any flow

```js
async function submitContactForm(data) {
  const ok = await api.submit(data);
  if (ok) {
    popups.triggerEvent('contact_form_sent');
  }
}
```

:::tip
Event triggers give you the most control. Use them for any popup that should fire after a specific business outcome — purchase, signup, plan upgrade, repeated failed action, etc.
:::

:::caution
Event names are matched literally. `'CheckoutCompleted'` is **not** the same as `'checkout_completed'`. Agree on a naming convention (we recommend lowercase snake_case) with the team that configures popups in Deepdots.
:::

---

## Multiple triggers on the same popup

A popup in Deepdots can have more than one trigger. Any of them firing will show the popup (subject to cooldowns and route targeting). For example: a popup might be configured to fire after 30 seconds **or** when the user emits `cart_abandoned`, whichever happens first.

You don't need to do anything special in code — just make sure your application provides the right host signals (mounting the click target id, calling `triggerEvent`, etc.) for every trigger type the popup uses.

---

## Manually showing a popup outside any trigger

If you need to bypass triggers entirely — for example, a "Feedback" button always available in the footer — call `show()` or `showByPopupId()` directly:

```ts
popups.show({
  surveyId: 'survey-feedback-001',
  productId: 'product-main',
});

// Or, if you know the popup id from Deepdots:
popups.showByPopupId('popup-footer-feedback');
```

Cooldowns and route targeting are still respected.
