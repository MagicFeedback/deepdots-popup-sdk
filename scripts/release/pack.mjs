#!/usr/bin/env node
/**
 * Empaqueta el paquete UNA vez (MF-3241) y deja `pack.json` normalizado: un solo objeto
 * {name, version, filename, integrity, shasum, files...}, sea cual sea la version de npm.
 * npm <= 11 devuelve un array; npm 12 un objeto con el nombre del paquete como clave.
 *
 *   pack.mjs --out <dir> --json <pack.json>
 *
 * En GitHub Actions escribe los outputs `tgz` e `integrity`. Falla si no sale el .tgz.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Salida de `npm pack --json` / `npm publish --json` de cualquier version de npm, como un objeto. */
export function npmResult(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  if (value && typeof value === 'object' && !('name' in value)) {
    const entries = Object.values(value);
    return entries.length === 1 ? entries[0] : null;
  }
  return value ?? null;
}

function main() {
  const argv = process.argv.slice(2);
  const option = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : null;
  };
  const [out, jsonPath] = [option('out'), option('json')];
  if (!out || !jsonPath) {
    console.error('Uso: pack.mjs --out <dir> --json <pack.json>');
    process.exit(2);
  }
  mkdirSync(out, { recursive: true });
  const raw = execFileSync('npm', ['pack', '--json', '--pack-destination', out], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const pack = npmResult(JSON.parse(raw));
  const tgz = pack?.filename ? resolve(join(out, pack.filename)) : null;
  if (!tgz || !existsSync(tgz) || !pack.integrity) {
    console.error(`npm pack no dejo un tarball reconocible:\n${raw.slice(0, 500)}`);
    process.exit(1);
  }
  writeFileSync(jsonPath, `${JSON.stringify(pack, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tgz=${tgz}\nintegrity=${pack.integrity}\n`);
  console.log(`${pack.filename} ${pack.integrity}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
