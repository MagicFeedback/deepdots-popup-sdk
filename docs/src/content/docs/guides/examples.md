---
title: Examples
description: Real examples included in the repository.
---

## Available examples

- `examples/index.html`
- `examples/product.html`
- `examples/demo.html`
- `examples/clients/casino/index.html`

## Published demo

The public GitHub Pages deployment publishes the customer-facing demo at [`/demo/`](../../demo/).

The internal `client` mode sandbox in `examples/demo.html` is intentionally not published.

## What each one demonstrates

- `examples/index.html` and `examples/product.html`: remote web integration and exit popups between routes.
- `examples/demo.html`: internal-only `client` mode with inline definitions.
- `examples/clients/casino/index.html`: `triggerEvent` based on host business events.

## Run them locally

```bash
npm install
npm run build
python3 -m http.server 4173
```

Then open:

- `http://localhost:4173/examples/index.html`
- `http://localhost:4173/examples/product.html`
- `http://localhost:4173/examples/demo.html`
- `http://localhost:4173/examples/clients/casino/index.html`
