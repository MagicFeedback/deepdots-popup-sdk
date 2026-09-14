#!/usr/bin/env node
/**
 * Contrato de layout del paquete publicado.
 *
 * El CSS del survey se consume POR CDN con una ruta escrita a mano fuera de este repo
 * (`MagicFeedbackHtml.kt` del SDK nativo lo carga de
 * `jsdelivr/@magicfeedback/popup-sdk@<v>/dist/assets/assets/style.css`). Si el build
 * cambia de sitio ese fichero, la release siguiente rompe a esas apps sin que nada
 * falle aqui: el paquete se publica igual y el 404 aparece en el movil del cliente.
 *
 * Paso a paso de por que existe este check: `cp -R src/assets dist/assets` daba una
 * ruta u otra segun `dist` estuviera limpio o sucio (`tsup --clean` borra los ficheros
 * pero deja los directorios), asi que la ruta publicada dependia de la maquina que
 * hiciera la release. Se arreglo fijandola; esto lo mantiene fijo.
 */
import { existsSync } from 'node:fs';

const REQUIRED = [
  'dist/assets/assets/style.css', // consumido por CDN desde el SDK nativo — NO mover
  'dist/index.js',
  'dist/index.mjs',
  'dist/index.d.ts',
  'dist/react-native.mjs',
  'dist/react-native.d.ts',
];

const missing = REQUIRED.filter((path) => !existsSync(path));

if (missing.length) {
  console.error('✗ El build no genero los ficheros que espera el paquete publicado:');
  missing.forEach((path) => console.error(`  - ${path}`));
  console.error('\nSi el cambio de ruta es intencionado, hay que actualizar ANTES a los');
  console.error('consumidores por CDN (SDK nativo) y publicar los dos a la vez.');
  process.exit(1);
}

console.log(`✓ Layout del paquete correcto (${REQUIRED.length} rutas comprobadas)`);
