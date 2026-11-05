import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSurveyCompat, codeFacts, compatLine, compatLineErrors, DEFAULT_SURVEY_VERSIONS_URL } from './survey-compat.mjs';

/** DD-70: the "Survey SDK supported" line of the release notes, from the code + the registry. */
const registry = {
  latest: '3.2.0',
  items: [
    { version: '3.4.1', status: 'candidate', sdkVersion: '2.2.39' },
    { version: '3.4.0', status: 'stable', sdkVersion: '2.2.38' },
    { version: '3.3.0', status: 'deprecated', sdkVersion: '2.2.38' },
    { version: '3.2.0', status: 'stable', sdkVersion: '2.2.36' },
    { version: '3.0.0', status: 'stable', sdkVersion: null },
    { version: '9.9.9', status: 'unavailable', sdkVersion: '2.2.39' },
  ],
};
const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });
const source = "export const BUNDLED_SURVEY_SDK_VERSION = '2.2.39';\nexport const SUPPORTED_SURVEY_SDK_VERSIONS = ['2.2.38', '2.2.39'] as const;";

describe('survey-compat', () => {
  it('lee la lista y la empaquetada del codigo real', () => {
    const facts = codeFacts(readFileSync('src/ui/surveySdkVersion.ts', 'utf8'));
    expect(facts.supported?.length).toBeGreaterThan(0);
    expect(facts.bundled).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('la linea: SDKs soportados, versiones de survey stable/candidate con esos SDKs, empaquetada', () => {
    const { line, frontends } = compatLine({ supported: ['2.2.39', '2.2.38'], bundled: '2.2.39', registry });
    expect(frontends).toEqual(['3.4.0', '3.4.1']);
    expect(line).toBe('Survey SDK supported: 2.2.38–2.2.39 (survey frontend 3.4.0–3.4.1); bundled: 2.2.39.');
  });

  it('una sola version o ninguna', () => {
    expect(compatLine({ supported: ['2.2.39'], bundled: '2.2.39', registry }).line).toBe('Survey SDK supported: 2.2.39 (survey frontend 3.4.1); bundled: 2.2.39.');
    expect(compatLine({ supported: ['2.2.40'], bundled: '2.2.40', registry }).line).toBe('Survey SDK supported: 2.2.40 (survey frontend none); bundled: 2.2.40.');
  });

  it('la seccion tiene que llevar la linea; lo que siga a la linea es libre', () => {
    const expected = 'Survey SDK supported: 2.2.38–2.2.39 (survey frontend 3.4.1); bundled: 2.2.39.';
    expect(compatLineErrors(`${expected} Compatibility table: docs…\n\n### Added`, expected)).toEqual([]);
    expect(compatLineErrors('### Added\n- x', expected)[0]).toMatch(/Falta la linea/);
    expect(compatLineErrors('Survey SDK supported: 2.2.38 (survey frontend 3.3.0); bundled: 2.2.39.', expected)[0]).toMatch(/no coincide/);
  });

  it('release gate: linea correcta pasa, desactualizada bloquea con la esperada', async () => {
    const entryBody = 'Survey SDK supported: 2.2.38–2.2.39 (survey frontend 3.4.0–3.4.1); bundled: 2.2.39.\n\n### Added';
    expect((await checkSurveyCompat({ source, entryBody, fetchImpl: ok(registry), env: {} })).errors).toEqual([]);
    const stale = await checkSurveyCompat({ source, entryBody: 'Survey SDK supported: 2.2.38 (survey frontend 3.3.0); bundled: 2.2.39.', fetchImpl: ok(registry), env: {} });
    expect(stale.errors[0]).toMatch(/deberia empezar por "Survey SDK supported: 2.2.38–2.2.39 \(survey frontend 3.4.0–3.4.1\)/);
  });

  it('registro caido: bloquea, salvo SURVEY_COMPAT_OFFLINE=1 (aviso)', async () => {
    const down = async () => { throw new Error('ECONNREFUSED'); };
    const blocked = await checkSurveyCompat({ source, entryBody: '', fetchImpl: down, env: {} });
    expect(blocked.errors[0]).toMatch(new RegExp(`No se pudo leer el registro.*${DEFAULT_SURVEY_VERSIONS_URL.replace(/[./]/g, '\\$&')}`));
    const offline = await checkSurveyCompat({ source, entryBody: '', fetchImpl: down, env: { SURVEY_COMPAT_OFFLINE: '1' } });
    expect(offline.errors).toEqual([]);
    expect(offline.warnings[0]).toMatch(/sin comprobar/);
  });

  it('SURVEY_VERSIONS_URL cambia el origen (p. ej. DEV)', async () => {
    let asked = '';
    await checkSurveyCompat({ source, entryBody: '', fetchImpl: async (u) => { asked = u; return { ok: true, status: 200, json: async () => registry }; }, env: { SURVEY_VERSIONS_URL: 'https://api-dev.deepdots.com/sdk/survey-versions' } });
    expect(asked).toBe('https://api-dev.deepdots.com/sdk/survey-versions');
  });
});
