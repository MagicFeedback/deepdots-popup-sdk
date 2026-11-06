import { defineConfig } from 'tsup';
import { sdkVersionDefine } from './scripts/sdk-version-define.mjs';

/**
 * Build del entry de React Native (`@magicfeedback/popup-sdk/react-native`).
 * Distinto del build principal (browser): aquí react/react-native y libs nativas son
 * EXTERNAL (las resuelve Metro en la app), y NO bundleamos @magicfeedback/native (el
 * survey lo carga el WebView desde CDN). El core entra desacoplado (renderPopup es lazy).
 */
const rnExternal = [
  'react',
  'react/jsx-runtime',
  'react-native',
  'react-native-webview',
  'react-native-mmkv',
  'react-native-device-info',
];

export default defineConfig([{
  entry: { 'react-native': 'src/react-native/index.tsx' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: false, // se ejecuta después del build principal
  platform: 'neutral',
  target: 'es2020',
  sourcemap: true,
  external: [
    'react',
    'react/jsx-runtime',
    'react-native',
    'react-native-webview',
    'react-native-mmkv',
    'react-native-device-info',
    '@magicfeedback/native',
  ],
  loader: { '.css': 'text' },
  esbuildOptions(options) {
    options.jsx = 'automatic';
    options.define = { ...options.define, ...sdkVersionDefine('react-native') };
  },
},
/**
 * Entrada principal del paquete en React Native (`dist/index.native.js`, condición
 * `react-native` de `exports`): la misma API que `dist/index.js` más el registro de AppState,
 * Platform y el módulo nativo de background (DD-55). Como `dist/index.js`, lleva DENTRO
 * `@magicfeedback/native` (es devDependency: la app no lo tiene instalado), así que el host no
 * nota ningún cambio respecto a importar la entrada web.
 */
{
  entry: { 'index.native': 'src/index.native.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: false,
  platform: 'neutral',
  target: 'es2020',
  sourcemap: true,
  external: rnExternal,
  loader: { '.css': 'text' },
  esbuildOptions(options) {
    options.define = { ...options.define, ...sdkVersionDefine('react-native') };
  },
}]);
