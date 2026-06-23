#!/usr/bin/env bash
#
# Crea una app React Native lista para probar el Deepdots SDK.
# Uso:   bash examples/react-native/setup.sh [NombreApp] [CarpetaPadre]
# Ej.:   bash examples/react-native/setup.sh DeepdotsDemo ~/
#
# Hace: empaqueta el SDK → crea la app RN (CLI nuevo) → instala SDK + peers →
#       copia App.tsx → pod install (iOS). Al final solo tienes que editar
#       App.tsx (apiKey + survey) y ejecutar `npm run ios` / `npm run android`.
set -euo pipefail

SDK_DIR="$(cd "$(dirname "$0")/../.." && pwd)"   # raíz del repo del SDK
APP_NAME="${1:-DeepdotsDemo}"
APP_PARENT="${2:-$HOME}"
APP_DIR="$APP_PARENT/$APP_NAME"

echo "▶ 1/5  Empaquetando el SDK ($SDK_DIR)…"
( cd "$SDK_DIR" && npm run build >/dev/null && npm pack >/dev/null )
TGZ="$(ls -t "$SDK_DIR"/magicfeedback-popup-sdk-*.tgz | head -1)"
echo "   tarball: $TGZ"

if [ -d "$APP_DIR" ]; then
  echo "▶ 2/5  La app ya existe en $APP_DIR — la reutilizo."
else
  echo "▶ 2/5  Creando app RN en $APP_DIR (CLI nuevo)…"
  ( cd "$APP_PARENT" && npx @react-native-community/cli@latest init "$APP_NAME" --skip-install )
fi

cd "$APP_DIR"
echo "   (pwd: $(pwd))"

echo "▶ 3/5  Instalando dependencias base + SDK…"
npm install --legacy-peer-deps
npm i "$TGZ" react-native-webview react-native-device-info --legacy-peer-deps

echo "▶ 4/5  MMKV (opcional, persistencia del user_id)…"
# RN con New Architecture necesita MMKV v3. Si falla, seguimos: el SDK degrada a memoria.
npm i react-native-mmkv@^3 --legacy-peer-deps || echo "   ⚠ MMKV no instalado (opcional): el user_id no persistirá; el resto funciona."

echo "▶ 5/5  Copiando App.tsx y pods…"
cp "$SDK_DIR/examples/react-native/App.tsx" "$APP_DIR/App.tsx"
if [ -d "$APP_DIR/ios" ] && command -v pod >/dev/null 2>&1; then
  ( cd "$APP_DIR/ios" && pod install )
fi

cat <<EOF

✅ Listo.
   1) Edita $APP_DIR/App.tsx → CONFIG.apiKey (tu publicKey) y SURVEY (surveyId/productId reales).
   2) Arranca:
        cd $APP_DIR
        npm start            # Metro (aquí ves el tracking en consola)
        npm run ios          # o: npm run android
EOF
