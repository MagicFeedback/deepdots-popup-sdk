import { describe, it, expect } from 'vitest';
import { renderPopup } from './renderPopup';
import { DeepdotsEventType } from '../types';

describe('renderPopup style injection', () => {
  it('injects local styleCSS into the popup', async () => {
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
    const styleTag = container.querySelector('#deepdots-local-ui-styles') as HTMLStyleElement | null;
    expect(styleTag).toBeTruthy();
    expect((styleTag?.textContent || '').length).toBeGreaterThan(50);
  });
});
