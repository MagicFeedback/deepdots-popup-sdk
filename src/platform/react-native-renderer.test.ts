import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeepdotsPopups } from '../core/deepdots-popups';
import { ReactNativePopupRenderer, type ReactNativeSurveyPayload } from './react-native-renderer';

describe('ReactNativePopupRenderer (puente WebView)', () => {
  let popups: DeepdotsPopups;
  let renderer: ReactNativePopupRenderer;
  let shown: ReactNativeSurveyPayload | null;
  let hidden: number;

  beforeEach(() => {
    shown = null;
    hidden = 0;
    renderer = new ReactNativePopupRenderer({
      onShow: (p) => {
        shown = p;
      },
      onHide: () => {
        hidden += 1;
      },
    });
    popups = new DeepdotsPopups();
    popups.setRenderer(renderer);
    popups.init({ apiKey: 'fake-key' });
  });

  it('al mostrar, entrega al host el HTML del survey para el WebView', () => {
    popups.show({ surveyId: 'survey-rn', productId: 'prod-rn' });
    expect(shown).toBeTruthy();
    expect(shown!.surveyId).toBe('survey-rn');
    expect(shown!.html).toContain('survey-rn');
    expect(shown!.html).toContain('ReactNativeWebView'); // puente de mensajes
    expect(shown!.html).toContain('magicfeedback'); // carga el survey desde CDN
  });

  it('traduce mensajes del WebView a eventos de popup (PARTIAL una vez, COMPLETED al final)', () => {
    const clicked = vi.fn();
    const completed = vi.fn();
    popups.on('popup_clicked', clicked);
    popups.on('survey_completed', completed);

    popups.show({ surveyId: 'survey-rn', productId: 'prod-rn' });

    renderer.handleMessage(JSON.stringify({ name: 'loaded' }));
    renderer.handleMessage(JSON.stringify({ name: 'after_submit' })); // no debe duplicar PARTIAL
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(clicked).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'popup_clicked', surveyId: 'survey-rn', data: expect.objectContaining({ action: 'partial' }) }),
    );

    renderer.handleMessage(JSON.stringify({ name: 'survey_completed' }));
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({ type: 'survey_completed', surveyId: 'survey-rn' }));
    expect(hidden).toBe(1); // al completar, se desmonta el WebView
  });

  it('cierra el popup ante un mensaje popup_close', () => {
    popups.show({ surveyId: 'survey-rn', productId: 'prod-rn' });
    renderer.handleMessage(JSON.stringify({ name: 'popup_close' }));
    expect(hidden).toBe(1);
  });

  it('inyecta la identidad (user_id) en el HTML del survey', () => {
    popups.show({ surveyId: 'survey-rn', productId: 'prod-rn' });
    expect(shown!.html).toContain('external-user-id');
    expect(shown!.html).toContain(popups.getUserId() as string);
  });
});
