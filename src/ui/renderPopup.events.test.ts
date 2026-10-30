import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * `popup_clicked` es interacción del usuario y nada más (paridad con KMP).
 *
 * Antes el host recibía también avisos del survey que nadie había provocado: la carga
 * (`loaded`), el inicio del envío (`before_submit`), los errores (`validation_error_required`,
 * `submit_error`), y dos `back` por cada toque en Volver (el botón y `onBackEvent`).
 */

type GenerateOptions = {
    onLoadedEvent?: (args: unknown) => void;
    beforeSubmitEvent?: () => void;
    afterSubmitEvent?: (args: Record<string, unknown>) => void;
    onBackEvent?: (args: Record<string, unknown>) => void;
};

let generateOptions: GenerateOptions | null = null;
const back = vi.fn();

vi.mock('@magicfeedback/native', () => {
    const form = () => ({
        progress: 0,
        total: 3,
        generate: (_divId: string, options: GenerateOptions) => {
            generateOptions = options;
            options.onLoadedEvent?.({ loading: false, progress: 0, total: 3, formData: { style: {} } });
            return Promise.resolve();
        },
        back,
        startForm: () => {},
        send: () => {},
    });
    return { default: { init: () => {}, form } };
});

const { renderPopup } = await import('./renderPopup');
const { getLabels } = await import('../i18n/labels');

const clicks = (emit: ReturnType<typeof vi.fn>) =>
    emit.mock.calls.filter(([type]) => type === 'popup_clicked').map(([, , data]) => (data as { action: string }).action);

async function render() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const emit = vi.fn();
    await renderPopup(container, 'test-survey', 'test-product', undefined, emit, () => {}, 'production');
    await Promise.resolve();
    return { container, emit };
}

describe('renderPopup · popup_clicked solo para interacción', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        generateOptions = null;
        back.mockClear();
    });

    it('cargar el survey no emite popup_clicked', async () => {
        const { emit } = await render();
        expect(generateOptions).not.toBeNull();
        expect(clicks(emit)).toEqual([]);
    });

    it('ni el inicio del envío ni sus errores llegan al host como popup_clicked', async () => {
        const { emit } = await render();
        generateOptions!.beforeSubmitEvent?.();
        generateOptions!.afterSubmitEvent?.({ error: 'No response', progress: 0, total: 3 });
        generateOptions!.beforeSubmitEvent?.();
        generateOptions!.afterSubmitEvent?.({ error: 'Network down', progress: 0, total: 3 });
        expect(clicks(emit)).toEqual([]);
    });

    it('avanzar de página sigue marcando PARTIAL', async () => {
        const { emit } = await render();
        generateOptions!.beforeSubmitEvent?.();
        generateOptions!.afterSubmitEvent?.({ progress: 1, total: 3 });
        expect(clicks(emit)).toEqual(['partial']);
    });

    it('un toque en Volver emite un solo back', async () => {
        const { container, emit } = await render();
        generateOptions!.afterSubmitEvent?.({ progress: 1, total: 3 });
        emit.mockClear();

        (container.querySelector('#dd-back') as HTMLButtonElement).click();
        expect(back).toHaveBeenCalledTimes(1);
        generateOptions!.onBackEvent?.({ progress: 0 });

        expect(clicks(emit)).toEqual(['back']);
    });
});

describe('renderPopup · survey_error', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        generateOptions = null;
    });

    const surveyErrors = (emit: ReturnType<typeof vi.fn>) =>
        emit.mock.calls.filter(([type]) => type === 'survey_error').map(([, , data]) => data);

    it('un fallo de envío emite survey_error con el motivo y enseña errorSubmit', async () => {
        const { container, emit } = await render();
        const error = Object.assign(new Error('No response'), { code: 'SEND_FAILED' });
        generateOptions!.afterSubmitEvent?.({ error, progress: 0, total: 3 });

        expect(surveyErrors(emit)).toEqual([{ reason: 'send_failed', message: 'No response' }]);
        // Con código, "No response" ya no se confunde con una obligatoria vacía.
        expect(container.querySelector('#dd-error')?.textContent).toBe(getLabels('en').errorSubmit);
    });

    it('el error de native 2.2.22 en una follow-up vacía sale como unknown con su texto', async () => {
        const { emit } = await render();
        generateOptions!.afterSubmitEvent?.({ error: new Error('No answers provided'), progress: 0, total: 3 });
        expect(surveyErrors(emit)).toEqual([{ reason: 'unknown', message: 'No answers provided' }]);
    });

    it('una obligatoria vacía no es un fallo: no emite survey_error', async () => {
        const { emit } = await render();
        generateOptions!.afterSubmitEvent?.({ error: Object.assign(new Error('No response'), { code: 'REQUIRED' }), progress: 0, total: 3 });
        generateOptions!.afterSubmitEvent?.({ error: 'No response', progress: 0, total: 3 });
        expect(surveyErrors(emit)).toEqual([]);
    });

    it('el mismo objeto de error dos veces (cierre del survey) emite un solo evento', async () => {
        const { emit } = await render();
        const error = Object.assign(new Error('An error occurred while submitting the form x:'), { code: 'SEND_FAILED' });
        generateOptions!.afterSubmitEvent?.({ error, completed: true, progress: 3, total: 3 });
        generateOptions!.afterSubmitEvent?.({ error, completed: true, progress: 3, total: 3 });
        expect(surveyErrors(emit)).toHaveLength(1);
    });
});

