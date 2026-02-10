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
    case 'click':
      setupClickTrigger(popups, trigger);
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
  let fired = false;
  let lastUrl = typeof window !== 'undefined' ? window.location.href : '';
  const historyRef = typeof window !== 'undefined' ? window.history : null;
  const originalPushState = historyRef ? historyRef.pushState.bind(historyRef) : null;
  const originalReplaceState = historyRef ? historyRef.replaceState.bind(historyRef) : null;

  const cleanup = () => {
    document.removeEventListener('click', handleNavClick, true);
    window.removeEventListener('popstate', handlePopState);
    if (historyRef && originalPushState) historyRef.pushState = originalPushState;
    if (historyRef && originalReplaceState) historyRef.replaceState = originalReplaceState;
  };

  const fireOnce = () => {
    if (fired) return;
    fired = true;
    popups.triggerSurvey(trigger.surveyId);
    cleanup();
  };

  const handleNavClick = (e: MouseEvent) => {
    if (fired) return;
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const target = (e.target as Element | null)?.closest?.('a');
    if (!target) return;
    const href = target.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    const targetAttr = target.getAttribute('target');
    if (targetAttr && targetAttr !== '_self') return;

    let url: URL;
    try {
      url = new URL(href, window.location.href);
    } catch {
      return;
    }
    if (url.origin !== window.location.origin) return;

    e.preventDefault();
    fireOnce();
  };

  const shouldBlockUrl = (rawUrl?: string | URL | null): boolean => {
    if (!rawUrl) return false;
    let url: URL;
    try {
      url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl, window.location.href);
    } catch {
      return false;
    }
    if (url.origin !== window.location.origin) return false;
    if (url.href === window.location.href) return false;
    return true;
  };

  const handlePopState = () => {
    if (fired) return;
    fireOnce();
    if (historyRef && originalPushState && lastUrl) {
      originalPushState(null, document.title, lastUrl);
    }
  };

  if (historyRef && originalPushState && originalReplaceState) {
    historyRef.pushState = function (data: any, unused: string, url?: string | URL | null) {
      if (!fired && shouldBlockUrl(url)) {
        fireOnce();
        return;
      }
      const result = originalPushState(data, unused, url as any);
      lastUrl = window.location.href;
      return result;
    };
    historyRef.replaceState = function (data: any, unused: string, url?: string | URL | null) {
      if (!fired && shouldBlockUrl(url)) {
        fireOnce();
        return;
      }
      const result = originalReplaceState(data, unused, url as any);
      lastUrl = window.location.href;
      return result;
    };
  }

  document.addEventListener('click', handleNavClick, true);
  window.addEventListener('popstate', handlePopState);
  popups.debug('Exit intent trigger set (navigation/spa)');
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
      popups.triggerSurvey(trigger.surveyId);
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
