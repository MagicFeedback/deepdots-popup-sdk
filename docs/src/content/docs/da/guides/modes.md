---
title: Server Mode
description: SDK'et kører i server mode — popups styres i Deepdots og hentes i runtime.
---

Deepdots Popup SDK kører i **server mode**. Der er ikke nogen anden understøttet mode til kundeintegrationer.

## Hvad server mode betyder

- Popup-definitioner, tekst, triggers, targeting og cooldowns lever i **Deepdots**.
- SDK'et henter dem i runtime ved hjælp af din `apiKey`.
- Din kode definerer aldrig popups manuelt — den monterer kun SDK'et og reagerer på dets events.

## Minimal konfiguration

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();

popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
});

popups.autoLaunch();
```

## Valgfri felter

| Felt     | Type     | Standard | Hvad det gør                                                |
| -------- | -------- | -------- | ----------------------------------------------------------- |
| `userId` | `string` | ingen    | Sendes med hver popup-event til bruger-identifikation.      |

## Hvorfor ingen klient-side definitioner?

At definere popups i din kode ville dele ejerskabet af oplevelsen mellem din kodebase og Deepdots. Server mode bevarer én sandhedskilde, så produkt-, marketing- og CS-teams kan ændre tekst, targeting og triggers uden et kode-deploy fra din side.
