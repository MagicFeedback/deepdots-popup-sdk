#!/usr/bin/env bash
set -eo pipefail

# Cargar variables de entorno desde archivo
ENV_FILE="${NPM_ENV_FILE:-.npm.env}"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC2046,SC1090
  set +u
  export $(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" | xargs) || true
  set -u
  echo "Loaded env from $ENV_FILE"
else
  echo "Env file '$ENV_FILE' not found. Create it from .npm.env.example and set NPM_TOKEN."
fi

# Registry actual (permite override con NPM_REGISTRY)
REGISTRY="${NPM_REGISTRY:-$(npm config get registry)}"
SCOPE="@magicfeedback"
SCOPE_REG="$(npm config get ${SCOPE}:registry || true)"

DRY_RUN="${NPM_DRY_RUN:-}"
USE_TOKEN=false
TMP_NPMRC_CREATED=false

if [ -n "${NPM_TOKEN:-}" ]; then
  USE_TOKEN=true
  echo "Using NPM_TOKEN provided via env."
  # Crear .npmrc local temporal para el publish
  {
    echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}"
    echo "${SCOPE}:registry=${REGISTRY}"
    echo "always-auth=true"
  } > .npmrc
  TMP_NPMRC_CREATED=true
  # Asegurar limpieza al salir
  trap 'if [ "$TMP_NPMRC_CREATED" = true ]; then rm -f .npmrc; fi' EXIT
fi

echo "Publishing to registry: ${REGISTRY}"
if [ -n "${SCOPE_REG:-}" ] && [ "${SCOPE_REG}" != "undefined" ]; then
  echo "Scope registry for ${SCOPE}: ${SCOPE_REG}"
fi

# Asegura que el scope use el registry correcto si no está definido
if [ -z "${SCOPE_REG:-}" ] || [ "${SCOPE_REG}" = "undefined" ]; then
  echo "Setting registry for scope ${SCOPE} -> ${REGISTRY}"
  npm config set ${SCOPE}:registry "${REGISTRY}"
fi

# Verifica login (solo si no es dry-run ni se usa token)
if [ -z "${DRY_RUN}" ] && [ "$USE_TOKEN" = false ]; then
  if ! npm whoami >/dev/null 2>&1; then
    echo "You're not logged in to npm. Starting npm login..."
    npm login --scope=${SCOPE} --registry="${REGISTRY}"
  fi
else
  if [ -n "${DRY_RUN}" ]; then echo "Dry-run enabled; skipping npm login check."; fi
  if [ "$USE_TOKEN" = true ]; then echo "Auth via token; skipping npm whoami/login."; fi
fi

PKG_NAME=$(node -p "require('./package.json').name")
PKG_VER=$(node -p "require('./package.json').version")

echo "Package: ${PKG_NAME}"
echo "Version: ${PKG_VER}"

# Evita publicar una versión que ya existe
if npm view "${PKG_NAME}@${PKG_VER}" version >/dev/null 2>&1; then
  echo "Version ${PKG_VER} already exists in registry. Aborting."
  exit 1
fi

# Determinar tag de prerelease si aplica
TAG="${NPM_TAG:-}"
if [[ -z "$TAG" ]]; then
  if [[ "$PKG_VER" == *"-alpha"* ]]; then TAG="alpha"; fi
  if [[ "$PKG_VER" == *"-beta"* ]]; then TAG="beta"; fi
  if [[ "$PKG_VER" == *"-rc"* ]]; then TAG="rc"; fi
fi

# Soporte 2FA: exporta NPM_OTP=123456 si tu cuenta tiene 2FA obligatorio para publish (no necesario si hay NPM_TOKEN Automation)
PUBLISH_CMD=(npm publish --access public --ignore-scripts)
if [ -n "$TAG" ]; then
  PUBLISH_CMD+=(--tag "$TAG")
fi
if [ -n "${NPM_OTP:-}" ]; then
  PUBLISH_CMD+=(--otp "${NPM_OTP}")
fi

# Dry-run
if [ -n "${DRY_RUN}" ]; then
  PUBLISH_CMD+=(--dry-run)
fi

# Publica
echo "Running: ${PUBLISH_CMD[*]}"
"${PUBLISH_CMD[@]}"
