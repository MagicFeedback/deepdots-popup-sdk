#!/usr/bin/env node
/**
 * Regresión visual del popup web (DD-28): captura + comparación con las referencias aprobadas.
 *
 *   node apps/test-app/visual/run.mjs            en esta máquina (el CI ya corre dentro de la imagen)
 *   node apps/test-app/visual/run.mjs --docker   dentro de la imagen oficial de Playwright: lo que
 *                                                hay que usar en local, porque las referencias se
 *                                                generan ahí (fuentes y rasterizado de Linux)
 *
 * Variables: SDK_VERSION (local por defecto; `local` necesita `npm run build` antes),
 * TEST_APP_PORT (5180 por defecto; en este Mac usar otro, p. ej. 5191, si el 5180 está ocupado).
 *
 * Sale con 1 si una captura falla o si algo no coincide con su referencia aprobada. Evidencia en
 * apps/test-app/visual/out/report/ (report.html, results.json, summary.md, candidates/).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';

const here = import.meta.dirname;
const root = join(here, '..', '..', '..');
const rel = (p) => relative(root, p);

if (process.argv.includes('--docker')) {
  const pw = JSON.parse(readFileSync(join(root, 'node_modules', '@playwright', 'test', 'package.json'), 'utf8')).version;
  const image = `mcr.microsoft.com/playwright:v${pw}-noble`;
  const env = ['SDK_VERSION', 'TEST_APP_PORT'].flatMap((k) => (process.env[k] ? ['-e', `${k}=${process.env[k]}`] : []));
  // --platform linux/amd64: la misma arquitectura que el runner del CI (ubuntu-latest). En un Mac
  // ARM va emulada (más lenta), pero rasteriza igual que el CI.
  const args = ['run', '--rm', '--platform', process.env.VISUAL_PLATFORM ?? 'linux/amd64', '--ipc=host', '-v', `${root}:/work`, '-w', '/work', ...env, image, 'node', rel(join(here, 'run.mjs'))];
  console.log(`[visual] docker ${args.join(' ')}`);
  process.exit(spawnSync('docker', args, { stdio: 'inherit' }).status ?? 1);
}

if (process.platform !== 'linux') {
  console.log(`[visual] ⚠️ running on ${process.platform}: fonts render differently than in the baselines (Linux image). Use --docker.`);
}

rmSync(join(here, 'out'), { recursive: true, force: true });
const capture = spawnSync('npx', ['playwright', 'test', '-c', rel(join(here, 'playwright.config.ts'))], { cwd: root, stdio: 'inherit' });
const check = spawnSync(
  'node',
  ['scripts/visual/check.mjs', '--suite', rel(here), '--actual', rel(join(here, 'out', 'actual')), '--out', rel(join(here, 'out', 'report')), '--title', 'Visual regression · web'],
  { cwd: root, stdio: 'inherit' },
);
if (capture.status !== 0) console.log('::error::Some visual captures failed (see the Playwright report): their screenshots are missing');
process.exit(capture.status || check.status || 0);
