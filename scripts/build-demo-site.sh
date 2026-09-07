#!/usr/bin/env bash
set -euo pipefail

# Assembles the public demo site for GitHub Pages.
#
# The published tree mirrors the repo layout on purpose: the examples load the
# SDK with the relative paths they already use in local development
# (`../dist/index.mjs` from examples/, `../../../dist/index.mjs` from
# examples/clients/casino/), so nothing has to be rewritten at build time.
#
#   /                     → redirect to /examples/
#   /examples/            → demo pages (index, product, casino client)
#   /dist/                → the built SDK the demo loads
#
# Run `npm run build` before this script: it copies dist/ as-is.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SITE_DIR="$ROOT_DIR/.demo-site"

if [ ! -f "$ROOT_DIR/dist/index.mjs" ]; then
  echo "dist/index.mjs no existe: ejecuta 'npm run build' antes de este script" >&2
  exit 1
fi

rm -rf "$SITE_DIR"
mkdir -p "$SITE_DIR/examples/assets" "$SITE_DIR/dist"

# Browser bundle + the survey CSS the SDK injects. Skip source maps, the CJS
# build and the react-native entry: none of them are used by the web demo.
cp "$ROOT_DIR"/dist/*.mjs "$SITE_DIR/dist/"
rm -f "$SITE_DIR"/dist/react-native.mjs
cp -R "$ROOT_DIR/dist/assets/." "$SITE_DIR/dist/assets/"

# Demo pages.
cp "$ROOT_DIR/examples/index.html" \
   "$ROOT_DIR/examples/product.html" \
   "$ROOT_DIR/examples/demo-sdk.js" \
   "$ROOT_DIR/examples/sdk-loader.js" \
   "$ROOT_DIR/examples/style.css" \
   "$SITE_DIR/examples/"
cp -R "$ROOT_DIR/examples/clients" "$SITE_DIR/examples/clients"

# product.html links the survey stylesheet as ./assets/style.css. The build
# leaves it nested (dist/assets/assets/style.css), so resolve it instead of
# hardcoding the depth.
SURVEY_CSS="$(find "$ROOT_DIR/dist/assets" -name style.css -print -quit)"
if [ -z "$SURVEY_CSS" ]; then
  echo "no encuentro el style.css del survey en dist/assets" >&2
  exit 1
fi
cp "$SURVEY_CSS" "$SITE_DIR/examples/assets/style.css"

# Pages serves the artifact as-is, but .nojekyll keeps underscore-prefixed
# files safe if the site is ever served from a branch instead.
touch "$SITE_DIR/.nojekyll"

cat > "$SITE_DIR/index.html" <<'HTML'
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8"/>
    <title>Deepdots Popup SDK · Demo</title>
    <meta http-equiv="refresh" content="0; url=./examples/"/>
    <link rel="canonical" href="./examples/"/>
</head>
<body>
<p><a href="./examples/">Ir a la demo del Deepdots Popup SDK</a></p>
</body>
</html>
HTML

echo "Sitio de demo listo en $SITE_DIR"
