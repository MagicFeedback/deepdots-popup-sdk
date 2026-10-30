import { describe, it, expect } from 'vitest';
import { classifySubmitError, SUBMIT_ERROR_JS, SURVEY_ERROR_MESSAGE_MAX } from './submitError';

const coded = (code: string, message: string) => Object.assign(new Error(message), { code });

const cases: Array<[string, unknown, string]> = [
    ['REQUIRED con código', coded('REQUIRED', 'No response'), 'required'],
    ['SEND_FAILED con código, aunque el texto diga "No response"', coded('SEND_FAILED', 'No response'), 'send_failed'],
    ['NO_PAGE con código', coded('NO_PAGE', 'No page found'), 'no_page'],
    ['código desconocido cae al texto', coded('WHATEVER', 'No response'), 'required'],
    ['native viejo: "No response" sin código', new Error('No response'), 'required'],
    ['native viejo: string', 'No response', 'required'],
    ['follow-up vacía en native 2.2.22', new Error('No answers provided'), 'unknown'],
    ['string cualquiera', 'An error occurred while submitting the form x:', 'unknown'],
];

describe('classifySubmitError', () => {
    it.each(cases)('%s', (_name, error, reason) => {
        expect(classifySubmitError(error).reason).toBe(reason);
    });

    it('conserva el mensaje y lo recorta', () => {
        expect(classifySubmitError(new Error('No answers provided')).message).toBe('No answers provided');
        expect(classifySubmitError('x'.repeat(1000)).message).toHaveLength(SURVEY_ERROR_MESSAGE_MAX);
    });
});

describe('SUBMIT_ERROR_JS (espejo del WebView)', () => {
    const ddClassifySubmitError = new Function(`${SUBMIT_ERROR_JS}; return ddClassifySubmitError;`)() as typeof classifySubmitError;

    it.each(cases)('%s: mismo resultado que el módulo', (_name, error) => {
        expect(ddClassifySubmitError(error)).toEqual(classifySubmitError(error));
    });

    it('recorta igual que el módulo', () => {
        const long = 'y'.repeat(1000);
        expect(ddClassifySubmitError(long)).toEqual(classifySubmitError(long));
    });
});
