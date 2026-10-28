import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateManifest } from './manifest.mjs';

// Copia minima del repo para romper el manifiesto sin tocar el de verdad.
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'popup-sdk-manifest-'));
  for (const path of ['package.json', 'package-lock.json', 'tsconfig.json', 'release', 'src/types', 'src/tracking', 'src/analytics', 'src/ui/surveyHtml.ts', 'docs/VERSIONING.md']) {
    cpSync(path, join(dir, path), { recursive: true });
  }
  return dir;
}

const edit = (dir, path, fn) => {
  const file = join(dir, path);
  writeFileSync(file, JSON.stringify(fn(JSON.parse(readFileSync(file, 'utf8'))), null, 2));
};

describe('manifiesto de compatibilidad', () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it('el del repo es valido (schema, version, renderer, config schema y fixtures)', () => {
    const { errors } = validateManifest();
    expect(errors).toEqual([]);
  }, 30_000);

  it('sin known issues ni hosts: invalido', () => {
    dir = sandbox();
    edit(dir, 'release/compatibility.json', ({ knownIssues, hosts, ...m }) => m);
    const errors = validateManifest({ root: dir, checkGenerated: false }).errors.join('\n');
    expect(errors).toMatch(/must have required property 'knownIssues'/);
    expect(errors).toMatch(/must have required property 'hosts'/);
  });

  it('plataforma o version mal formadas: invalido', () => {
    dir = sandbox();
    edit(dir, 'release/compatibility.json', (m) => ({ ...m, platform: 'ios', version: 'latest' }));
    const errors = validateManifest({ root: dir, checkGenerated: false }).errors.join('\n');
    expect(errors).toMatch(/\/platform must be equal to constant/);
    expect(errors).toMatch(/\/version must match pattern/);
  });

  it('JSON roto: invalido', () => {
    dir = sandbox();
    writeFileSync(join(dir, 'release/compatibility.json'), '{ "version": ');
    expect(validateManifest({ root: dir }).errors.join()).toMatch(/no es JSON valido/);
  });

  it('fixture que no cumple el schema de configuracion: invalido', () => {
    dir = sandbox();
    edit(dir, 'release/fixtures/popups/minimal-event.json', ([popup]) => [{ ...popup, triggers: [{ type: 'hover', value: 1 }] }]);
    expect(validateManifest({ root: dir, checkGenerated: false }).errors.join()).toMatch(/minimal-event\.json\/0\/triggers\/0\/type/);
  });

  it('tipos de configuracion cambiados sin regenerar el schema: invalido', () => {
    dir = sandbox();
    const types = join(dir, 'src/types/index.ts');
    writeFileSync(types, readFileSync(types, 'utf8').replace('cspNonce?: string;', 'cspNonce?: string;\n    newOption?: boolean;'));
    expect(validateManifest({ root: dir }).errors.join()).toMatch(/npm run release:schema/);
  }, 30_000);
});
