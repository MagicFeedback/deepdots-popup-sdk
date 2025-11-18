import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeepdotsPopups } from '../core/deepdots-popups';
import { ReactNativePopupRenderer } from './react-native-renderer';

// Nota: este test no depende de DOM real, usa stub

describe('ReactNativePopupRenderer stub', () => {
  let popups: DeepdotsPopups;
  let renderer: ReactNativePopupRenderer;

  beforeEach(() => {
    popups = new DeepdotsPopups();
    renderer = new ReactNativePopupRenderer();
    popups.setRenderer(renderer);
    popups.init({ apiKey: 'fake-key', debug: false });
  });

  it('emite popup_clicked al mostrar y survey_completed al completar', async () => {
    const clickedListener = vi.fn();
    const completedListener = vi.fn();
    popups.on('popup_clicked', clickedListener);
    popups.on('survey_completed', completedListener);

    popups.show({ surveyId: 'survey-rn', productId: 'prod-rn' });

    // Esperar microtask
    await Promise.resolve();
    expect(clickedListener).toHaveBeenCalledWith(expect.objectContaining({ type: 'popup_clicked', surveyId: 'survey-rn' }));

    renderer.completeSurvey({ rating: 5 });
    expect(completedListener).toHaveBeenCalledWith(expect.objectContaining({ type: 'survey_completed', surveyId: 'survey-rn', data: { rating: 5 } }));
  });

  it('no emite survey_completed dos veces', async () => {
    const completedListener = vi.fn();
    popups.on('survey_completed', completedListener);
    popups.show({ surveyId: 'survey-rn2', productId: 'prod-rn' });
    await Promise.resolve();
    renderer.completeSurvey();
    renderer.completeSurvey(); // segunda llamada debe ignorarse
    expect(completedListener).toHaveBeenCalledTimes(1);
  });
});

