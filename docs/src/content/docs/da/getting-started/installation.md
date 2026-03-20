---
title: Installation
description: Sådan installeres SDK'et og udviklingsmiljøet klargøres.
---

## Installer pakken

```bash
npm install @magicfeedback/popup-sdk
```

## Krav

- Moderne browser med ES2015+-understøttelse.
- `fetch`.
- `sessionStorage` til køen af exit-popups.

## Miljøer

- `nodeEnv: 'production'` bruger `https://api.deepdots.com`.
- `nodeEnv: 'development'` bruger `https://api-dev.deepdots.com`.

## Note om SSR

I miljøer uden `window` eller `document` falder SDK'et tilbage til en no-op renderer, så hostens rendering ikke går i stykker.
