import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeepdotsPopups } from '../src/deepdots-popups';
import type { DeepdotsEvent } from '../src/types';

describe('DeepdotsPopups', () => {
  let popups: DeepdotsPopups;

  beforeEach(() => {
    popups = new DeepdotsPopups();
    document.body.innerHTML = '';
  });

  describe('init', () => {
    it('should initialize the SDK with config', () => {
      expect(() => {
        popups.init({ apiKey: 'test-key', debug: true });
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
        popups.show({ surveyId: 'survey-1' });
      }).toThrow('SDK not initialized');
    });

    it('should show popup when initialized', () => {
      popups.init({ apiKey: 'test-key' });
      popups.show({ surveyId: 'survey-1' });
      const container = document.getElementById('deepdots-popup-container');
      expect(container?.style.display).toBe('flex');
    });

    it('should emit popup_shown event', () => {
      popups.init({ apiKey: 'test-key' });
      const listener = vi.fn();
      popups.on('popup_shown', listener);
      
      popups.show({ surveyId: 'survey-1' });
      
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
      popups.show({ surveyId: 'survey-1' });
      
      expect(listener).toHaveBeenCalled();
    });

    it('should remove event listeners', () => {
      popups.init({ apiKey: 'test-key' });
      const listener = vi.fn();
      
      popups.on('popup_shown', listener);
      popups.off('popup_shown', listener);
      popups.show({ surveyId: 'survey-1' });
      
      expect(listener).not.toHaveBeenCalled();
    });

    it('should emit survey_completed event', () => {
      popups.init({ apiKey: 'test-key' });
      const listener = vi.fn();
      
      popups.on('survey_completed', listener);
      popups.show({ surveyId: 'survey-1' });
      
      // Click the submit button
      const submitButton = document.querySelector('button') as HTMLButtonElement;
      const buttons = Array.from(document.querySelectorAll('button'));
      const completeButton = buttons.find(btn => btn.textContent === 'Complete Survey');
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
      popups.show({ surveyId: 'survey-1' });
      
      const event: DeepdotsEvent = listener.mock.calls[0][0];
      expect(event.timestamp).toBeGreaterThan(0);
    });
  });
});
