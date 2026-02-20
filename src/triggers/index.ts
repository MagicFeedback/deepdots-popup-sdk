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
    case 'event':
      setupEventTrigger(popups, trigger);
      break;
    case 'click':
      setupClickTrigger(popups, trigger);
      break;
  }
}

function setupTimeTrigger(popups: DeepdotsPopups, trigger: TriggerConfig): void {
  const delay = trigger.value || 5000;
  setTimeout(() => {
    popups.triggerSurvey(trigger.surveyId, trigger.popupId);
  }, delay);
  popups.debug(`Time trigger set for ${delay}ms`);
}

function setupScrollTrigger(popups: DeepdotsPopups, trigger: TriggerConfig): void {
  const threshold = trigger.value || 50;
  const handler = () => {
    const scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
    if (scrollPercentage >= threshold) {
      popups.triggerSurvey(trigger.surveyId, trigger.popupId);
      window.removeEventListener('scroll', handler);
    }
  };
  window.addEventListener('scroll', handler);
  popups.debug(`Scroll trigger set for ${threshold}%`);
}

function setupExitTrigger(popups: DeepdotsPopups, trigger: TriggerConfig): void {
  if (typeof window === 'undefined') return;

  const delaySeconds = parseExitDelaySeconds(trigger.value);
  const historyRef = window.history;
  const originalPushState = historyRef.pushState.bind(historyRef);
  const originalReplaceState = historyRef.replaceState.bind(historyRef);

  let lastUrl = normalizeUrl(window.location.href);
  let lastQueuedKey = '';
  let lastQueuedAt = 0;

  const queueLeave = (fromRaw: string, toRaw: string) => {
    const from = normalizeUrl(fromRaw);
    const to = normalizeUrl(toRaw);
    if (!from || !to || from === to) return;

    const key = `${from}=>${to}`;
    const now = Date.now();
    if (key === lastQueuedKey && now - lastQueuedAt < 150) return;
    lastQueuedKey = key;
    lastQueuedAt = now;
    popups.queueExitPopup(trigger.surveyId, delaySeconds, from, trigger.popupId);
  };

  const handleNavigation = (to: string) => {
    const from = lastUrl;
    queueLeave(from, to);
    lastUrl = normalizeUrl(to);
  };

  const handleDocumentClick = (event: MouseEvent) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = (event.target as Element | null)?.closest?.('a');
    if (!(anchor instanceof HTMLAnchorElement)) return;

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return;
    }
    const target = anchor.getAttribute('target');
    if (target && target !== '_self') return;

    let destination: URL;
    try {
      destination = new URL(href, window.location.href);
    } catch {
      return;
    }

    if (destination.origin !== window.location.origin) return;
    queueLeave(window.location.href, destination.href);
  };

  const handleHashChange = (event: HashChangeEvent) => {
    const to = event.newURL || window.location.href;
    const from = event.oldURL || lastUrl;
    queueLeave(from, to);
    lastUrl = normalizeUrl(to);
  };

  const handlePopState = () => {
    handleNavigation(window.location.href);
  };

  historyRef.pushState = function (data: any, unused: string, url?: string | URL | null) {
    const from = window.location.href;
    const result = originalPushState(data, unused, url as any);
    queueLeave(from, window.location.href);
    lastUrl = normalizeUrl(window.location.href);
    return result;
  };

  historyRef.replaceState = function (data: any, unused: string, url?: string | URL | null) {
    const from = window.location.href;
    const result = originalReplaceState(data, unused, url as any);
    queueLeave(from, window.location.href);
    lastUrl = normalizeUrl(window.location.href);
    return result;
  };

  document.addEventListener('click', handleDocumentClick, true);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('popstate', handlePopState);
  popups.debug('Exit trigger set (deferred to next route)', {
    surveyId: trigger.surveyId,
    delaySeconds,
  });
}

function setupEventTrigger(popups: DeepdotsPopups, trigger: TriggerConfig): void {
  // Event triggers are manually fired by host application using popups.triggerEvent(name).
  popups.debug('Event trigger registered', {
    popupId: trigger.popupId,
    surveyId: trigger.surveyId,
    eventName: String(trigger.value || ''),
  });
}

function parseExitDelaySeconds(value?: number | string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
}

function normalizeUrl(value: string): string {
  if (!value) return '';
  const withoutIndex = value.replace(/\/index\.html(?=($|[?#]))/i, '');
  return withoutIndex.length > 1 && withoutIndex.endsWith('/') ? withoutIndex.slice(0, -1) : withoutIndex;
}

function setupClickTrigger(popups: DeepdotsPopups, trigger: TriggerConfig): void {
  const targetId = typeof trigger.value === 'string' ? trigger.value : '';
  if (!targetId) {
    popups.debug('Click trigger missing element id', trigger);
    return;
  }

  const attach = () => {
    const el = document.getElementById(targetId);
    if (!el) {
      popups.debug('Click trigger target not found', targetId);
      return false;
    }
    const handler = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      popups.triggerSurvey(trigger.surveyId, trigger.popupId);
      el.removeEventListener('click', handler);
    };
    el.addEventListener('click', handler);
    popups.debug(`Click trigger set for #${targetId}`);
    return true;
  };

  if (typeof document === 'undefined') return;
  if (attach()) return;
  window.addEventListener('DOMContentLoaded', () => attach(), { once: true });
}
