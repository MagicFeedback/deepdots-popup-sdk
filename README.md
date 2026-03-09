# MagicFeedback Popup SDK

TypeScript SDK for loading and displaying MagicFeedback surveys as popups in browser apps.

Package name: `@magicfeedback/popup-sdk`

## What It Does

- Loads popup definitions from the Deepdots API (`server` mode) or from inline definitions (`client` mode)
- Triggers popups by time on page, scroll depth, click, route exit, or host-driven events
- Emits lifecycle events so the host app can track popup activity
- Supports route targeting through `segments.path`
- Falls back to a no-op renderer outside the browser

## Installation

```bash
npm install @magicfeedback/popup-sdk
```

## Recommended Setup

`server` mode is the recommended setup for real client integrations. Popup definitions are managed remotely and the SDK fetches them at runtime.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();

popups.init({
  mode: 'server',
  nodeEnv: 'production',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  userId: 'customer-123',
  debug: false,
});

popups.on('popup_shown', (event) => {
  console.log('Popup shown', event);
});

popups.on('survey_completed', (event) => {
  console.log('Survey completed', event);
});

popups.autoLaunch();
```

Notes:

- `mode: 'server'` fetches popup definitions from Deepdots.
- `nodeEnv: 'production'` uses `https://api.deepdots.com`.
- `nodeEnv: 'development'` uses `https://api-dev.deepdots.com`.
- `userId` is optional, but recommended when popups are targeted per user.
- `autoLaunch()` can be called immediately after `init()`. In `server` mode, the SDK waits until remote popups are loaded.

## When To Use Each Mode

- `server`: production integrations where popup definitions are managed remotely.
- `client`: local demos, QA, hardcoded fallback flows, and integration testing without API calls.

## Real Use Cases From `examples/`

### 1. Remote website integration

Files:

- `examples/index.html`
- `examples/product.html`
- `examples/demo-sdk.js`

This flow initializes the SDK in `server` mode, auto-launches popups on page load, and logs popup events in the page UI. It is the closest example to a standard website integration.

### 2. Host-driven business event trigger

Files:

- `examples/clients/casino/sdk.js`
- `examples/clients/casino/sdk-trigger-event-example.js`

This flow tracks search behavior in the host app and calls:

```ts
sdk.triggerEvent('search');
```

Use this pattern when popup logic depends on product behavior instead of plain DOM triggers. In the casino demo, the popup is shown after repeated searches with low intent signals.

### 3. Route-exit popup after navigation

Files:

- `examples/index.html`
- `examples/product.html`

Exit triggers are queued when the user leaves a matching route and rendered on the next route after the configured delay. This is useful for "before you go" feedback flows that should appear after navigation, not before it.

### 4. Inline client-mode sandbox

File:

- `examples/demo.html`

This example uses local popup definitions and is useful for validating trigger behavior without hitting the API.

## Client Mode Example

Use `client` mode when you want to preload popup definitions yourself.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popupDefinitions = [
  {
    id: 'popup-home-5s',
    title: 'Help us improve',
    message: '<p>Thanks for visiting our homepage.</p>',
    triggers: [
      { type: 'time_on_page', value: 5 },
    ],
    cooldown: [
      { answered: 'SHOWED', cooldownDays: 7 },
      { answered: 'COMPLETED', cooldownDays: 30 },
    ],
    actions: {
      accept: {
        label: 'Open survey',
        surveyId: 'survey-home-001',
      },
    },
    surveyId: 'survey-home-001',
    productId: 'product-main',
    segments: {
      path: ['/', '/pricing', '/#/home'],
    },
  },
];

const popups = new DeepdotsPopups();

popups.init({
  mode: 'client',
  debug: true,
  popups: popupDefinitions,
});

popups.autoLaunch();
```

Important:

- The property name is `triggers`, and it is now an array.
- `time_on_page` values are defined in seconds.
- `segments.path` can contain full URLs, path fragments such as `/pricing`, or hash routes such as `/#/home`.

## API Essentials

### `init(config)`

Initializes the SDK.

```ts
popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  userId: 'customer-123',
  nodeEnv: 'production',
  debug: false,
});
```

Config fields:

- `apiKey?: string`
- `userId?: string`
- `nodeEnv?: 'development' | 'production'`
- `mode?: 'server' | 'client'`
- `debug?: boolean`
- `popups?: PopupDefinition[]`

### `autoLaunch()`

Starts the triggers derived from the popup definitions loaded during `init()`.

```ts
popups.autoLaunch();
```

### `triggerEvent(eventName)`

Shows the first eligible popup whose definition contains:

```ts
triggers: [{ type: 'event', value: eventName }]
```

Example:

```ts
popups.triggerEvent('search');
```

### `show({ surveyId, productId })`

Shows a popup immediately without waiting for a trigger.

```ts
popups.show({
  surveyId: 'survey-home-001',
  productId: 'product-main',
});
```

### `showByPopupId(popupId)`

Shows a popup definition by id. This is useful when multiple popups reuse the same `surveyId`.

```ts
popups.showByPopupId('popup-home-5s');
```

### `markSurveyAnswered(surveyId)`

Marks a survey as answered so cooldown rules like `{ answered: 'COMPLETED', cooldownDays: 30 }` start applying.

```ts
popups.markSurveyAnswered('survey-home-001');
```

### `on(eventType, listener)` / `off(eventType, listener)`

Subscribe or unsubscribe from SDK events.

```ts
const onShown = (event) => console.log(event);

popups.on('popup_shown', onShown);
popups.off('popup_shown', onShown);
```

## Supported Trigger Types

Popup definitions use these trigger types:

- `time_on_page`: shows after N seconds on the page
- `scroll`: shows after reaching a scroll percentage
- `click`: shows after clicking the element with the given DOM id
- `exit`: shows after leaving a matching route and waiting N seconds on the destination route
- `event`: shows when the host app calls `triggerEvent(name)`

## Popup Definition Shape

`client` mode accepts popup definitions with this structure:

```ts
interface PopupDefinition {
  id: string;
  title: string;
  message: string;
  triggers: Array<{
    type: 'time_on_page' | 'scroll' | 'exit' | 'click' | 'event';
    value: number | string;
  }>;
  cooldown?: Array<{
    answered: 'SHOWED' | 'PARTIAL' | 'COMPLETED';
    cooldownDays: number;
  }>;
  actions?: {
    accept?: {
      label: string;
      surveyId: string;
    };
    start?: {
      label: string;
    };
    back?: {
      label: string;
    };
    complete?: {
      label: string;
      surveyId: string;
      autoCompleteParams: Record<string, unknown>;
      cooldownDays?: number;
    };
    decline?: {
      label: string;
      cooldownDays?: number;
    };
  };
  surveyId: string;
  productId: string;
  style?: {
    theme: 'light' | 'dark';
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
    imageUrl: string | null;
  };
  segments?: {
    path?: string[];
    [key: string]: unknown;
  };
}
```

## Events

The SDK emits:

- `popup_shown`
- `popup_clicked`
- `survey_completed`

Payload:

```ts
interface DeepdotsEvent {
  type: 'popup_shown' | 'popup_clicked' | 'survey_completed';
  surveyId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}
```

`data` often contains values such as:

- `popupId`
- `action`
- `userId`

`popup_clicked` is a general interaction event. Depending on the flow, `data.action` can contain values such as `loaded`, `start_survey`, `manual_send`, `back`, `complete`, or `close_icon`.

## Important Behavior Notes

- `segments.path` is the only segment currently evaluated by the SDK runtime.
- `exit` triggers work across anchor navigation, hash navigation, `history.pushState()`, and `history.replaceState()`.
- Pending `exit` popups are stored in `sessionStorage` until they are shown or discarded.
- The default browser renderer uses MagicFeedback forms and applies button labels from `actions.accept`, `actions.start`, `actions.back`, and `actions.complete`.
- `title`, `message`, and `style` belong to the popup definition contract, but the current browser renderer focuses on the embedded form and does not render those fields as standalone popup copy/layout controls.
- `actions.decline` is accepted in the definition shape, but the current browser renderer does not render a dedicated decline button or enforce `decline.cooldownDays`.
- In browser mode, the SDK creates `#deepdots-popup-container` and injects the shared popup stylesheet from jsDelivr.

## Running The Examples Locally

```bash
npm install
npm run build
python3 -m http.server 4173
```

Then open:

- `http://localhost:4173/examples/index.html`
- `http://localhost:4173/examples/product.html`
- `http://localhost:4173/examples/demo.html`
- `http://localhost:4173/examples/clients/casino/index.html`

Using a local HTTP server is recommended. Some browser module imports and navigation flows do not behave correctly when opening the files directly with `file://`.

## Development

```bash
npm run build
npm run build:watch
npm run lint
npm test
```

## License

MIT
