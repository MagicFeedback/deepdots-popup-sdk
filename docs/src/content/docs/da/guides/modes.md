---
title: Server vs Client Mode
description: Driftsmæssige forskelle mellem de to modes.
---

## Server mode

Brug denne mode når popup-definitionerne ligger i Deepdots og skal hentes ved runtime.

```ts
popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  nodeEnv: 'production',
});
```

Egenskaber:

- Henter popups fra API'et.
- `autoLaunch()` kan kaldes direkte efter `init()`.
- Triggere aktiveres når de eksterne definitioner er indlæst.

## Client mode

Brug denne mode når du vil styre definitionerne i din egen kode.

```ts
popups.init({
  mode: 'client',
  debug: true,
  popups: popupDefinitions,
});
```

Use cases:

- lokale demoer
- QA
- tests uden API
- fallback-flows styret af hosten

:::caution
`client` mode er reserveret til intern brug. Offentlige implementationer bør dokumenteres og understøttes via `server` mode.
:::
