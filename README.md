# deepdots-popup-sdk

TypeScript SDK to render and manage survey popups for MagicFeedback.

## Installation

```bash
npm install deepdots-popup-sdk
```

## Quick Start

```typescript
import { DeepdotsPopups } from 'deepdots-popup-sdk';

// Initialize the SDK
const popups = new DeepdotsPopups();
popups.init({
  apiKey: 'your-api-key',
  debug: true // Optional: enable debug logging
});

// Show a popup immediately
popups.show({
  surveyId: 'survey-123'
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

- ✅ **Simple API**: Initialize and show popups with minimal code
- ✅ **Auto-launch Triggers**: Time-based, scroll-based, and exit-intent triggers
- ✅ **Event System**: Listen to popup_shown, popup_clicked, and survey_completed events
- ✅ **TypeScript**: Full TypeScript support with type definitions
- ✅ **Lightweight**: Minimal dependencies
- ✅ **Framework Agnostic**: Works with any framework or vanilla JavaScript

## API Reference

### `DeepdotsPopups`

Main class for managing survey popups.

#### Methods

##### `init(config: DeepdotsConfig): void`

Initialize the SDK with configuration.

```typescript
popups.init({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.magicfeedback.com', // Optional
  debug: false // Optional
});
```

##### `show(options: ShowOptions): void`

Show a popup immediately.

```typescript
popups.show({
  surveyId: 'survey-123',
  data: { // Optional custom data
    userId: 'user-456',
    source: 'homepage'
  }
});
```

##### `configureTriggers(triggers: TriggerConfig[]): void`

Configure triggers for auto-launching popups.

```typescript
popups.configureTriggers([
  {
    type: 'time',
    value: 5000, // Show after 5 seconds
    surveyId: 'survey-123'
  },
  {
    type: 'scroll',
    value: 50, // Show at 50% scroll
    surveyId: 'survey-456'
  },
  {
    type: 'exit',
    surveyId: 'survey-789' // Show on exit intent
  }
]);
```

##### `autoLaunch(): void`

Enable auto-launch functionality with configured triggers.

```typescript
popups.autoLaunch();
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

## Events

The SDK emits the following events:

- **`popup_shown`**: Fired when a popup is displayed
- **`popup_clicked`**: Fired when a user interacts with the popup
- **`survey_completed`**: Fired when a user completes the survey

Each event includes:
```typescript
{
  type: 'popup_shown' | 'popup_clicked' | 'survey_completed',
  surveyId: string,
  timestamp: number,
  data?: Record<string, unknown>
}
```

## Trigger Types

### Time Trigger
Show popup after a specified delay in milliseconds.

```typescript
{
  type: 'time',
  value: 5000, // 5 seconds
  surveyId: 'survey-123'
}
```

### Scroll Trigger
Show popup when user scrolls to a certain percentage of the page.

```typescript
{
  type: 'scroll',
  value: 50, // 50% of page
  surveyId: 'survey-123'
}
```

### Exit Intent Trigger
Show popup when user moves mouse to exit the page.

```typescript
{
  type: 'exit',
  surveyId: 'survey-123'
}
```

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