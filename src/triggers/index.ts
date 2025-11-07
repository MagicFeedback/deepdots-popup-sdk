import type { TriggerConfig } from '../types';
import type { DeepdotsPopups } from '../core/deepdots-popups';

export function setupTrigger(popups: DeepdotsPopups, trigger: TriggerConfig): void {
  switch (trigger.type) {
    case 'time':
      setupTimeTrigger(popups, trigger);
      break;
    case 'scroll':
      setupScrollTrigger(popups, trigger);
      break;
    case 'exit':
      setupExitTrigger(popups, trigger);
      break;
  }
}

function setupTimeTrigger(popups: DeepdotsPopups, trigger: TriggerConfig): void {
  const delay = trigger.value || 5000;
  setTimeout(() => {
    popups.triggerSurvey(trigger.surveyId);
  }, delay);
  popups.debug(`Time trigger set for ${delay}ms`);
}

function setupScrollTrigger(popups: DeepdotsPopups, trigger: TriggerConfig): void {
  const threshold = trigger.value || 50;
  const handler = () => {
    const scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
    if (scrollPercentage >= threshold) {
      popups.triggerSurvey(trigger.surveyId);
      window.removeEventListener('scroll', handler);
    }
  };
  window.addEventListener('scroll', handler);
  popups.debug(`Scroll trigger set for ${threshold}%`);
}

function setupExitTrigger(popups: DeepdotsPopups, trigger: TriggerConfig): void {
  const handler = (e: MouseEvent) => {
    if (e.clientY <= 0) {
      popups.triggerSurvey(trigger.surveyId);
      document.removeEventListener('mouseout', handler);
    }
  };
  document.addEventListener('mouseout', handler);
  popups.debug('Exit intent trigger set');
}
