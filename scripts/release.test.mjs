import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextVersion, promoteUnreleased, unreleasedBody, versionBody } from './release.mjs';

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- Algo nuevo.

## [1.9.0] — 2026-10-06

### Fixed

- Algo arreglado.

[1.9.0]: https://example.com/compare
`;

describe('release: CHANGELOG', () => {
  it('lee el cuerpo de [Unreleased]', () => {
    expect(unreleasedBody(CHANGELOG)).toBe('### Added\n\n- Algo nuevo.');
  });

  it('[Unreleased] vacia devuelve null', () => {
    expect(unreleasedBody('# C\n\n## [Unreleased]\n\n## [1.0.0] — x\n\n- a\n')).toBeNull();
  });

  it('promueve [Unreleased] a la version nueva y la deja vacia', () => {
    const out = promoteUnreleased(CHANGELOG, '1.10.0', '2026-10-07');
    expect(out).toContain('## [Unreleased]\n\n## [1.10.0] — 2026-10-07\n\n### Added');
    expect(unreleasedBody(out)).toBeNull();
    expect(versionBody(out, '1.10.0')).toBe('### Added\n\n- Algo nuevo.');
    expect(versionBody(out, '1.9.0')).toBe('### Fixed\n\n- Algo arreglado.');
  });

  it('la seccion de una version no se come los enlaces del final', () => {
    expect(versionBody(CHANGELOG, '1.9.0')).not.toContain('https://example.com');
  });

  it('falla si no hay [Unreleased]', () => {
    expect(() => promoteUnreleased('# C\n', '1.0.0', 'x')).toThrow();
  });

  it('funciona con el CHANGELOG real del repo', () => {
    const real = readFileSync(resolve(process.cwd(), 'CHANGELOG.md'), 'utf8');
    expect(real).toMatch(/^## \[Unreleased\]/m);
    const out = promoteUnreleased(real, '99.0.0', '2099-01-01');
    expect(versionBody(out, '99.0.0')).toBe(unreleasedBody(real));
  });
});

describe('release: version', () => {
  it('calcula patch, minor y major', () => {
    expect(nextVersion('1.9.0', 'patch')).toBe('1.9.1');
    expect(nextVersion('1.9.0', 'minor')).toBe('1.10.0');
    expect(nextVersion('1.9.0', 'major')).toBe('2.0.0');
  });

  it('acepta una version explicita, tambien prerelease', () => {
    expect(nextVersion('1.9.0', '1.9.3')).toBe('1.9.3');
    expect(nextVersion('1.9.0', '2.0.0-beta.1')).toBe('2.0.0-beta.1');
  });

  it('rechaza lo que no es semver', () => {
    expect(() => nextVersion('1.9.0', '1.9')).toThrow();
    expect(() => nextVersion('1.9.0', 'next')).toThrow();
  });
});
