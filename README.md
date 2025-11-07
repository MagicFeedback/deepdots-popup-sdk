# deepdots-popup-sdk

TypeScript SDK to render and manage survey popups for MagicFeedback.

## Installation

```bash
npm install deepdots-popup-sdk
```

## Quick Start

```typescript
import { DeepdotsPopups } from 'deepdots-popup-sdk';

// Initialize the SDK (basic)
const popups = new DeepdotsPopups();
popups.init({
  apiKey: 'your-api-key',
  debug: true // Optional: enable debug logging
});

// Show a popup immediately (productId now required)
popups.show({
  surveyId: 'survey-123',
  productId: 'product-xyz'
});

// Listen to events
popups.on('popup_shown', (event) => {
  console.log('Popup shown:', event);
});

popups.on('survey_completed', (event) => {
  console.log('Survey completed:', event);
});
```

## Features

- ✅ Simple API: Initialize and show popups with minimal code
- ✅ Auto-launch Triggers: Time-based, scroll-based, and exit-intent triggers
- ✅ Automatic trigger derivation from remote popup definitions (time_on_page → time, etc.)
- ✅ Conditions & Cooldowns: Avoid showing to answered users or during cooldown periods
- ✅ Event System: Listen to popup_shown, popup_clicked, and survey_completed events
- ✅ TypeScript: Full TypeScript support with type definitions
- ✅ Lightweight: Minimal dependencies
- ✅ Framework Agnostic: Works with any framework or vanilla JavaScript

## API Reference

### `DeepdotsPopups`

Main class for managing survey popups.

#### Methods

##### `init(config: DeepdotsInitParams): void`

Initialize the SDK with configuration.

```typescript
popups.init({
  apiKey: 'your-api-key',
  nodeEnv: 'production',            // Optional: 'development' | 'production' (affects baseUrl)
  mode: 'client',                   // Optional: 'client' (use provided popups) | 'server' (fetch remote popups)
  debug: false,                     // Optional
  popups: [                         // Optional: preload popup definitions (client mode)
    {
      id: 'popup-123',
      title: 'Would you like to help us improve?',
      message: '<p>Take a quick survey and share your thoughts.</p>',
      trigger: { type: 'time_on_page', value: 5, condition: [{ answered: false, cooldownDays: 7 }] },
      actions: {
        accept: { label: 'Take Survey', surveyId: 'survey-abc' },
        decline: { label: 'Not Now', cooldownDays: 7 }
      },
      surveyId: 'survey-abc',
      productId: 'product-xyz',
      style: { theme: 'light', position: 'bottom-right', imageUrl: null },
      segments: { lang: ['en'], path: ['/checkout'] }
    }
  ]
});
```

The SDK resolves `baseUrl` internally from `nodeEnv` (defaults to production) and will convert `time_on_page` trigger values (seconds) into internal `time` triggers (milliseconds).

##### `show(options: ShowOptions): void`

Show a popup immediately.

```typescript
popups.show({
  surveyId: 'survey-123',
  productId: 'product-xyz', // REQUIRED now
  data: { // Optional custom data passed to events
    userId: 'user-456',
    source: 'homepage'
  }
});
```

##### `showByPopupId(popupId: string): void`

Show a popup using its definition `id` (will internally map to `surveyId`).

```typescript
popups.showByPopupId('popup-123');
```

##### `configureTriggers(triggers: TriggerConfig[]): void`

Manually configure triggers for auto-launching popups.

```typescript
popups.configureTriggers([
  { type: 'time', value: 5000, surveyId: 'survey-123' },
  { type: 'scroll', value: 50, surveyId: 'survey-456' },
  { type: 'exit', surveyId: 'survey-789' }
]);
```

##### `autoLaunch(): void`

Enable auto-launch functionality with previously configured triggers OR triggers derived automatically from popup definitions.

```typescript
popups.autoLaunch();
```

##### `triggerSurvey(surveyId: string): void`

Internal trigger evaluation + display (used by trigger system). You normally don't call this directly; use `configureTriggers` + `autoLaunch`.

##### `markSurveyAnswered(surveyId: string): void`

Manually mark a survey as answered (affects future conditions like `answered: false`).

```typescript
popups.markSurveyAnswered('survey-123');
```

##### `on(eventType: DeepdotsEventType, listener: EventListener): void`

Add an event listener.

```typescript
popups.on('popup_shown', (event) => {
  console.log('Event:', event);
});
```

##### `off(eventType: DeepdotsEventType, listener: EventListener): void`

Remove an event listener.

```typescript
const listener = (event) => console.log(event);
popups.on('popup_shown', listener);
popups.off('popup_shown', listener);
```

### Popup Definitions (Advanced)

When operating in `client` mode you can preload popup definitions via `popups` in `init()`. In `server` mode the SDK (currently) simulates a fetch and loads remote definitions asynchronously.

Structure:

```typescript
interface PopupDefinition {
  id: string;
  title: string;
  message: string; // HTML string
  trigger: {
    type: 'time_on_page' | 'scroll' | 'exit';
    value: number; // seconds for time_on_page, percentage for scroll
    condition?: { answered: boolean; cooldownDays: number; }[];
  };
  actions: {
    accept: { label: string; surveyId: string };
    decline: { label: string; cooldownDays?: number };
  };
  surveyId: string;
  productId: string;
  style: { theme: 'light' | 'dark'; position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center'; imageUrl: string | null };
  segments?: { lang?: string[]; path?: string[]; [key: string]: unknown };
}
```

Conditions inside `trigger.condition` are evaluated before showing:

- `answered: false` → only show if the survey hasn't been completed yet
- `cooldownDays: X` → don't show again until X days have passed since last display

### Events

The SDK emits the following events:

- `popup_shown`: Fired when a popup is displayed
- `popup_clicked`: Fired on the first interaction (form load or manual click)
- `survey_completed`: Fired when a user completes the survey

Each event includes:

```typescript
{
  type: 'popup_shown' | 'popup_clicked' | 'survey_completed',
  surveyId: string,
  timestamp: number,
  data?: Record<string, unknown>
}
```

### Trigger Types (Manual Configuration)

#### Time Trigger (`type: 'time'`)
Show popup after a specified delay in milliseconds.

```typescript
{ type: 'time', value: 5000, surveyId: 'survey-123' }
```

#### Scroll Trigger (`type: 'scroll'`)
Show popup when user scrolls to a certain percentage of the page.

```typescript
{ type: 'scroll', value: 50, surveyId: 'survey-123' }
```

#### Exit Intent Trigger (`type: 'exit'`)
Show popup when user moves mouse to exit the page.

```typescript
{ type: 'exit', surveyId: 'survey-123' }
```

### Automatic Trigger Derivation
When using popup definitions, remote trigger types like `time_on_page` are mapped to internal `time` triggers (seconds → milliseconds) and started automatically after `autoLaunch()`.

## Styling & Container
The SDK creates a container with id `deepdots-popup-container` covering the viewport and renders a popup inside with a basic layout. You can override styles via global CSS targeting `.deepdots-popup` or the container id.

## Examples

See the [examples](./examples) directory for a complete demo.

To run the demo:

1. Open `examples/demo.html` in your browser
2. Try different triggers and see events in the console

## Development

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

### Test

```bash
npm test
```

### Watch Mode (Tests)

```bash
npm run test:watch
```

## TypeScript Types

The package includes full TypeScript type definitions. Import types as needed:

```typescript
import type {
  DeepdotsConfig,
  TriggerConfig,
  ShowOptions,
  DeepdotsEvent,
  DeepdotsEventType,
  EventListener
} from 'deepdots-popup-sdk';
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For issues and questions, please visit the [GitHub repository](https://github.com/MagicFeedback/deepdots-popup-sdk).