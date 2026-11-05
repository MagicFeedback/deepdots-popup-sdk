import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * DD-70: `renderPopup` pinta el survey con el survey SDK que devuelve `resolveSurveySdk`
 * (asignado en el Admin o empaquetado) y marca cuál en `data-survey-sdk` del popup.
 */

const makeSdk = (tag: string) => {
    const form = vi.fn(() => ({
        progress: 0,
        total: 1,
        generate: (_divId: string, options: { onLoadedEvent?: (a: unknown) => void }) => {
            options.onLoadedEvent?.({ loading: false, progress: 0, total: 1, formData: { style: {} } });
            return Promise.resolve();
        },
        startForm: () => {},
        send: () => {},
        back: () => {},
    }));
    return { init: vi.fn(), form, tag };
};

const bundled = makeSdk('bundled');
const assigned = makeSdk('2.2.38');
let resolveImpl: (requested: unknown) => Promise<unknown>;
const resolveSurveySdk = vi.fn((requested: unknown, _opts: unknown) => resolveImpl(requested));

vi.mock('./surveySdkLoader', () => ({ resolveSurveySdk: (r: unknown, o: unknown) => resolveSurveySdk(r, o) }));
vi.mock('@magicfeedback/native', () => ({ default: bundled }));

const { renderPopup } = await import('./renderPopup');

async function render(surveySdkVersion?: string | null) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const promise = renderPopup(container, 'survey-1', 'product-1', undefined, vi.fn(), () => {}, 'development',
        undefined, undefined, undefined, undefined, undefined, { surveySdkVersion, cspNonce: 'n1', debug: true });
    return { container, promise };
}

describe('renderPopup · survey SDK asignado (DD-70)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        resolveSurveySdk.mockClear();
        bundled.form.mockClear();
        assigned.form.mockClear();
        resolveImpl = async (requested) => requested === '2.2.38'
            ? { sdk: assigned, css: '/* assigned 2.2.38 */', choice: { version: '2.2.38', source: 'assigned', requested: '2.2.38' } }
            : { sdk: bundled, choice: { version: '2.2.39', source: 'bundled', reason: 'not_assigned' } };
    });

    it('pasa versión, nonce y debug al cargador y pinta con el SDK asignado', async () => {
        const { container, promise } = await render('2.2.38');
        await promise;
        expect(resolveSurveySdk).toHaveBeenCalledWith('2.2.38', { nonce: 'n1', debug: true });
        expect(assigned.init).toHaveBeenCalledWith({ debug: true, env: 'dev' });
        expect(assigned.form).toHaveBeenCalledWith('survey-1', 'product-1', expect.anything(), expect.anything());
        expect(bundled.form).not.toHaveBeenCalled();
        expect((container.querySelector('.deepdots-popup') as HTMLElement).dataset.surveySdk).toBe('2.2.38 assigned');
        // La hoja de esa versión sustituye a la empaquetada en el mismo <style>.
        const style = document.getElementById('magicfeedback-sdk-styles')!;
        expect(style.textContent).toBe('/* assigned 2.2.38 */');
        expect(style.getAttribute('nonce')).toBe('n1');
    });

    it('sin versión: el empaquetado', async () => {
        const { container, promise } = await render(undefined);
        await promise;
        expect(bundled.form).toHaveBeenCalled();
        expect((container.querySelector('.deepdots-popup') as HTMLElement).dataset.surveySdk).toBe('2.2.39 bundled');
        // Una apertura asignada previa no deja su hoja puesta.
        expect(document.getElementById('magicfeedback-sdk-styles')!.textContent).not.toBe('/* assigned 2.2.38 */');
    });

    it('cerrado mientras se descarga: no pinta el survey', async () => {
        let release!: () => void;
        resolveImpl = () => new Promise((r) => {
            release = () => r({ sdk: assigned, choice: { version: '2.2.38', source: 'assigned' } });
        });
        const { container, promise } = await render('2.2.38');
        container.innerHTML = ''; // hide()
        release();
        await promise;
        expect(assigned.form).not.toHaveBeenCalled();
    });
});
