/**
 * Identidad del SDK que acompaña a los datos que produce: `deepdots_sdk` en cada lote de
 * analítica y en el metadata de las respuestas de popup (junto a `deepdots_channel=popup`),
 * para que el dashboard de Collection sepa por qué SDK y versión llegó cada feedback.
 *
 * La versión NO se mantiene a mano: el build la inyecta desde `package.json` (`define` en
 * tsup.config.ts / tsup.rn.config.ts / vitest.config.ts). El sabor distingue el bundle
 * web (`web`) del entry de React Native (`react-native`).
 */
declare const __DEEPDOTS_SDK_VERSION__: string;
declare const __DEEPDOTS_SDK_FLAVOR__: string;

/** Versión publicada del paquete (`package.json`). */
export const SDK_VERSION: string = __DEEPDOTS_SDK_VERSION__;

/** `<plataforma>@<versión>`, p. ej. `web@1.18.0` o `react-native@1.18.0`. */
export const SDK_IDENTIFIER = `${__DEEPDOTS_SDK_FLAVOR__}@${SDK_VERSION}`;

/** Valor de `deepdots_channel` en las respuestas que llegan desde un popup. */
export const POPUP_CHANNEL = 'popup';
