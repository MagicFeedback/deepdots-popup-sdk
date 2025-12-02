import {DeepdotsEventType, PopupActions} from '../types';
import magicfeedback from "@magicfeedback/native";
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";

// Inserta la hoja de estilos de MagicFeedback directamente en el popup para garantizar estilos incluso si el bundler no la inyecta globalmente.
function ensureMagicFeedbackStyles(popup: HTMLElement) {
    const DATA_ATTR = 'data-magicfeedback-css';
    // Evitar duplicar si ya existe en el documento (head) o dentro del popup
    if (document.querySelector(`link[${DATA_ATTR}]`) || popup.querySelector(`link[${DATA_ATTR}]`)) {
        return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/@magicfeedback/native/dist/styles/magicfeedback-default.css';
    link.setAttribute(DATA_ATTR, 'true');
    // Colocar al inicio del popup para cargar primero los estilos específicos
    popup.appendChild(link);
}

// Añade estilos de spinner si no existen
function ensureSpinnerStyles(popup: HTMLElement) {
    if (document.getElementById('deepdots-spinner-styles')) return;
    const style = document.createElement('style');
    style.id = 'deepdots-spinner-styles';
    style.textContent = `
    @keyframes ddspin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .mf-spinner { display:flex; justify-content:center; align-items:center; padding:8px 0; }
    .mf-spinner-circle { width:28px; height:28px; border:3px solid #e0e6ed; border-top-color:#4CAF50; border-radius:50%; animation: ddspin 0.9s linear infinite; }
  `;
    popup.appendChild(style);
}

/**
 * Renderiza el popup dentro del contenedor dado usando MagicFeedback para la encuesta.
 */
export async function renderPopup(
    container: HTMLElement,
    surveyId: string,
    productId: string,
    actions: PopupActions | undefined,
    emit: (type: DeepdotsEventType, surveyId: string, data?: Record<string, unknown>) => void,
    onClose: () => void
): Promise<void> {
    let surveyCompletedEmitted = false;
    // Crear popup base
    const popup = document.createElement('div');
    popup.className = 'deepdots-popup';
    popup.style.cssText = `
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      background: #fff;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      max-width: 600px;
      width: 90%;
      min-height: 200px;
      max-height: 80vh;
      overflow-y: auto;
    `;

    ensureMagicFeedbackStyles(popup);
    ensureSpinnerStyles(popup);

    // Contenedor formulario + spinner
    const content = document.createElement('div');
    content.style.cssText = 'display:flex; flex-direction:column; width:100%;';

    // Wrapper que reserva el espacio del formulario para que el popup no se vea pequeño al inicio
    const formWrapper = document.createElement('div');
    formWrapper.style.cssText = 'position:relative; min-height:260px; width:100%;';

    const spinnerEl = document.createElement('div');
    spinnerEl.className = 'mf-spinner';
    spinnerEl.setAttribute('role', 'status');
    spinnerEl.setAttribute('aria-label', 'Loading survey');
    spinnerEl.innerHTML = '<div class="mf-spinner-circle"></div>';
    // Spinner centrado absoluta y no modifica el tamaño reservado
    spinnerEl.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);';

    const formDivId = `magicfeedback-form-${surveyId}`;
    const formHost = document.createElement('div');
    formHost.id = formDivId;
    formHost.style.cssText = 'width:100%; visibility:hidden;';

    formWrapper.appendChild(spinnerEl);
    formWrapper.appendChild(formHost);
    content.appendChild(formWrapper);

    // Barra acciones
    const actionsBar = document.createElement('div');
    actionsBar.style.cssText = 'display:flex; justify-content:flex-end; gap:8px; margin-top:12px;';

    const cancelButton = document.createElement('button');
    cancelButton.textContent = actions?.decline ? actions?.decline.label : 'Cancel';
    cancelButton.style.cssText = `
      background: transparent;
      color: #333;
      border: 1px solid #ddd;
      padding: 10px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background .15s ease;
    `;
    cancelButton.onclick = () => {
        emit('popup_clicked', surveyId, {action: 'cancel'});
        onClose();
    };

    const submitButton = document.createElement('button');
    submitButton.textContent = actions?.accept ? actions.accept.label : 'Send';
    submitButton.style.cssText = `
      background: #4CAF50;
      color: #fff;
      border: none;
      padding: 12px 24px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      transition: filter .15s ease;
    `;
    submitButton.onclick = () => {
        if (!surveyCompletedEmitted) {
            emit('popup_clicked', surveyId, {action: 'manual_send'});
            // Dispara envío nativo si existe
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (formInstance as any)?.send?.();
        }
    };

    actionsBar.appendChild(cancelButton);
    actionsBar.appendChild(submitButton);

    popup.appendChild(content);
    popup.appendChild(actionsBar);

    container.innerHTML = '';
    container.appendChild(popup);
    container.style.display = 'flex';

    // Gestión dinámica de loading
    function setLoading(isLoading: boolean) {
        spinnerEl.style.display = isLoading ? 'flex' : 'none';
        if (!isLoading) {
            formHost.style.visibility = 'visible';
        }
        cancelButton.disabled = false;
        submitButton.disabled = isLoading;
        submitButton.style.opacity = isLoading ? '0.6' : '1';
        submitButton.style.cursor = isLoading ? 'not-allowed' : 'pointer';
    }

    // Estado inicial
    setLoading(true);

    // Entorno navegador
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }

    // Referencia instancia formulario
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let formInstance: any = null;

    try {
        if (!magicfeedback || typeof magicfeedback.form !== 'function') {
            console.warn('[MagicFeedback] form() no disponible. Fallback manual.');
            setLoading(false);
            return;
        }
        magicfeedback.init({debug: true, env: 'prod'});
        formInstance = magicfeedback.form(surveyId, productId);

        interface TypedGenerateOptions {
            addButton: boolean;
            getMetaData: boolean;
            onLoadedEvent?: () => void;
            beforeSubmitEvent?: () => void;
            afterSubmitEvent?: (args: { error?: string, completed: boolean }) => void;
            onBackEvent?: () => void;
        }

        const generateOptions: TypedGenerateOptions = {
            addButton: false,
            getMetaData: true,
        };
        generateOptions.onLoadedEvent = () => {
            emit('popup_clicked', surveyId, {action: 'loaded'});
            setLoading(false); // esto hace visible el formulario y oculta el spinner
        };
        generateOptions.beforeSubmitEvent = () => {
            setLoading(true);
            emit('popup_clicked', surveyId, {action: 'before_submit'});
        };
        generateOptions.afterSubmitEvent = ({error, completed}) => {
            setLoading(false);
            if (error) {
                emit('popup_clicked', surveyId, {action: 'submit_error', error});
                return;
            }
            if (completed) {
                emit('survey_completed', surveyId, {action: 'completed'});
                surveyCompletedEmitted = true;
                onClose();
            }
        };
        generateOptions.onBackEvent = () => {
            emit('popup_clicked', surveyId, {action: 'back'});
            // onClose();
        };

        // Ejecutar generación con opciones tipadas
        formInstance.generate(formDivId, generateOptions)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .catch((err: any) => {
                console.error('[MagicFeedback] Error generating form:', err);
                setLoading(false);
            });
    } catch (e) {
        console.error('[MagicFeedback] Exception initializing form:', e);
        setLoading(false);
    }
}
