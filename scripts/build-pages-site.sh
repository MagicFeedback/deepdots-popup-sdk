#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SITE_DIR="$ROOT_DIR/.pages-site"

rm -rf "$SITE_DIR"
mkdir -p "$SITE_DIR/popup-sdk" "$SITE_DIR/demo/assets" "$SITE_DIR/demo/clients"

# Copy the built Starlight docs under /popup-sdk.
cp -R "$ROOT_DIR/docs/dist/." "$SITE_DIR/popup-sdk/"

# Preserve the custom domain at the site root.
if [ -f "$ROOT_DIR/docs/public/CNAME" ]; then
  cp "$ROOT_DIR/docs/public/CNAME" "$SITE_DIR/CNAME"
fi

# Copy the public demo files under /demo.
cp "$ROOT_DIR/examples/index.html" "$SITE_DIR/demo/index.html"
cp "$ROOT_DIR/examples/product.html" "$SITE_DIR/demo/product.html"
cp "$ROOT_DIR/examples/demo-sdk.js" "$SITE_DIR/demo/demo-sdk.js"
cp "$ROOT_DIR/examples/sdk-loader.js" "$SITE_DIR/demo/sdk-loader.js"
cp "$ROOT_DIR/examples/style.css" "$SITE_DIR/demo/style.css"
cp "$ROOT_DIR/src/assets/style.css" "$SITE_DIR/demo/assets/style.css"
cp -R "$ROOT_DIR/examples/clients/casino" "$SITE_DIR/demo/clients/"
