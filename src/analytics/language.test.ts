import { describe, it, expect } from 'vitest';
import { resolveLanguage } from './language';

/** Fake Intl-like object returning a fixed locale. */
function fakeIntl(locale: string | undefined) {
  return { DateTimeFormat: () => ({ resolvedOptions: () => ({ locale }) }) };
}

describe('resolveLanguage', () => {
  it('returns the explicit language over any auto-detected source', () => {
    expect(
      resolveLanguage({
        explicit: 'fr-CA',
        navigator: { language: 'en-US' },
        intl: fakeIntl('de-DE'),
      }),
    ).toBe('fr-CA');
  });

  it('falls back to navigator.language when no explicit is given (web)', () => {
    expect(resolveLanguage({ navigator: { language: 'en-US' }, intl: fakeIntl('de-DE') })).toBe('en-US');
  });

  it('falls back to Intl locale when navigator has no language (React Native)', () => {
    expect(resolveLanguage({ navigator: undefined, intl: fakeIntl('es-ES') })).toBe('es-ES');
  });

  it('falls back to Intl locale when navigator.language is empty', () => {
    expect(resolveLanguage({ navigator: { language: '' }, intl: fakeIntl('es-ES') })).toBe('es-ES');
  });

  it('returns undefined when no source yields a language', () => {
    expect(resolveLanguage({ navigator: undefined, intl: undefined })).toBeUndefined();
  });

  it('ignores an empty/whitespace explicit language', () => {
    expect(resolveLanguage({ explicit: '   ', navigator: { language: 'en-US' } })).toBe('en-US');
  });

  it('does not throw if Intl.DateTimeFormat throws, returns undefined', () => {
    const throwingIntl = {
      DateTimeFormat: () => {
        throw new Error('Intl unavailable');
      },
    };
    expect(resolveLanguage({ navigator: undefined, intl: throwingIntl })).toBeUndefined();
  });
});
