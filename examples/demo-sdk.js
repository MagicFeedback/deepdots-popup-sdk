import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

// const HOME_PATHS = ['/examples/index.html', '/index.html'];
// const PRODUCT_PATHS = ['/examples/product.html', '/product.html'];

function formatLogLine(event) {
  const time = new Date(event.timestamp).toLocaleTimeString();
  const action = event?.data?.action ? ` (${event.data.action})` : '';
  return `[${time}] ${event.type} - survey:${event.surveyId}${action}`;
}

export function initDemoSdk({ modeLabelEl, eventLogEl } = {}) {
  //const params = new URLSearchParams(window.location.search);
  const mode = 'server'; // params.get('mode') === 'server' ? 'server' : 'client';

  const sdk = new DeepdotsPopups();
  sdk.init({
    mode,
    nodeEnv: 'development',
    debug: true,
    apiKey: 'TjgElf34YDUxHPtUQuCVGQusPNBIjmT5', // mode === 'server' ? 'TjgElf34YDUxHPtUQuCVGQusPNBIjmT5' : undefined,
    popups: undefined
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
