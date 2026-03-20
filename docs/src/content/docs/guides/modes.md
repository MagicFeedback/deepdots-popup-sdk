---
title: Server vs Client Mode
description: Operational differences between both modes.
---

## Server mode

Use this mode when popup definitions live in Deepdots and must be fetched at runtime.

```ts
popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  nodeEnv: 'production',
});
```

Characteristics:

- Fetches popups from the API.
- `autoLaunch()` can be called right after `init()`.
- Triggers start once remote definitions have been loaded.

## Client mode

Use this mode when you want to control popup definitions from your own code.

```ts
popups.init({
  mode: 'client',
  debug: true,
  popups: popupDefinitions,
});
```

Use cases:

- local demos
- QA
- testing without API access
- host-controlled fallback flows

:::caution
`client` mode is reserved for internal use. Public implementations should be documented and supported through `server` mode.
:::
