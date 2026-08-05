# Deepdots Popup SDK

TypeScript SDK for loading and displaying Deepdots surveys as popups in browser apps.

Package name: `@magicfeedback/popup-sdk`

## What It Does

- Loads popup definitions from the Deepdots API
- Triggers popups by time on page, scroll depth, click, route exit, or host-driven events
- Emits lifecycle events so the host app can track popup activity
- Supports route and language targeting through `segments.path` / `segments.lang`
- Collects analytics (navigation, engagement, messaging, crashes) and sends them to Deepdots
- Falls back to a no-op renderer outside the browser

## Installation

```bash
npm install @magicfeedback/popup-sdk
```

## Recommended Setup

Popup definitions are always managed remotely: the SDK fetches them from the Deepdots API at runtime.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();

popups.init({
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

- `nodeEnv: 'production'` uses `https://api.deepdots.com`.
- `nodeEnv: 'development'` uses `https://api-dev.deepdots.com`.
- `userId` is optional, but recommended when popups are targeted per user.
- `autoLaunch()` can be called immediately after `init()`: the SDK waits until the remote popups are loaded.

## Real Use Cases From `examples/`

### 1. Remote website integration

Files:

- `examples/index.html`
- `examples/product.html`
- `examples/demo-sdk.js`

This flow initializes the SDK against the API, auto-launches popups on page load, and logs popup events in the page UI. It is the closest example to a standard website integration.

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

### 4. Local sandbox with debug logging

File:

- `examples/demo.html`

Initializes the SDK against the API with `debug: true`, exposes the instance as `window.deepdots`, and logs every lifecycle event on the page. Useful for inspecting triggers, `getUserId()` / `getSessionId()`, and the analytics payload from the console.

## API Essentials

### `init(config)`

Initializes the SDK.

```ts
popups.init({
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
- `debug?: boolean` — verbose logging
- `logger?: DeepdotsLogger` — replaces `console` for SDK logs
- `trackingEnabled?: boolean` — starts analytics on (default) or off, for consent flows
- `analytics?: { publicKey: string; integration: string }` — enables the real analytics
  delivery. Without it the analytics channel stays in dry-run and only logs the payload.
- `appVersion?: string` — reported in the analytics device context
- `storage?: KeyValueStorage` — persistence override (React Native uses MMKV; the browser
  defaults to `localStorage`)
- `platform?: 'web' | 'android' | 'ios'` — defaults to `'web'`
- `device?: DeviceInfo` — device context override, for hosts where the SDK cannot detect it
- `contactAttributes?: Record<string, string | number | boolean>`
- `language?: string` — BCP-47 tag (`'en'`, `'en-US'`, …) used for popup language
  segmentation (`segments.lang`) and for the analytics context. If omitted it is
  auto-detected from `navigator.language`, falling back to the `Intl` locale (which is
  what makes it work in React Native, where `navigator.language` does not exist). If no
  source resolves a language, popups with `segments.lang` cannot be filtered and are shown.

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

### `triggerSurvey(surveyId, popupId?)`

Opens a specific survey directly, bypassing trigger evaluation.

```ts
popups.triggerSurvey('survey-home-001');
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

## Analytics & Tracking

Beyond popups, the SDK collects analytics and sends it to Deepdots, linked by a persistent
anonymous `user_id`. Navigation (`page_view`), active time (`user_engagement`), device context,
session start/end and unhandled errors are automatic. The rest is instrumented by the host:

| Method | What it records |
|---|---|
| `track(name, params?)` | Any custom event |
| `trackMessage(stage, options)` | Message funnel — push / in-app notifications |
| `trackSearch(query, resultsCount, params?)` | Searches, with `has_results` derived |
| `trackFunnelStep(funnel, step, taskId, params?)` | A funnel step, correlated by `taskId` |
| `trackFindabilityFriction(topic, params?)` | Friction signal |
| `trackMeaningfulInteraction(interactionType, params?)` | A meaningful interaction, grouped by `interaction_type` |
| `enterMiniService(name, entryPointType?)` / `exitMiniService(name)` | Mini-service, with duration |
| `setUserAttributes(map)` / `setMetric(key, value)` | Breakdown dimensions / measurable values |
| `setUserId(userId?)` | Login, logout or account switch |
| `endSession()` | Closes the session explicitly |
| `setTrackingEnabled(enabled)` | Kill switch (consent) |
| `reportError(error, options?)` | A handled error |
| `previewAnalytics()` / `flushAnalytics()` | Inspect the pending payload / send it now |

### Messaging — `trackMessage(stage, options)`

Records one stage of a notification funnel. The SDK cannot observe the host's notification
system, so all three stages are instrumented by the host:

```ts
popups.trackMessage('delivered', {
  id: 'msg-42',              // same id across the three stages
  title: 'Summer sale',
  channel: 'push',           // 'push' | 'in_app'
  campaign: 'summer_sale',   // optional
});

popups.trackMessage('clicked', { id: 'msg-42', title: 'Summer sale', channel: 'push' });

popups.trackMessage('converted', {
  id: 'msg-42', title: 'Summer sale', channel: 'push',
  value: 49.9, currency: 'EUR',   // optional
});
```

Rules to follow when instrumenting it:

- **Send the three stages.** `delivered` is the denominator of CTR and conversion rate. Without
  it those metrics cannot be computed. Send it when the message reaches the device, before the
  user opens it — for in-app messages, when it is rendered.
- **The same `message_id` across the three stages.** It is what correlates the funnel. It must be
  unique per send, not per campaign.
- **One `message_id` = one channel.** If a campaign goes out as a push *and* as an in-app
  message, use two different `message_id` values sharing the same `campaign`.
- **One call per stage.** If your click handler can run through two paths (opening the
  notification plus a deep link), make sure only one of them emits `clicked`.

Since **1.2.0** the SDK discards events that break these rules instead of forwarding them, and
warns on the console:

```
[DeepdotsPopups] trackMessage discarded (channel_conflict): message_id "msg-42" was already reported on channel "push"; discarding "in_app"
```

| Rule | What is discarded | `reason` |
|---|---|---|
| `channel` must be `push` or `in_app` | any other value | `invalid_channel` |
| Each `(message_id, stage)` is sent once | the 2nd call to the same stage of the same message | `duplicate_stage` |
| A `message_id` keeps its channel | events on a channel other than the first one seen | `channel_conflict` |

These checks last for the session and are per device, and they cap at 500 tracked `message_id`
values (oldest evicted first). A rejected event does not consume state: after a
`channel_conflict` on `in_app`, the same stage on the correct channel is still sent.

> **`delivered` on push has a structural limit.** On the device it is only observable if the app
> process receives the notification: a *data* push on Android, a `UNNotificationServiceExtension`
> with `mutable-content` on iOS. Notifications arriving while the app is killed, or with
> restricted permissions, will not fire it — so a client-side `delivered` count sits below the
> real one. For a reliable denominator, take `delivered` from your sending provider.

## Supported Trigger Types

Popup definitions use these trigger types:

- `time_on_page`: shows after N seconds on the page
- `scroll`: shows after reaching a scroll percentage
- `click`: shows after clicking the element with the given DOM id
- `exit`: shows after leaving a matching route and waiting N seconds on the destination route
- `event`: shows when the host app calls `triggerEvent(name)`

## Popup Definition Shape

The API returns popup definitions with this structure. `triggers` is an array, `time_on_page`
values are in seconds, and `segments.path` accepts full URLs, path fragments such as `/pricing`,
or hash routes such as `/#/home`:

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
    font?: {
      family: string;   // clean family name, not a stack
      url?: string;     // woff2/ttf/otf, turned into an @font-face
    };
  };
  segments?: {
    path?: string[];
    lang?: string[];
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

- `segments.path` and `segments.lang` are the segments currently evaluated by the SDK runtime. If no language can be resolved, popups with `segments.lang` are shown rather than filtered out.
- `exit` triggers work across anchor navigation, hash navigation, `history.pushState()`, and `history.replaceState()`.
- Pending `exit` popups are stored in `sessionStorage` until they are shown or discarded.
- The default browser renderer uses Deepdots forms and applies button labels from `actions.accept`, `actions.start`, `actions.back`, and `actions.complete`.
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
