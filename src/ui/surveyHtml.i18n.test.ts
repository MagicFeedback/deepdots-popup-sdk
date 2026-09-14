import { describe, it, expect } from 'vitest';
import { buildSurveyHtml } from './surveyHtml';
import { LABELS, RESOLVE_LOCALE_JS, getLabels, resolveLocale } from '../i18n/labels';

/**
 * Idioma del chrome en la ruta de React Native (HTML dentro del WebView). Mismo contrato que
 * el popup DOM web: label de la API > idioma del survey (`formData.lang[0]`) > idioma del
 * init > inglés. Como aquí el idioma del survey solo se conoce ya dentro del WebView, el HTML
 * lleva embebida la tabla de traducciones y el resolutor de locale.
 */
describe('buildSurveyHtml i18n', () => {
  it('sin idioma deja los textos en inglés (comportamiento previo)', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('backBtn.textContent="Back"');
    expect(html).toContain('submitBtn.textContent="Send"');
    expect(html).toContain('startBtn.textContent="Start survey"');
    expect(html).toContain('completeBtn.textContent="Complete survey"');
  });

  it('con idioma del init arranca traducido', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', language: 'da-DK' });
    const da = getLabels('da');
    expect(html).toContain(`backBtn.textContent=${JSON.stringify(da.back)}`);
    expect(html).toContain(`submitBtn.textContent=${JSON.stringify(da.accept)}`);
    expect(html).toContain(`startBtn.textContent=${JSON.stringify(da.start)}`);
    expect(html).toContain(`completeBtn.textContent=${JSON.stringify(da.complete)}`);
    expect(html).toContain(`aria-label="${da.closeAria}"`);
    expect(html).toContain(`aria-label="${da.loadingAria}"`);
    expect(html).toContain(`>${da.followUp}<`);
  });

  it('el label de la API gana sobre la traducción', () => {
    const html = buildSurveyHtml({
      surveyId: 's1',
      productId: 'p1',
      language: 'da',
      actions: { back: { label: 'Fortryd' } },
    });
    expect(html).toContain('backBtn.textContent="Fortryd"');
    expect(html).toContain(`submitBtn.textContent=${JSON.stringify(getLabels('da').accept)}`);
  });

  it('embebe la tabla de traducciones y los overrides de la API para re-resolver en el WebView', () => {
    const html = buildSurveyHtml({
      surveyId: 's1',
      productId: 'p1',
      actions: { back: { label: 'Fortryd' } },
    });
    // La tabla completa viaja con el HTML: el idioma del survey solo se conoce ya dentro.
    expect(html).toContain('var DD_LABELS=');
    expect(html).toContain(JSON.stringify(LABELS.da.start));
    // Los labels de la API van aparte para que sigan ganando tras re-resolver.
    expect(html).toContain('var DD_ACTION_OVERRIDES=');
    expect(html).toContain('"back":"Fortryd"');
    expect(html).toContain('function ddApplyLabels(');
    // Y se aplica con el idioma del survey al cargar.
    expect(html).toMatch(/formData\.lang/);
  });

  it('los textos de error y del contador de progreso salen de la tabla, no de literales', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).not.toContain("errorHint.textContent='Please answer the required question to continue.'");
    expect(html).not.toContain("progressCurrent.textContent='Question '+label");
    expect(html).toContain('DD_LABELS_ACTIVE.errorRequired');
    expect(html).toContain('DD_LABELS_ACTIVE.question');
  });
});

describe('buildSurveyHtml RTL', () => {
  it('con idioma LTR el contenedor va marcado ltr', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', language: 'da' });
    expect(html).toContain('dir="ltr"');
  });

  it('con idioma árabe el contenedor va marcado rtl', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', language: 'ar-EG' });
    expect(html).toContain('dir="rtl"');
  });

  it('la dirección se re-aplica con el idioma del survey dentro del WebView', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('function ddIsRtl(');
    expect(html).toMatch(/popup\.setAttribute\('dir'/);
  });

  it('el chrome no ancla el texto a la izquierda (alineación lógica)', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('text-align:start');
    expect(html).not.toContain('text-align:left');
    // El botón de cerrar se empuja al lado de cierre con margen lógico, no margin-left.
    expect(html).toContain('margin-inline-start:auto');
    expect(html).not.toContain('margin-left:auto');
  });
});

describe('RESOLVE_LOCALE_JS (paridad con resolveLocale)', () => {
  it('resuelve igual que la versión TS para toda la batería de tags', () => {
    const inline = new Function(`${RESOLVE_LOCALE_JS}; return ddResolveLocale;`)() as (l: unknown) => string;
    const tags = [
      'da', 'da-DK', 'da_DK', 'DA-dk', '  es-419  ', 'es', 'en', 'en-GB',
      'nb-NO', 'nn', 'no', 'sv', 'sv-SE', 'fi', 'fi-FI',
      'zh', 'zh-Hans', 'zh-CN', 'zh-TW', 'de', 'de-DE', 'fr', 'fr-CA', 'pt', 'pt-BR',
      'ar', 'ar-EG', 'bn', 'bn-BD', 'is-IS', '', '   ',
    ];
    for (const tag of tags) {
      expect(inline(tag), tag).toBe(resolveLocale(tag));
    }
    // Valores no-string: ambos deben caer a inglés sin reventar.
    expect(inline(undefined)).toBe(resolveLocale(undefined));
    expect(inline(null)).toBe(resolveLocale(null));
    expect(inline(42)).toBe(resolveLocale(42 as unknown as string));
  });
});
