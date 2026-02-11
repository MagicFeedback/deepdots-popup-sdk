import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

function formatLogLine(event) {
  const time = new Date(event.timestamp).toLocaleTimeString();
  const action = event?.data?.action ? ` (${event.data.action})` : '';
  return `[${time}] ${event.type} - survey:${event.surveyId}${action}`;
}

export function initDemoSdk({ modeLabelEl, eventLogEl } = {}) {
  const mode = 'server';

  const sdk = new DeepdotsPopups();
  sdk.init({
    mode,
    nodeEnv: 'development',
    debug: true,
    apiKey: 'TjgElf34YDUxHPtUQuCVGQusPNBIjmT5'
  });

  if (modeLabelEl) {
    modeLabelEl.textContent = mode;
  }

  if (eventLogEl) {
    const log = (ev) => {
      const line = document.createElement('div');
      line.className = 'event';
      line.textContent = formatLogLine(ev);
      eventLogEl.appendChild(line);
      eventLogEl.scrollTop = eventLogEl.scrollHeight;
    };
    sdk.on('popup_shown', log);
    sdk.on('popup_clicked', log);
    sdk.on('survey_completed', log);
  }

  return { sdk };
}
