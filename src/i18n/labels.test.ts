import { describe, it, expect } from 'vitest';
import {
  LABELS,
  RTL_LOCALES,
  SUPPORTED_LANGUAGES,
  getLabels,
  isRtlLanguage,
  resolveActionLabels,
  resolveLocale,
} from './labels';

describe('resolveLocale', () => {
  it('mapea el prefijo del tag BCP-47, sin importar región ni caja', () => {
    expect(resolveLocale('da')).toBe('da');
    expect(resolveLocale('da-DK')).toBe('da');
    expect(resolveLocale('da_DK')).toBe('da');
    expect(resolveLocale('DA-dk')).toBe('da');
    expect(resolveLocale('  es-419  ')).toBe('es');
  });

  it('colapsa las variantes de noruego y de chino', () => {
    expect(resolveLocale('nb-NO')).toBe('no');
    expect(resolveLocale('nn')).toBe('no');
    expect(resolveLocale('no')).toBe('no');
    expect(resolveLocale('zh')).toBe('zh-CN');
    expect(resolveLocale('zh-Hans')).toBe('zh-CN');
    expect(resolveLocale('zh-TW')).toBe('zh-CN');
  });

  it('cubre los 11 idiomas que la plataforma ofrece para un survey', () => {
    // Lista del selector de idioma de la plataforma. Si aparece uno nuevo, este test lo caza:
    // sin traducción propia resolvería a 'en' y el chrome saldría en inglés bajo un survey
    // traducido, que es justo el bug que arreglamos.
    const platform: Record<string, string> = {
      English: 'en', Danish: 'da', Finnish: 'fi', Norwegian: 'no', Spanish: 'es',
      Swedish: 'sv', Arabic: 'ar', Bengali: 'bn', German: 'de', Portuguese: 'pt', French: 'fr',
    };
    for (const [name, code] of Object.entries(platform)) {
      expect(resolveLocale(code), name).toBe(code);
      expect(SUPPORTED_LANGUAGES, name).toContain(code);
    }
  });

  it('normaliza las variantes regionales de los idiomas nuevos', () => {
    expect(resolveLocale('de-AT')).toBe('de');
    expect(resolveLocale('pt-BR')).toBe('pt');
    expect(resolveLocale('pt-PT')).toBe('pt');
    expect(resolveLocale('fr-CA')).toBe('fr');
    expect(resolveLocale('ar-EG')).toBe('ar');
    expect(resolveLocale('bn-BD')).toBe('bn');
  });

  it('cae a inglés sin idioma o con un idioma no soportado', () => {
    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale(null)).toBe('en');
    expect(resolveLocale('')).toBe('en');
    expect(resolveLocale('   ')).toBe('en');
    expect(resolveLocale('is-IS')).toBe('en'); // islandés: sin traducción propia
    // Valores basura del backend: nunca deben reventar la resolución.
    expect(resolveLocale(42 as unknown as string)).toBe('en');
  });
});

describe('getLabels', () => {
  it('devuelve el juego danés completo', () => {
    const da = getLabels('da-DK');
    expect(da.back).toBe('Tilbage');
    expect(da.start).toBe('Start undersøgelse');
    expect(da.complete).toBe('Afslut undersøgelse');
    expect(da.accept).toBe('Send');
    expect(da.decline).toBe('Annuller');
    expect(da.question).toBe('Spørgsmål');
  });

  it('devuelve el juego alemán completo', () => {
    const de = getLabels('de-AT');
    expect(de.back).toBe('Zurück');
    expect(de.start).toBe('Umfrage starten');
    expect(de.complete).toBe('Umfrage abschließen');
    expect(de.accept).toBe('Senden');
    expect(de.question).toBe('Frage');
    expect(de.of).toBe('von');
  });

  it('todos los locales soportados definen todas las claves, sin vacíos', () => {
    const keys = Object.keys(LABELS.en) as (keyof typeof LABELS.en)[];
    for (const locale of SUPPORTED_LANGUAGES) {
      for (const key of keys) {
        expect(typeof LABELS[locale][key], `${locale}.${key}`).toBe('string');
        expect(LABELS[locale][key].length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('resolveActionLabels', () => {
  it('sin actions de la API usa los textos del idioma', () => {
    expect(resolveActionLabels(undefined, 'da')).toEqual({
      accept: 'Send',
      decline: 'Annuller',
      start: 'Start undersøgelse',
      complete: 'Afslut undersøgelse',
      back: 'Tilbage',
    });
  });

  it('el label de la API gana sobre la traducción del SDK', () => {
    const labels = resolveActionLabels(
      { accept: { label: 'Indsend nu', surveyId: 's' } },
      'da',
    );
    expect(labels.accept).toBe('Indsend nu');
    // Los que la API no define siguen traducidos.
    expect(labels.back).toBe('Tilbage');
  });

  it('un label vacío o en blanco de la API no pisa la traducción', () => {
    const labels = resolveActionLabels(
      { accept: { label: '   ', surveyId: 's' } },
      'da',
    );
    expect(labels.accept).toBe('Send');
  });
});

describe('isRtlLanguage', () => {
  it('solo el árabe es RTL, con cualquier variante regional', () => {
    // Espejo de `RTL_LANGUAGES` de @magicfeedback/native (2.2.22), que estampa dir="rtl"
    // en el contenedor del survey para esos idiomas. El chrome debe voltear con él.
    expect(RTL_LOCALES).toEqual(['ar']);
    expect(isRtlLanguage('ar')).toBe(true);
    expect(isRtlLanguage('ar-EG')).toBe(true);
    expect(isRtlLanguage('AR_eg')).toBe(true);
  });

  it('el resto de idiomas soportados son LTR', () => {
    for (const locale of SUPPORTED_LANGUAGES.filter((l) => l !== 'ar')) {
      expect(isRtlLanguage(locale), locale).toBe(false);
    }
    expect(isRtlLanguage(undefined)).toBe(false);
    expect(isRtlLanguage('is-IS')).toBe(false);
  });
});
