import { describe, it, expect } from 'vitest';
import { renderPopup } from './renderPopup';
import { DeepdotsEventType } from '../types';

describe('renderPopup style injection', () => {
  it('injects popup support styles into the DOM', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const emitted: { type: DeepdotsEventType; surveyId: string }[] = [];
    await renderPopup(
      container,
      'test-survey',
      'test-product',
      undefined,
      (t, id) => emitted.push({ type: t, surveyId: id }),
      () => { container.innerHTML = ''; }
    );
    // Los estilos se inyectan en document.head, no en el container
    const magicfeedbackStyles = document.querySelector('#magicfeedback-sdk-styles') as HTMLStyleElement | null;
    const spinnerStyles = document.querySelector('#deepdots-spinner-styles') as HTMLStyleElement | null;
    const responsiveStyles = document.querySelector('#deepdots-responsive-styles') as HTMLStyleElement | null;

    expect(magicfeedbackStyles).toBeTruthy();
    expect(spinnerStyles).toBeTruthy();
    expect(responsiveStyles).toBeTruthy();
    expect((spinnerStyles?.textContent || '').length).toBeGreaterThan(50);
    expect((responsiveStyles?.textContent || '').length).toBeGreaterThan(50);
  });
});
