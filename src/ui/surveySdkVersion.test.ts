import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BUNDLED_SURVEY_SDK_VERSION,
  SUPPORTED_SURVEY_SDK_VERSIONS,
  chooseSurveySdkVersion,
  describeSurveySdkChoice,
  isSupportedSurveySdk,
  surveySdkCssUrls,
  surveySdkUrls,
} from './surveySdkVersion';
import { SURVEY_CSS_LOADERS } from './surveyCss';
import { SDK_VERSION } from '../version';
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

  it('la lista soportada = las hojas vendorizadas = los loaders del popup DOM, e incluye la empaquetada', () => {
    const files = readdirSync('src/assets/survey-css').filter((f) => f.endsWith('.css')).map((f) => f.replace(/\.css$/, '')).sort();
    expect([...SUPPORTED_SURVEY_SDK_VERSIONS].sort()).toEqual(files);
    expect(Object.keys(SURVEY_CSS_LOADERS).sort()).toEqual(files);
    expect(isSupportedSurveySdk(BUNDLED_SURVEY_SDK_VERSION)).toBe(true);
  });

  it('la hoja de la versión empaquetada es la misma que style.css', () => {
    expect(readFileSync(`src/assets/survey-css/${BUNDLED_SURVEY_SDK_VERSION}.css`, 'utf8'))
      .toBe(readFileSync('src/assets/style.css', 'utf8'));
  });

  it('cada hoja vendorizada está acotada al popup y dice su versión', () => {
    for (const v of SUPPORTED_SURVEY_SDK_VERSIONS) {
      const css = readFileSync(`src/assets/survey-css/${v}.css`, 'utf8');
      expect(css).toContain(`Copia de @magicfeedback/native@${v}`);
      expect(css).not.toMatch(/@import url\(/);
      expect(css).toContain('.deepdots-popup');
    }
  });

  it('soportadas: solo las de la lista', () => {
    expect(isSupportedSurveySdk('2.2.36')).toBe(false);
    expect(isSupportedSurveySdk('2.2.37')).toBe(true);
    expect(isSupportedSurveySdk('2.2.38')).toBe(true);
    expect(isSupportedSurveySdk('2.2.40')).toBe(false);
    expect(isSupportedSurveySdk('2.3.0')).toBe(false);
  });

  it('asignada y soportada → assigned', () => {
    expect(chooseSurveySdkVersion('2.2.38')).toEqual({ version: '2.2.38', source: 'assigned', requested: '2.2.38' });
  });

  it.each([
    [undefined, 'not_assigned'],
    [null, 'not_assigned'],
    ['', 'not_assigned'],
    ['latest', 'invalid'],
    ['2.2', 'invalid'],
    ['2.2.36', 'unsupported'],
    ['2.3.0', 'unsupported'],
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
      .toBe(`survey SDK ${BUNDLED_SURVEY_SDK_VERSION} (bundled: unsupported, requested 2.3.1)`);
    expect(surveySdkCssUrls('2.2.38')[0])
      .toBe(`https://cdn.jsdelivr.net/npm/@magicfeedback/popup-sdk@${SDK_VERSION}/dist/assets/assets/survey-css/2.2.38.css`);
  });

  describe('WebView (React Native)', () => {
    const json = (html: string, name: string) => JSON.parse(new RegExp(`\\b${name}=(null|\\{[^;]*?\\}|\\[[^\\]]*\\])[,;]`).exec(html)![1]);

    it('sin versión: nada asignado, la JS empaquetada (jsDelivr, unpkg) con su hoja inline', () => {
      const html = buildSurveyHtml({ surveyId: 's', productId: 'p' });
      expect(json(html, 'ddAssigned')).toBeNull();
      expect(json(html, 'ddBundledJs')).toEqual(surveySdkUrls(BUNDLED_SURVEY_SDK_VERSION));
      expect(html).toContain('<style id="dd-survey-css">');
    });

    it('con versión asignada: su hoja y su JS; la empaquetada de respaldo', () => {
      const html = buildSurveyHtml({ surveyId: 's', productId: 'p', version: '2.2.38' });
      expect(json(html, 'ddAssigned')).toEqual({ version: '2.2.38', css: surveySdkCssUrls('2.2.38'), js: surveySdkUrls('2.2.38') });
      expect(json(html, 'ddBundledJs')).toEqual(surveySdkUrls(BUNDLED_SURVEY_SDK_VERSION));
    });
  });
});
