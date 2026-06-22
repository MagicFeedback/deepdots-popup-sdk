import { defineConfig } from 'tsup';

/**
 * Build del entry de React Native (`@magicfeedback/popup-sdk/react-native`).
 * Distinto del build principal (browser): aquí react/react-native y libs nativas son
 * EXTERNAL (las resuelve Metro en la app), y NO bundleamos @magicfeedback/native (el
 * survey lo carga el WebView desde CDN). El core entra desacoplado (renderPopup es lazy).
 */
export default defineConfig({
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
  },
});
