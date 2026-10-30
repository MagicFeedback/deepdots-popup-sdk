import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import type { PopupRenderer } from '../platform/renderer';
import { mockPopupsApi, flushPopupsLoad } from './test-helpers';
import type { DeepdotsEventType, PopupDefinition } from '../types';

/**
 * Un fallo al enviar una página del survey llega a analítica (`deepdots_survey_error`) y al
 * host (`survey_error`). Antes el motivo solo quedaba en la consola del visitante (caso
 * Lemvigh-Müller, 30-oct-2026).
 */

type Emit = (type: DeepdotsEventType, surveyId: string, data?: Record<string, unknown>) => void;

class CapturingRenderer implements PopupRenderer {
  emit: Emit | null = null;
  show(_surveyId: string, _productId: string, _actions: unknown, emit: Emit): void {
    this.emit = emit;
  }
  hide(): void {}
}

const popup: PopupDefinition = {
  id: 'popup-1',
  title: 'p',
  message: '',
  triggers: [{ type: 'event', value: 'go' }],
  surveyId: 'survey-1',
  productId: 'product-1',
};

describe('survey_error', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  async function open() {
    const renderer = new CapturingRenderer();
    const popups = new DeepdotsPopups();
    popups.setRenderer(renderer);
    const fetchMock = mockPopupsApi([popup]);
    popups.init({ apiKey: 'k' });
    await flushPopupsLoad();
    popups.autoLaunch();
    popups.triggerEvent('go');
    popups.flushAnalytics();
    return { popups, renderer, fetchMock };
  }

  it('va a analítica como deepdots_survey_error con survey, popup, motivo y mensaje', async () => {
    const { popups, renderer } = await open();

    renderer.emit!('survey_error', 'survey-1', { reason: 'unknown', message: 'No answers provided' });

    const events = popups.previewAnalytics().events.filter((e) => e.name === 'deepdots_survey_error');
    expect(events).toHaveLength(1);
    expect(events[0].params).toEqual({
      survey_id: 'survey-1',
      popup_id: 'popup-1',
      reason: 'unknown',
      message: 'No answers provided',
    });
  });

  it('llega a los listeners del host', async () => {
    const { popups, renderer } = await open();
    const listener = vi.fn();
    popups.on('survey_error', listener);

    renderer.emit!('survey_error', 'survey-1', { reason: 'send_failed', message: 'No response' });

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: 'survey_error',
      surveyId: 'survey-1',
      data: { reason: 'send_failed', message: 'No response' },
    }));
  });

  it('no es interacción: no postea PARTIAL', async () => {
    const { renderer, fetchMock } = await open();
    const postsBefore = fetchMock.mock.calls.length;

    renderer.emit!('survey_error', 'survey-1', { reason: 'send_failed', message: 'No response' });

    const newPopupPosts = fetchMock.mock.calls.slice(postsBefore)
      .filter(([url]) => String(url).endsWith('/sdk/popups'));
    expect(newPopupPosts).toEqual([]);
  });

  it('con el tracking desactivado no llega a analítica', async () => {
    const { popups, renderer } = await open();
    popups.setTrackingEnabled(false);

    renderer.emit!('survey_error', 'survey-1', { reason: 'unknown', message: 'x' });

    expect(popups.previewAnalytics().events.some((e) => e.name === 'deepdots_survey_error')).toBe(false);
  });
});
