import { describe, expect, it } from 'vitest';
import { approvalsFrom, releasePullFrom, verifyArtifact } from './metadata.mjs';

describe('release metadata', () => {
  it('cuenta la ultima revision de cada revisor', () => {
    const reviews = [
      { user: { login: 'ana' }, state: 'CHANGES_REQUESTED', submitted_at: '1' },
      { user: { login: 'ana' }, state: 'APPROVED', submitted_at: '2' },
      { user: { login: 'leo' }, state: 'APPROVED', submitted_at: '3' },
      { user: { login: 'leo' }, state: 'COMMENTED', submitted_at: '4' },
      { user: { login: 'eva' }, state: 'APPROVED', submitted_at: '5' },
      { user: { login: 'eva' }, state: 'DISMISSED', submitted_at: '6' },
    ];
    expect(approvalsFrom(reviews)).toEqual([
      { by: 'ana', at: '2' },
      { by: 'leo', at: '3' },
    ]);
  });

  it('la PR de release es la que fusiono ese commit', () => {
    const pulls = [
      { number: 1, merged_at: 'x', merge_commit_sha: 'other', base: { ref: 'dev' } },
      { number: 2, merged_at: 'x', merge_commit_sha: 'abc', base: { ref: 'dev' } },
    ];
    expect(releasePullFrom(pulls, 'abc').number).toBe(2);
    expect(releasePullFrom([{ number: 3, merged_at: null }], 'abc')).toBeNull();
  });

  it('lo publicado tiene que ser el tarball probado', () => {
    const pack = { version: '1.18.0', integrity: 'sha512-A' };
    const sha256 = 'a'.repeat(64);
    expect(verifyArtifact({ pack, publish: { version: '1.18.0', integrity: 'sha512-A' }, sha256, tgzSha512: 'sha512-A' })).toEqual([]);
    expect(verifyArtifact({ pack, publish: { version: '1.18.0', integrity: 'sha512-B' }, sha256, tgzSha512: 'sha512-A' }).join()).toMatch(/npm guardo otro artefacto/);
    expect(verifyArtifact({ pack, sha256, tgzSha512: 'sha512-C' }).join()).toMatch(/no es el que dio npm pack/);
  });
});

describe('salida de npm --json', async () => {
  const { npmResult } = await import('./pack.mjs');
  const info = { name: '@magicfeedback/popup-sdk', filename: 'x.tgz', integrity: 'sha512-A' };

  it('acepta las formas de npm 11 (array, objeto) y de npm 12 (por nombre)', () => {
    expect(npmResult([info])).toEqual(info);
    expect(npmResult(info)).toEqual(info);
    expect(npmResult({ '@magicfeedback/popup-sdk': info })).toEqual(info);
    expect(npmResult({})).toBeNull();
  });
});
