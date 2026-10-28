import { describe, expect, it } from 'vitest';
import {
  checkManifestConsistency,
  checkPullRequest,
  checkRelease,
  compareVersions,
  isPackagePath,
  manifestChanged,
  parseChangelog,
} from './rules.mjs';

const changelog = ({ unreleased = '', releases = [['1.17.0', '2026-10-26', '### Fixed\n\n- Algo.']] } = {}) =>
  [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    unreleased,
    '',
    ...releases.flatMap(([v, d, body]) => [`## [${v}] — ${d}`, '', body, '']),
    '[1.17.0]: https://example.com/compare',
  ].join('\n');

const pkg = (version, extra = {}) => ({ name: '@magicfeedback/popup-sdk', version, devDependencies: { '@magicfeedback/native': '^2.2.33', vitest: '^4' }, ...extra });
const lock = (version, nativeVersion = '2.2.33', vitest = '4.1.0') => ({
  version,
  packages: {
    '': { version },
    'node_modules/@magicfeedback/native': { version: nativeVersion, dev: true, dependencies: { 'cross-fetch': '^3' } },
    'node_modules/cross-fetch': { version: '3.1.8', dev: true },
    'node_modules/vitest': { version: vitest, dev: true },
  },
});

const base = { basePkg: pkg('1.17.0'), baseLock: lock('1.17.0'), baseChangelog: changelog() };

describe('release rules: que cuenta como cambio del paquete', () => {
  it('src cuenta; tests, docs y CI no', () => {
    expect(isPackagePath('src/core/deepdots-popups.ts')).toBe(true);
    expect(isPackagePath('tsup.rn.config.ts')).toBe(true);
    expect(isPackagePath('src/core/deepdots-popups.test.ts')).toBe(false);
    expect(isPackagePath('src/core/test-helpers.ts')).toBe(false);
    expect(isPackagePath('docs/VERSIONING.md')).toBe(false);
    expect(isPackagePath('.github/workflows/ci.yml')).toBe(false);
  });

  it('subir una herramienta de test no cambia el paquete; subir el renderer empaquetado, si', () => {
    const tooling = { ...base, headPkg: pkg('1.17.0', { scripts: { x: 'y' } }), headLock: lock('1.17.0', '2.2.33', '4.2.0') };
    expect(manifestChanged(tooling)).toBe(false);
    const renderer = { ...base, headPkg: pkg('1.17.0'), headLock: lock('1.17.0', '2.2.34') };
    expect(manifestChanged(renderer)).toBe(true);
    const transitive = structuredClone(lock('1.17.0'));
    transitive.packages['node_modules/cross-fetch'].version = '3.2.0';
    expect(manifestChanged({ ...base, headPkg: pkg('1.17.0'), headLock: transitive })).toBe(true);
  });
});

describe('release rules: PR', () => {
  const pr = (over) =>
    checkPullRequest({ baseBranch: 'dev', changedFiles: ['src/index.ts'], ...base, headPkg: pkg('1.17.0'), headLock: lock('1.17.0'), headChangelog: changelog(), ...over });

  it('cambio del paquete hacia dev sin notas en [Unreleased]: bloqueado', () => {
    const r = pr();
    expect(r.kind).toBe('change');
    expect(r.errors.join()).toMatch(/release notes/);
  });

  it('cambio del paquete hacia dev con notas nuevas: ok', () => {
    expect(pr({ headChangelog: changelog({ unreleased: '### Fixed\n\n- Arreglo.' }) }).errors).toEqual([]);
  });

  it('notas que ya estaban en la base no cuentan como nuevas', () => {
    const withNotes = changelog({ unreleased: '- Arreglo anterior.' });
    expect(pr({ baseChangelog: withNotes, headChangelog: withNotes }).errors.join()).toMatch(/release notes/);
  });

  it('una cabecera ### sin bullets no son notas', () => {
    expect(pr({ headChangelog: changelog({ unreleased: '### Fixed\n\n-' }) }).errors.join()).toMatch(/release notes/);
  });

  it('PR que no toca el paquete: nada que pedir', () => {
    expect(pr({ changedFiles: ['docs/VERSIONING.md', 'src/a.test.ts'] })).toEqual({ kind: 'none', reasons: [], errors: [] });
  });

  it('hacia main, cambiar el paquete sin bump: bloqueado', () => {
    const r = pr({ baseBranch: 'main', headChangelog: changelog({ unreleased: '- Arreglo.' }) });
    expect(r.errors.join()).toMatch(/sin subir la version/);
  });

  it('hacia main, promocionar exactamente lo etiquetado: ok', () => {
    expect(pr({ baseBranch: 'main', tagExists: true, tagMatchesHead: true }).errors).toEqual([]);
  });

  it('PR de release: version mayor, seccion fechada con notas y [Unreleased] vacia', () => {
    const headChangelog = changelog({ releases: [['1.18.0', '2026-10-28', '### Added\n\n- Gate.'], ['1.17.0', '2026-10-26', '- x']] });
    const r = pr({ headPkg: pkg('1.18.0'), headLock: lock('1.18.0'), headChangelog });
    expect(r.kind).toBe('release');
    expect(r.errors).toEqual([]);
  });

  it('PR de release sin release notes: bloqueado', () => {
    const headChangelog = changelog({ releases: [['1.18.0', '2026-10-28', '### Added'], ['1.17.0', '2026-10-26', '- x']] });
    expect(pr({ headPkg: pkg('1.18.0'), headChangelog }).errors.join()).toMatch(/vacia/);
    expect(pr({ headPkg: pkg('1.18.0') }).errors.join()).toMatch(/no tiene seccion/);
  });

  it('PR de release que baja la version o deja notas en [Unreleased]: bloqueado', () => {
    const headChangelog = changelog({ unreleased: '- Pendiente.', releases: [['1.16.9', '2026-10-28', '- x'], ['1.17.0', '2026-10-26', '- x']] });
    const errors = pr({ headPkg: pkg('1.16.9'), headChangelog }).errors.join('\n');
    expect(errors).toMatch(/baja o se repite/);
    expect(errors).toMatch(/\[Unreleased\]/);
  });
});

describe('release rules: publicacion', () => {
  const tags = ['v1.16.0', 'v1.16.1', 'v1.17.0'];
  const notes = (v) => changelog({ releases: [[v, '2026-10-28', '- Cambio.']] });

  it('tag = version, con bump y notas: latest', () => {
    expect(checkRelease({ tag: 'v1.18.0', pkg: pkg('1.18.0'), changelog: notes('1.18.0'), previousTags: tags })).toEqual({ errors: [], distTag: 'latest' });
  });

  it('sin bump (la version ya esta publicada): bloqueado', () => {
    const { errors } = checkRelease({ tag: 'v1.17.0', pkg: pkg('1.17.0'), changelog: notes('1.17.0'), previousTags: [...tags, 'v1.17.1'] });
    expect(errors.join()).toMatch(/Sin bump/);
  });

  it('tag distinto de package.json: bloqueado', () => {
    expect(checkRelease({ tag: 'v1.18.1', pkg: pkg('1.18.0'), changelog: notes('1.18.0'), previousTags: tags }).errors.join()).toMatch(/no coincide/);
  });

  it('sin release notes: bloqueado', () => {
    expect(checkRelease({ tag: 'v1.18.0', pkg: pkg('1.18.0'), changelog: changelog(), previousTags: tags }).errors.join()).toMatch(/no tiene seccion/);
  });

  it('parche de una linea anterior: permitido, sin mover latest', () => {
    expect(checkRelease({ tag: 'v1.16.2', pkg: pkg('1.16.2'), changelog: notes('1.16.2'), previousTags: tags })).toEqual({ errors: [], distTag: 'release-1.16' });
  });

  it('prerelease va a next', () => {
    expect(checkRelease({ tag: 'v1.18.0-beta.1', pkg: pkg('1.18.0-beta.1'), changelog: notes('1.18.0-beta.1'), previousTags: tags }).distTag).toBe('next');
  });
});

describe('release rules: manifiesto y CHANGELOG', () => {
  const manifest = { package: '@magicfeedback/popup-sdk', version: '1.17.0', surveyRenderer: { version: '2.2.33', cdnVersion: '2.2.33' }, fixtures: [{ id: 'a' }] };

  it('manifiesto coherente con package.json y el renderer empaquetado', () => {
    expect(checkManifestConsistency({ manifest, pkg: pkg('1.17.0'), nativeVersion: '2.2.33', cdnVersion: '2.2.33' })).toEqual([]);
  });

  it('version o renderer distintos: errores', () => {
    const errors = checkManifestConsistency({ manifest, pkg: pkg('1.18.0'), nativeVersion: '2.2.34', cdnVersion: '2.2.30' }).join('\n');
    expect(errors).toMatch(/1\.17\.0 y package\.json 1\.18\.0/);
    expect(errors).toMatch(/@magicfeedback\/native 2\.2\.34/);
    expect(errors).toMatch(/surveyHtml\.ts carga 2\.2\.30/);
  });

  it('lee el CHANGELOG real del repo con su separador —', async () => {
    const { readFileSync } = await import('node:fs');
    const sections = parseChangelog(readFileSync('CHANGELOG.md', 'utf8'));
    expect(sections[0].version).toBe('Unreleased');
    expect(sections[1].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('compara semver con prereleases', () => {
    expect(compareVersions('1.18.0', '1.17.9')).toBeGreaterThan(0);
    expect(compareVersions('1.18.0-beta.1', '1.18.0')).toBeLessThan(0);
  });
});
