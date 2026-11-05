import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BUNDLED_SURVEY_SDK_VERSION,
  SUPPORTED_SURVEY_SDK_RANGE,
  chooseSurveySdkVersion,
  describeSurveySdkChoice,
  isSupportedSurveySdk,
  surveySdkUrls,
} from './surveySdkVersion';
import { buildSurveyHtml } from './surveyHtml';

/** DD-70: qué survey SDK pinta el survey de un popup. */
describe('surveySdkVersion', () => {
  it('la versión empaquetada es la instalada y la que pide package.json', () => {
    const installed = JSON.parse(readFileSync('node_modules/@magicfeedback/native/package.json', 'utf8')).version;
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const declared = (pkg.dependencies?.['@magicfeedback/native'] ?? pkg.devDependencies?.['@magicfeedback/native']) as string;
    expect(BUNDLED_SURVEY_SDK_VERSION).toBe(installed);
    expect(declared.replace(/^[\^~]/, '')).toBe(BUNDLED_SURVEY_SDK_VERSION);
  });

  it('la empaquetada está dentro del rango que declara el SDK', () => {
    expect(isSupportedSurveySdk(BUNDLED_SURVEY_SDK_VERSION)).toBe(true);
    expect(SUPPORTED_SURVEY_SDK_RANGE).toEqual({ min: '2.2.37', below: '2.3.0' });
  });

  it('rango: min incluido, below excluido', () => {
    expect(isSupportedSurveySdk('2.2.36')).toBe(false);
    expect(isSupportedSurveySdk('2.2.37')).toBe(true);
    expect(isSupportedSurveySdk('2.2.99')).toBe(true);
    expect(isSupportedSurveySdk('2.3.0')).toBe(false);
    expect(isSupportedSurveySdk('3.0.0')).toBe(false);
  });

  it('asignada y en rango → assigned', () => {
    expect(chooseSurveySdkVersion('2.2.38')).toEqual({ version: '2.2.38', source: 'assigned', requested: '2.2.38' });
  });

  it.each([
    [undefined, 'not_assigned'],
    [null, 'not_assigned'],
    ['', 'not_assigned'],
    ['latest', 'invalid'],
    ['2.2', 'invalid'],
    ['2.2.36', 'out_of_range'],
    ['2.3.0', 'out_of_range'],
    [BUNDLED_SURVEY_SDK_VERSION, 'same_as_bundled'],
  ])('%p → bundled (%s)', (requested, reason) => {
    const choice = chooseSurveySdkVersion(requested as string | null | undefined);
    expect(choice.source).toBe('bundled');
    expect(choice.version).toBe(BUNDLED_SURVEY_SDK_VERSION);
    expect(choice.reason).toBe(reason);
  });

  it('URLs: jsDelivr y luego unpkg, siempre con versión exacta', () => {
    expect(surveySdkUrls('2.2.38')).toEqual([
      'https://cdn.jsdelivr.net/npm/@magicfeedback/native@2.2.38/dist/magicfeedback-sdk.browser.js',
      'https://unpkg.com/@magicfeedback/native@2.2.38/dist/magicfeedback-sdk.browser.js',
    ]);
  });

  it('texto del log', () => {
    expect(describeSurveySdkChoice(chooseSurveySdkVersion('2.2.38'))).toBe('survey SDK 2.2.38 (assigned)');
    expect(describeSurveySdkChoice(chooseSurveySdkVersion('2.3.1')))
      .toBe(`survey SDK ${BUNDLED_SURVEY_SDK_VERSION} (bundled: out_of_range, requested 2.3.1)`);
  });

  describe('WebView (React Native)', () => {
    const sources = (html: string) => JSON.parse(/var ddSdkSources=(\[[^\]]*\])/.exec(html)![1]) as string[];

    it('sin versión: la empaquetada, jsDelivr y unpkg', () => {
      expect(sources(buildSurveyHtml({ surveyId: 's', productId: 'p' }))).toEqual(surveySdkUrls(BUNDLED_SURVEY_SDK_VERSION));
    });

    it('con versión asignada: la asignada y, si no carga, la empaquetada', () => {
      expect(sources(buildSurveyHtml({ surveyId: 's', productId: 'p', version: '2.2.38' }))).toEqual([
        ...surveySdkUrls('2.2.38'),
        ...surveySdkUrls(BUNDLED_SURVEY_SDK_VERSION),
      ]);
    });
  });
});
