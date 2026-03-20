---
title: Installation
description: How to install the SDK and prepare the development environment.
---

## Install the package

```bash
npm install @magicfeedback/popup-sdk
```

## Requirements

- Modern browser with ES2015+ support.
- `fetch`.
- `sessionStorage` for the exit popup queue.

## Environments

- `nodeEnv: 'production'` uses `https://api.deepdots.com`.
- `nodeEnv: 'development'` uses `https://api-dev.deepdots.com`.

## Note on SSR

In environments without `window` or `document`, the SDK falls back to a no-op renderer so the host render does not break.
