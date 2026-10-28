#!/usr/bin/env node
/**
 * Prueba de humo del tarball que se va a publicar (MF-3241): se instala en un proyecto vacio,
 * se importa como ESM y CJS y se comprueba que trae los ficheros que consumen los hosts. Lo
 * que se prueba aqui es exactamente el fichero que release.yml publica despues.
 *
 *   smoke.mjs <paquete.tgz>
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const tgz = process.argv[2];
if (!tgz || !tgz.endsWith('.tgz') || !existsSync(tgz) || !statSync(tgz).isFile()) {
  console.error('Uso: smoke.mjs <paquete.tgz>');
  process.exit(2);
}

const PKG = '@magicfeedback/popup-sdk';
// Lo que un host usa: si alguno desaparece del bundle, la release rompe integraciones.
const EXPORTS = ['DeepdotsPopups', 'BrowserPopupRenderer', 'NoopPopupRenderer', 'ReactNativePopupRenderer', 'buildSurveyHtml'];
// El CSS lo carga por CDN el SDK nativo con esta ruta exacta (scripts/check-package-layout.mjs).
const FILES = ['dist/index.js', 'dist/index.mjs', 'dist/index.d.ts', 'dist/react-native.js', 'dist/react-native.mjs', 'dist/react-native.d.ts', 'dist/assets/assets/style.css'];

const dir = mkdtempSync(join(tmpdir(), 'popup-sdk-smoke-'));
const failures = [];
try {
  writeFileSync(join(dir, 'package.json'), '{"name":"smoke","private":true}\n');
  execFileSync('npm', ['install', resolve(tgz), '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, stdio: 'inherit' });

  const installed = join(dir, 'node_modules', PKG);
  const version = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')).version;
  for (const file of FILES) if (!existsSync(join(installed, file))) failures.push(`falta ${file}`);

  const probe = (type, code) => {
    try {
      return JSON.parse(execFileSync('node', [`--input-type=${type}`, '-e', code], { cwd: dir, encoding: 'utf8' }));
    } catch (e) {
      failures.push(`${type}: ${String(e.stderr || e.message).split('\n').find(Boolean)}`);
      return [];
    }
  };
  const list = JSON.stringify(EXPORTS);
  const cjs = probe('commonjs', `const m = require('${PKG}'); console.log(JSON.stringify(${list}.filter((k) => typeof m[k] !== 'function')))`);
  const esm = probe('module', `const m = await import('${PKG}'); console.log(JSON.stringify(${list}.filter((k) => typeof m[k] !== 'function')))`);
  for (const k of cjs) failures.push(`CJS no exporta ${k}`);
  for (const k of esm) failures.push(`ESM no exporta ${k}`);

  if (failures.length) {
    for (const f of failures) console.error(process.env.GITHUB_ACTIONS ? `::error title=Smoke test::${f}` : `x  ${f}`);
    process.exit(1);
  }
  console.log(`✓ ${PKG}@${version}: ${FILES.length} ficheros, ${EXPORTS.length} exports en ESM y CJS`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
