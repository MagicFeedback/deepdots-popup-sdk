---
title: Quickstart
description: Get the SDK running in your product in three steps.
---

The SDK runs in **server mode**: your popups, triggers, and targeting live in Deepdots and are fetched at runtime. You only need to mount the SDK, hand it your API key, and start it.

## 1. Install

```bash
npm install @magicfeedback/popup-sdk
```

## 2. Initialize and auto-launch

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();

popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  userId: 'customer-123', // optional — your internal user identifier
});

popups.autoLaunch();
```

That's enough for popups to appear at the moments configured in Deepdots.

## 3. (Optional) Subscribe to events

If you want to track popup interactions in your analytics, subscribe to the SDK events.

```ts
popups.on('popup_shown', (event) => analytics.track('popup_shown', event));
popups.on('survey_completed', (event) => analytics.track('survey_completed', event));
```

## 4. (Optional) Fire a business event

If any of your popups in Deepdots are configured with an **event trigger**, fire that event from your code whenever the business condition is met.

```ts
popups.triggerEvent('checkout_completed');
```

See [Triggers](/guides/triggers/) for the full list of trigger types and code examples.

## That's it

You should not need to define popup payloads in code. Popups, copy, triggers, cooldowns, and route targeting are all managed in Deepdots.
