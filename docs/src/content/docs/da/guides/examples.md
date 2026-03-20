---
title: Examples
description: Reelle eksempler som følger med i repository'et.
---

## Tilgængelige eksempler

- `examples/index.html`
- `examples/product.html`
- `examples/demo.html`
- `examples/clients/casino/index.html`

## Hvad de viser

- `examples/index.html` og `examples/product.html`: remote web-integration og exit-popups mellem ruter.
- `examples/demo.html`: intern `client` mode med inline-definitioner.
- `examples/clients/casino/index.html`: `triggerEvent` baseret på hostens forretningsevents.

## Kør dem lokalt

```bash
npm install
npm run build
python3 -m http.server 4173
```

Åbn derefter:

- `http://localhost:4173/examples/index.html`
- `http://localhost:4173/examples/product.html`
- `http://localhost:4173/examples/demo.html`
- `http://localhost:4173/examples/clients/casino/index.html`
