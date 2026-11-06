// Inyecta la versión de package.json en el bundle (src/version.ts): nunca una constante a mano.
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** `define` de esbuild/vite con la versión del paquete y el sabor del bundle. */
export function sdkVersionDefine(flavor) {
  return {
    __DEEPDOTS_SDK_VERSION__: JSON.stringify(version),
    __DEEPDOTS_SDK_FLAVOR__: JSON.stringify(flavor),
  };
}
