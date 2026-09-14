import { describe, it, expect, beforeEach } from 'vitest';
import { resolveSurveyPrimaryColor, surveyPrimaryVars, applySurveyPrimaryColor, PRIMARY_COLOR_JS } from './surveyPalette';

/**
 * Color de marca dentro del survey.
 *
 * El survey pinta sus controles (chips del rating, bordes, foco, selección) con `--mf-primary`,
 * que `@magicfeedback/native` rellena desde `formData.style.primaryColor`. Las integraciones
 * configuran `buttonPrimaryColor` pero muchas dejan `primaryColor` vacío, así que el popup acaba
 * con el botón de la marca y los controles con el `#5d7bad` por defecto del paquete.
 *
 * El popup rellena ese hueco: sin `primaryColor`, usa `buttonPrimaryColor`. Si la integración sí
 * define `primaryColor`, ese manda y aquí no se toca nada.
 */
describe('resolveSurveyPrimaryColor', () => {
  it('respeta el primaryColor de la integración', () => {
    expect(resolveSurveyPrimaryColor({ primaryColor: '#ff0000', buttonPrimaryColor: '#00aeef' })).toBe('#ff0000');
  });

  it('cae al color del botón cuando no hay primaryColor', () => {
    expect(resolveSurveyPrimaryColor({ buttonPrimaryColor: '#00aeef' })).toBe('#00aeef');
  });

  it('sin ninguno de los dos no fuerza nada (se queda el del paquete)', () => {
    expect(resolveSurveyPrimaryColor({})).toBeNull();
    expect(resolveSurveyPrimaryColor(undefined)).toBeNull();
    expect(resolveSurveyPrimaryColor({ primaryColor: '', buttonPrimaryColor: '  ' })).toBeNull();
  });

  it('descarta valores que no son un color hex', () => {
    // El estilo viene de la API y se interpola en CSS: nada que no sea un hex entra.
    expect(resolveSurveyPrimaryColor({ primaryColor: 'red; background: url(evil)' })).toBeNull();
    expect(resolveSurveyPrimaryColor({ primaryColor: 'var(--x)' })).toBeNull();
    expect(resolveSurveyPrimaryColor({ primaryColor: '#12345' })).toBeNull();
    expect(resolveSurveyPrimaryColor({ primaryColor: '#abc' })).toBe('#abc');
    expect(resolveSurveyPrimaryColor({ primaryColor: '#00AEEFCC' })).toBe('#00AEEFCC');
  });

  it('un primaryColor inválido no impide usar el del botón', () => {
    expect(resolveSurveyPrimaryColor({ primaryColor: 'blue', buttonPrimaryColor: '#00aeef' })).toBe('#00aeef');
  });
});

describe('surveyPrimaryVars', () => {
  it('declara las mismas variables que applyPrimaryColor del Surveys SDK', () => {
    // Las derivadas hay que redeclararlas: un `color-mix` escrito en `:root` ya se resolvió allí
    // con el color por defecto, así que heredaría ese valor por mucho que cambie `--mf-primary`.
    const vars = surveyPrimaryVars('#00aeef');
    expect(vars.map(([name]) => name)).toEqual([
      '--mf-primary',
      '--mf-primary-hover',
      '--mf-primary-light',
      '--mf-primary-border',
      '--mf-border-focus',
    ]);
    expect(vars[0][1]).toBe('#00aeef');
    expect(vars[1][1]).toContain('color-mix');
    expect(vars[4][1]).toBe('#00aeef');
  });
});

describe('applySurveyPrimaryColor', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  it('pinta las variables en el elemento', () => {
    applySurveyPrimaryColor(el, { buttonPrimaryColor: '#00aeef' });

    expect(el.style.getPropertyValue('--mf-primary')).toBe('#00aeef');
    expect(el.style.getPropertyValue('--mf-border-focus')).toBe('#00aeef');
  });

  it('no toca nada si no hay color utilizable', () => {
    applySurveyPrimaryColor(el, { primaryColor: 'no-es-un-color' });

    expect(el.getAttribute('style')).toBeFalsy();
  });
});

describe('PRIMARY_COLOR_JS · espejo para el WebView', () => {
  it('se comporta igual que la versión del módulo', () => {
    // Corre dentro del WebView (React Native y KMP), así que va como texto; este test evita que
    // las dos implementaciones se separen.
    const factory = new Function(`${PRIMARY_COLOR_JS}; return ddApplySurveyPrimaryColor;`);
    const apply = factory() as (el: HTMLElement, style: unknown) => void;

    const webView = document.createElement('div');
    const dom = document.createElement('div');
    const style = { buttonPrimaryColor: '#00aeef' };

    apply(webView, style);
    applySurveyPrimaryColor(dom, style);

    expect(webView.getAttribute('style')).toBe(dom.getAttribute('style'));
  });

  it('descarta lo que no es un hex, igual que el módulo', () => {
    const factory = new Function(`${PRIMARY_COLOR_JS}; return ddApplySurveyPrimaryColor;`);
    const apply = factory() as (el: HTMLElement, style: unknown) => void;
    const el = document.createElement('div');

    apply(el, { primaryColor: 'red; background: url(evil)' });

    expect(el.getAttribute('style')).toBeFalsy();
  });
});
