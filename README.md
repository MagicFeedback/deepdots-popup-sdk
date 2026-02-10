# MagicFeedback Popup SDK

TypeScript SDK to render and manage survey popups for MagicFeedback.

> Current package name: `@magicfeedback/popup-sdk`

## Installation

```bash
npm install @magicfeedback/popup-sdk
```

## Quick Start

```typescript
import {DeepdotsPopups} from '@magicfeedback/popup-sdk';

// Basic initialization
const popups = new DeepdotsPopups();
popups.init({
    debug: true,                       // enable verbose logging
    mode: 'client',                    // 'client' (preloaded definitions) | 'server' (fake async load for now)
    popups: [                          // optional in client mode
        {
            id: 'popup-123',
            title: 'Help us improve?',
            message: '<p>Take a quick survey and share your thoughts.</p>',
            triggers: {type: 'time_on_page', value: 5, condition: [{answered: false, cooldownDays: 7}]},
            actions: {
                accept: {label: 'Take Survey', surveyId: 'survey-abc'},
                decline: {label: 'Not Now', cooldownDays: 7}
            },
            surveyId: 'survey-abc',
            productId: 'product-xyz',
            style: {theme: 'light', position: 'bottom-right', imageUrl: null},
            segments: {lang: ['en'], path: ['/checkout']}
        }
    ]
});

// Start triggers
popups.autoLaunch();

// Listen to events
popups.on('popup_shown', (ev) => console.log('Shown:', ev));
popups.on('popup_clicked', (ev) => console.log('Clicked:', ev));
popups.on('survey_completed', (ev) => console.log('Completed:', ev));
```

## Features

- ✅ Simple API: initialize and launch popups with minimal code
- ✅ Auto-launch triggers: time, scroll, exit intent, click
- ✅ Automatic trigger derivation from popup definitions (`time_on_page` → internal `time` in ms)
- ✅ Conditions & cooldowns: prevent display if already answered or within cooldown window
- ✅ Event system: `popup_shown`, `popup_clicked`, `survey_completed`
- ✅ Renderer abstraction: browser, React Native stub, SSR-friendly no-op
- ✅ TypeScript: full type definitions
- ✅ Lightweight: zero runtime dependencies for core logic
- ✅ Framework agnostic: works in vanilla JS or any framework

## API Reference

### Class: `DeepdotsPopups`
Main class for configuring and displaying survey popups.

#### `init(config: DeepdotsInitParams): void`
Initializes the SDK. Must be called before other methods.

```typescript
popups.init({
  apiKey: 'your-key',          // optional
  nodeEnv: 'production',       // optional: influences internal baseUrl
  mode: 'client',              // 'client' or 'server'
  debug: false,                // verbose logging
  popups: [ /* PopupDefinition[] (client mode only) */ ]
});
```

In `server` mode popups are (currently) loaded via a simulated async fetch; triggers derived after load will start when `autoLaunch()` runs or once loading completes.

#### `show(options: ShowOptions): void`
Displays a popup for a survey immediately. `productId` is required.

```typescript
popups.show({ surveyId: 'survey-xyz', productId: 'product-123', data: { plan: 'pro' } });
```

#### `showByPopupId(popupId: string): void`
Displays a popup using its definition `id` (internally maps to `surveyId` + `productId`).

```typescript
popups.showByPopupId('popup-123');
```

#### `configureTriggers(triggers: TriggerConfig[]): void`
Registers manual triggers. Most apps should use `autoLaunch()` and popup definitions instead.

```typescript
popups.configureTriggers([
  { type: 'time', value: 5000, surveyId: 'survey-1' },
  { type: 'scroll', value: 60, surveyId: 'survey-2' },
  { type: 'exit', surveyId: 'survey-3' },
  { type: 'click', value: 'cta-button', surveyId: 'survey-4' }
]);
```

#### `autoLaunch(): void`
Starts automatic trigger evaluation. If popups are not yet loaded (server mode) call is deferred until load completes.

```typescript
popups.autoLaunch();
```

#### `triggerSurvey(surveyId: string): void`
Evaluates conditions and, if allowed, shows a popup for the specified survey. Used internally by trigger handlers; you normally don’t call this directly.

#### `markSurveyAnswered(surveyId: string): void`
Marks a survey as answered to satisfy conditions like `{ answered: false }`.

```typescript
popups.markSurveyAnswered('survey-xyz');
```

#### `on(type, listener)` / `off(type, listener)`
Add or remove event listeners.

```typescript
const handler = (ev) => console.log(ev);
popups.on('popup_shown', handler);
popups.off('popup_shown', handler);
```

#### `setRenderer(renderer: PopupRenderer): void`
Inject a custom renderer (e.g. native mobile). If called after `init` and the renderer has `init()`, it's invoked automatically.

```typescript
import { ReactNativePopupRenderer } from './my-native-renderer';
const sdk = new DeepdotsPopups();
sdk.setRenderer(new ReactNativePopupRenderer());
sdk.init({ mode: 'client', popups: [...] });
```

## Popup Definitions

When using `client` mode you can preload definitions. In `server` mode a fake fetch creates sample definitions. Trigger types in definitions:
- `time_on_page` (seconds) → mapped automatically to internal `time` trigger (milliseconds)
- `scroll` (percentage scrolled)
- `exit` (route/navigation exit intent)
- `click` (element id, string)

Structure:

```typescript
interface PopupDefinition {
  id: string;
  title: string;
  message: string; // HTML string
  triggers: {
    type: 'time_on_page' | 'scroll' | 'exit' | 'click';
    value: number | string; // seconds, percentage, or element id for click
    condition?: { answered: boolean; cooldownDays: number }[];
  };
  actions: {
    accept: { label: string; surveyId: string };
    decline: { label: string; cooldownDays?: number };
  };
  surveyId: string;
  productId: string;
  style: {
    theme: 'light' | 'dark';
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
    imageUrl: string | null;
  };
  segments?: { lang?: string[]; path?: string[]; [key: string]: unknown };
}
```

### Conditions
- `answered: false` → show only if survey not yet completed
- `cooldownDays: N` → do not show again until N days have passed since last display (per popup definition `id`)

## Events

Emitted events:
- `popup_shown`
- `popup_clicked` (first interaction / initial rendering)
- `survey_completed`

Payload:
```typescript
interface DeepdotsEvent {
  type: 'popup_shown' | 'popup_clicked' | 'survey_completed';
  surveyId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}
```

## Trigger Types (Manual Mode)

```typescript
{ type: 'time', value: 5000, surveyId: 'survey-1' }          // after 5s
{ type: 'scroll', value: 50, surveyId: 'survey-2' }          // at 50% scroll
{ type: 'exit', surveyId: 'survey-3' }                       // navigation exit intent
{ type: 'click', value: 'cta-button', surveyId: 'survey-4' } // click on element id
```

## Automatic Trigger Derivation
When definitions are loaded, each `time_on_page` trigger is converted to `{ type: 'time', value: seconds * 1000 }`. You just call `autoLaunch()` and derived triggers start.

## Trigger Behavior Notes
- `exit` fires on navigation intent (link clicks or SPA route changes). It does not depend on mouse leaving the viewport.
- `click` expects a DOM element id in `value`. The handler attaches on `DOMContentLoaded` if the element isn't available immediately.

## Styling & Container
Browser renderer creates a container `#deepdots-popup-container` with an overlay. Override styles via global CSS (e.g. `.deepdots-popup`, `#deepdots-popup-container`). The layout is intentionally minimal.

## Renderer Architecture

The SDK decouples core logic (triggers, conditions, events) from UI rendering.

- `BrowserPopupRenderer`: default when DOM is available.
- `ReactNativePopupRenderer` (stub): demonstrates how to bridge events in RN (does not render real UI here).
- `NoopPopupRenderer`: used in SSR / test environments without a DOM.

Detection for React Native uses `navigator.product === 'ReactNative'`.

### Creating a Native Renderer
```typescript
class MyNativeRenderer implements PopupRenderer {
  init() { /* prepare modal/store */ }
  show(surveyId, productId, data, emit, onClose) {
    // 1. Display native modal
    // 2. Render equivalent UI
    // 3. Call emit('popup_clicked', surveyId, data) on first interaction
  }
  hide() { /* close modal */ }
}

const sdk = new DeepdotsPopups();
sdk.setRenderer(new MyNativeRenderer());
sdk.init({ mode: 'client', popups: [...] });
```

### WebView (Cordova / Capacitor / RN / Flutter)
1. Build the bundle: `npm run build`.
2. Load `dist/` in a WebView.
3. Bridge events: `window.ReactNativeWebView.postMessage(JSON.stringify(ev))`.
4. Initialize: `popups.init({...}); popups.autoLaunch();`.

Example event forwarding:
```javascript
function forward(ev) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(ev));
}
popups.on('popup_shown', forward);
popups.on('survey_completed', forward);
```

## Types
Import types directly:

```typescript
import type {
  DeepdotsConfig,
  TriggerConfig,
  ShowOptions,
  DeepdotsEvent,
  DeepdotsEventType,
  EventListener,
} from '@magicfeedback/popup-sdk';
```

## Example Demo
See `examples/demo.html` for a runnable browser demo (uses client mode + fake definitions). To try it:
1. Build the project (`npm run build`).
2. Open `examples/demo.html` in a browser.
3. Use buttons to show popups and observe console + event log.

## Development

```bash
npm install          # install dependencies
npm run build        # build (CJS + ESM + d.ts)
npm run build:watch  # watch build
npm run lint         # eslint
npm test             # run vitest
npm run test:watch   # watch tests
```

Publishing uses `prepublishOnly` to ensure a fresh build.

## Notes & Limitations
- `server` mode currently simulates fetch; real network integration pending.
- `apiKey` is reserved for future authenticated endpoints.
- React Native renderer provided is a stub (example only).
- Sanitization of `message` HTML should be handled upstream if untrusted.

## Contributing
Issues & PRs welcome: https://github.com/MagicFeedback/deepdots-popup-sdk

## License
MIT

## Support
Open issues on the GitHub repository or contact maintainers.
