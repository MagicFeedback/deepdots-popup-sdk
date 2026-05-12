---
title: Server Mode
description: The SDK runs in server mode — popups are managed in Deepdots and fetched at runtime.
---

The Deepdots Popup SDK runs in **server mode**. There is no other supported mode for customer integrations.

## What server mode means

- Popup definitions, copy, triggers, targeting, and cooldowns live in **Deepdots**.
- The SDK fetches them at runtime using your `apiKey`.
- Your code never defines popups by hand — it just mounts the SDK and reacts to its events.

## Minimum configuration

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();

popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
});

popups.autoLaunch();
```

## Optional fields

| Field    | Type                          | Default        | What it does                                      |
| -------- | ----------------------------- | -------------- | ------------------------------------------------- |
| `userId` | `string`                      | none           | Sent with every popup event for user identification. |

## Why no client-side definitions?

Defining popups in your code would split ownership of the experience between your codebase and Deepdots. Server mode keeps a single source of truth, so product, marketing, and CS teams can change copy, retargeting, and triggers without a code deploy on your side.
