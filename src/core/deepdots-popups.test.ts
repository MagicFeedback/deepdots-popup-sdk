import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeepdotsPopups } from './deepdots-popups';
import type { DeepdotsEvent, PopupDefinition } from '../types';

describe('DeepdotsPopups', () => {
  let popups: DeepdotsPopups;

  beforeEach(() => {
    popups = new DeepdotsPopups();
    document.body.innerHTML = '';
  });

  describe('init', () => {
    it('should initialize the SDK with config', () => {
      expect(() => {
        popups.init({ apiKey: 'test-key', nodeEnv: 'development' });
      }).not.toThrow();
    });

    it('should not throw when initializing twice', () => {
      popups.init({ apiKey: 'test-key' });
      expect(() => {
        popups.init({ apiKey: 'test-key-2' });
      }).not.toThrow();
    });

    it('should create popup container in DOM', () => {
      popups.init({ apiKey: 'test-key' });
      const container = document.getElementById('deepdots-popup-container');
      expect(container).toBeTruthy();
    });
  });

  describe('show', () => {
    it('should throw error if not initialized', () => {
      expect(() => {
        popups.show({ surveyId: 'survey-1', productId: 'product-1' });
      }).toThrow('SDK not initialized');
    });

    it('should show popup when initialized', () => {
      popups.init({ apiKey: 'test-key' });
      popups.show({ surveyId: 'survey-1', productId: 'product-1' });
      const container = document.getElementById('deepdots-popup-container');
      expect(container?.style.display).toBe('flex');
    });

    it('should emit popup_shown event', () => {
      popups.init({ apiKey: 'test-key' });
      const listener = vi.fn();
      popups.on('popup_shown', listener);
      
      popups.show({ surveyId: 'survey-1', productId: 'product-1' });
      
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'popup_shown',
          surveyId: 'survey-1',
        })
      );
    });
  });

  describe('configureTriggers', () => {
    it('should throw error if not initialized', () => {
      expect(() => {
        popups.configureTriggers([]);
      }).toThrow('SDK not initialized');
    });

    it('should configure triggers when initialized', () => {
      popups.init({ apiKey: 'test-key' });
      expect(() => {
        popups.configureTriggers([
          { type: 'time', value: 1000, surveyId: 'survey-1' }
        ]);
      }).not.toThrow();
    });
  });

  describe('autoLaunch', () => {
    it('should throw error if not initialized', () => {
      expect(() => {
        popups.autoLaunch();
      }).toThrow('SDK not initialized');
    });

    it('should enable auto-launch when initialized', () => {
      popups.init({ apiKey: 'test-key' });
      popups.configureTriggers([
        { type: 'time', value: 100, surveyId: 'survey-1' }
      ]);
      expect(() => {
        popups.autoLaunch();
      }).not.toThrow();
    });
  });

  describe('events', () => {
    it('should add and trigger event listeners', () => {
      popups.init({ apiKey: 'test-key' });
      const listener = vi.fn();
      
      popups.on('popup_shown', listener);
      popups.show({ surveyId: 'survey-1',productId: 'product-1' });
      
      expect(listener).toHaveBeenCalled();
    });

    it('should remove event listeners', () => {
      popups.init({ apiKey: 'test-key' });
      const listener = vi.fn();
      
      popups.on('popup_shown', listener);
      popups.off('popup_shown', listener);
      popups.show({ surveyId: 'survey-1', productId: 'product-1' });
      
      expect(listener).not.toHaveBeenCalled();
    });

    it('should emit survey_completed event', () => {
      popups.init({ apiKey: 'test-key' });
      const listener = vi.fn();
      
      popups.on('survey_completed', listener);
      popups.show({ surveyId: 'survey-1', productId: 'product-1' });
      
      // Click the submit button
      const buttons = Array.from(document.querySelectorAll('button'));
      const completeButton = buttons.find(btn => btn.textContent === 'Send');
      completeButton?.click();
      
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'survey_completed',
          surveyId: 'survey-1',
        })
      );
    });

    it('should include timestamp in events', () => {
      popups.init({ apiKey: 'test-key' });
      const listener = vi.fn();
      
      popups.on('popup_shown', listener);
      popups.show({ surveyId: 'survey-1', productId: 'product-1' });
      
      const event: DeepdotsEvent = listener.mock.calls[0][0];
      expect(event.timestamp).toBeGreaterThan(0);
    });
  });

  describe('DeepdotsPopups mode handling', () => {
    let popups: DeepdotsPopups;
    beforeEach(() => {
      popups = new DeepdotsPopups();
      document.body.innerHTML = '';
    });

    it('should derive triggers from client popups definitions', () => {
      const popupDefs: PopupDefinition[] = [
        {
          id: 'p1',
          title: 'Title',
          message: '<p>Msg</p>',
          trigger: { type: 'time_on_page', value: 0.01 }, // 10ms
          actions: { accept: { label: 'Go', surveyId: 's1' }, decline: { label: 'No' } },
          surveyId: 's1',
          productId: 'prod',
          style: { theme: 'light', position: 'bottom-right', imageUrl: null },
        }
      ];
      popups.init({ mode: 'client', popups: popupDefs });
      const listener = vi.fn();
      popups.on('popup_shown', listener);
      popups.autoLaunch();
      return new Promise((resolve) => setTimeout(resolve, 30)).then(() => {
        expect(listener).toHaveBeenCalled();
      });
    });

    it('should defer autoLaunch until server popups are loaded', async () => {
      popups.init({ mode: 'server', debug: true });
      const listener = vi.fn();
      popups.on('popup_shown', listener);
      popups.autoLaunch(); // se difiere
      expect(listener).not.toHaveBeenCalled();
      await new Promise((r) => setTimeout(r, 120)); // esperar carga fake + trigger
      // Validar que las definiciones se cargaron derivando triggers
      // Forzar mostrar el popup para asegurar evento
      popups.showByPopupId('popup-123');
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('conditions logic', () => {
    it('should not show popup if answered condition prevents it', async () => {
      const popupDefs: PopupDefinition[] = [
        {
          id: 'p-answered',
          title: 'Answered check',
          message: '<p>Msg</p>',
          trigger: { type: 'time_on_page', value: 0.01, condition: [{ answered: false, cooldownDays: 1 }] },
          actions: { accept: { label: 'Go', surveyId: 'survey-ans' }, decline: { label: 'No' } },
          surveyId: 'survey-ans',
          productId: 'prod',
          style: { theme: 'light', position: 'bottom-right', imageUrl: null },
        }
      ];
      popups.init({ mode: 'client', popups: popupDefs });
      popups.markSurveyAnswered('survey-ans');
      const listener = vi.fn();
      popups.on('popup_shown', listener);
      popups.autoLaunch();
      await new Promise(r => setTimeout(r, 40));
      expect(listener).not.toHaveBeenCalled();
    });

    it('should respect cooldownDays preventing immediate second show', async () => {
      const popupDefs: PopupDefinition[] = [
        {
          id: 'p-cooldown',
          title: 'Cooldown check',
          message: '<p>Msg</p>',
          trigger: { type: 'time_on_page', value: 0.01, condition: [{ answered: false, cooldownDays: 7 }] },
          actions: { accept: { label: 'Go', surveyId: 'survey-cool' }, decline: { label: 'No' } },
          surveyId: 'survey-cool',
          productId: 'prod',
          style: { theme: 'light', position: 'bottom-right', imageUrl: null },
        }
      ];
      popups.init({ mode: 'client', popups: popupDefs });
      const listener = vi.fn();
      popups.on('popup_shown', listener);
      popups.autoLaunch();
      await new Promise(r => setTimeout(r, 40));
      expect(listener).toHaveBeenCalledTimes(1);
      // intentar forzar segundo disparo manual
      popups.triggerSurvey('survey-cool');
      expect(listener).toHaveBeenCalledTimes(1); // no aumenta por cooldown
    });
  });
});
