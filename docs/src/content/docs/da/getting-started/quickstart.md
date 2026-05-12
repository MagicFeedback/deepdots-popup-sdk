---
title: Quickstart
description: Få SDK'et i gang i dit produkt i tre trin.
---

SDK'et kører i **server mode**: dine popups, triggers og targeting lever i Deepdots og hentes i runtime. Du skal kun montere SDK'et, give det din API-nøgle og starte det.

## 1. Installation

```bash
npm install @magicfeedback/popup-sdk
```

## 2. Initialisér og auto-launch

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();

popups.init({
  mode: 'server',
  apiKey: 'YOUR_PUBLIC_API_KEY',
  userId: 'customer-123', // valgfrit — din interne bruger-identifikator
});

popups.autoLaunch();
```

Det er nok til, at popups dukker op på de tidspunkter, der er konfigureret i Deepdots.

## 3. (Valgfrit) Abonnér på events

Hvis du vil registrere popup-interaktioner i din analytics, så abonnér på SDK-events.

```ts
popups.on('popup_shown', (event) => analytics.track('popup_shown', event));
popups.on('survey_completed', (event) => analytics.track('survey_completed', event));
```

## 4. (Valgfrit) Udløs en forretnings-event

Hvis nogle af dine popups i Deepdots er konfigureret med en **event-trigger**, så udløs den event fra din kode, når forretningsbetingelsen er opfyldt.

```ts
popups.triggerEvent('checkout_completed');
```

Se [Triggers](/da/guides/triggers/) for den fulde liste over trigger-typer og kodeeksempler.

## Det er det

Du skulle ikke have brug for at definere popup-payloads i kode. Popups, tekster, triggers, cooldowns og rute-targeting styres alle i Deepdots.
