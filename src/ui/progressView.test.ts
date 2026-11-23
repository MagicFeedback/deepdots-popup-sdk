import { describe, expect, it } from 'vitest';
import { PROGRESS_VIEW_JS, progressView, type ProgressViewInput } from './progressView';
import { getLabels, LABELS } from '../i18n/labels';

const en = getLabels('en');

describe('progressView (DD-210)', () => {
    it('sin modo es la barra de siempre: Question 3 of 5, 60 %', () => {
        expect(progressView({ progress: 2, total: 5 }, en)).toEqual({
            visible: true, percent: 60, current: 'Question 3', rest: ' of 5',
        });
    });

    it('modo current: oculta en la pantalla final', () => {
        expect(progressView({ progress: 4, total: 5, completed: true, mode: 'current' }, en).visible).toBe(false);
    });

    it('modo completed: 2 of 5 answered al 40 % en la pregunta 3', () => {
        expect(progressView({ progress: 2, total: 5, mode: 'completed' }, en)).toEqual({
            visible: true, percent: 40, current: '2 of 5 answered', rest: '',
        });
    });

    it('modo completed: empieza en 0 y la follow-up abierta no la mueve', () => {
        expect(progressView({ progress: 0, total: 5, mode: 'completed' }, en).percent).toBe(0);
        expect(progressView({ progress: 2.5, total: 5, mode: 'completed' }, en).current).toBe('2 of 5 answered');
    });

    it('modo completed: la pantalla final sale al 100 % y siempre N of N', () => {
        expect(progressView({ progress: 4, total: 5, completed: true, mode: 'completed' }, en)).toEqual({
            visible: true, percent: 100, current: '5 of 5 answered', rest: '',
        });
        // Una rama saltó páginas: se respondieron 3.
        expect(progressView({ progress: 2, total: 5, completed: true, mode: 'completed' }, en).current)
            .toBe('3 of 3 answered');
    });

    it('modo completed con porcentaje', () => {
        expect(progressView({ progress: 2, total: 5, mode: 'completed', unit: 'percentage' }, en).current).toBe('40%');
    });

    it('traduce el contador', () => {
        expect(progressView({ progress: 2, total: 5, mode: 'completed' }, getLabels('da')).current)
            .toBe('2 af 5 besvaret');
    });

    it('todo idioma tiene answeredOf con los dos huecos', () => {
        for (const [locale, l] of Object.entries(LABELS)) {
            expect(l.answeredOf, locale).toContain('{answered}');
            expect(l.answeredOf, locale).toContain('{total}');
        }
    });

    it('el espejo ES5 del WebView da lo mismo que el módulo', () => {
        const js = new Function(`${PROGRESS_VIEW_JS}; return ddProgressView;`)() as (
            i: ProgressViewInput, l: typeof en,
        ) => unknown;
        const cases: ProgressViewInput[] = [];
        for (const mode of [undefined, 'current', 'completed', 'x']) {
            for (const unit of ['fraction', 'percentage']) {
                for (const completed of [false, true]) {
                    for (const [progress, total] of [[0, 5], [2, 5], [2.5, 5], [4, 5], [0, 1], [7, 3]]) {
                        cases.push({ progress, total, completed, mode, unit });
                    }
                }
            }
        }
        for (const c of cases) expect(js(c, en), JSON.stringify(c)).toEqual(progressView(c, en));
    });
});
