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
    const stylesheetLink = container.querySelector('link[data-magicfeedback-css]');
    const spinnerStyles = container.querySelector('#deepdots-spinner-styles') as HTMLStyleElement | null;
    const responsiveStyles = container.querySelector('#deepdots-responsive-styles') as HTMLStyleElement | null;

    expect(stylesheetLink).toBeTruthy();
    expect(spinnerStyles).toBeTruthy();
    expect(responsiveStyles).toBeTruthy();
    expect((spinnerStyles?.textContent || '').length).toBeGreaterThan(50);
    expect((responsiveStyles?.textContent || '').length).toBeGreaterThan(50);
  });
});
