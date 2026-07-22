import {getSdkSource, loadPopupSdk} from './sdk-loader.js';

function formatLogLine(event) {
    const time = new Date(event.timestamp).toLocaleTimeString();
    const action = event?.data?.action ? ` (${event.data.action})` : '';
    return `[${time}] ${event.type} - survey:${event.surveyId}${action}`;
}

export async function initDemoSdk({modeLabelEl, eventLogEl} = {}) {
    const {DeepdotsPopups} = await loadPopupSdk();

    const sdk = new DeepdotsPopups();
    sdk.init({
        debug: true,
        apiKey: 'EOywGj6yluqJRyQoY9jCSwJtSdffvKJR',
        /*
        userId: new Date().toLocaleDateString('es-ES', {year: 'numeric', month: '2-digit', day: '2-digit'}).split('/').reverse().join(''),
        analytics: {
            publicKey: '5a148214cdd4d164b9ff189c201d0e75',
            integration: 'a0365bd0-6ee1-11f1-94c7-45c08829a73b'
        },
         */
    });

    if (modeLabelEl) {
        modeLabelEl.textContent = `API · ${getSdkSource()}`;
    }

    // btn click id="btn-test"
    document.addEventListener('click', (ev) => {
        const target = ev.target;
        if (target.id === 'btn-test') {
            sdk.triggerEvent('custom-event');
        }
    });

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

    // --- Validación de tracking (Fase 1) por consola ---
    // En modo server hay apiKey → al mostrarse un popup, el backend devuelve el session_id.
    window.deepdots = sdk;
    console.info('%c[tracking] estado inicial', 'color:#0a0;font-weight:bold', {
        user_id: sdk.getUserId(),
        session_id: sdk.getSessionId(), // null hasta que un evento de popup reciba la respuesta del backend
    });
    console.info('[tracking] tras mostrarse un popup, vuelve a llamar deepdots.getSessionId() para ver el id del backend');

    return {sdk};
}
