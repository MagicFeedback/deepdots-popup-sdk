import {DeepdotsEventType, PopupActions, FormData} from '../types';
import magicfeedback from "@magicfeedback/native";
import "@magicfeedback/native/dist/styles/index.css";

// Inserta la hoja de estilos de MagicFeedback directamente en el popup para garantizar estilos incluso si el bundler no la inyecta globalmente.
function ensureMagicFeedbackStyles(popup: HTMLElement) {
    const DATA_ATTR = 'data-magicfeedback-css';
    // Evitar duplicar si ya existe en el documento (head) o dentro del popup
    if (document.querySelector(`link[${DATA_ATTR}]`) || popup.querySelector(`link[${DATA_ATTR}]`)) {
        return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/@magicfeedback/native/dist/assets/style.css';
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
    .mf-spinner-circle { width:28px; height:28px; border:3px solid #e0e6ed; border-top-color:#1E293B; border-radius:50%; animation: ddspin 0.9s linear infinite; }
  `;
    popup.appendChild(style);
}

function ensureResponsiveStyles(popup: HTMLElement) {
    if (document.getElementById('deepdots-responsive-styles')) return;
    const style = document.createElement('style');
    style.id = 'deepdots-responsive-styles';
    style.textContent = `
    /* Responsive adjustments */
    @media (max-width: 640px) {
      .deepdots-popup {
        width: 100% !important;
        max-width: 100% !important;
        height: 90vh !important;
        max-height: 100vh !important;
        border-radius: 0 !important;
        padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom)) 16px !important;
        box-sizing: border-box;
      }
      .deepdots-popup .mf-spinner-circle { width: 32px; height: 32px; border-width: 4px; }
      .deepdots-popup button { font-size: 16px !important; }
      .deepdots-popup-footer { flex-direction: column-reverse !important; gap: 12px !important; }
      .deepdots-popup-footer button { width: 100%; }
    }
    @media (max-width: 400px) {
      .deepdots-popup { padding: calc(12px + env(safe-area-inset-top)) 12px calc(12px + env(safe-area-inset-bottom)) 12px !important; }
      .deepdots-popup button { padding: 10px 14px !important; }
    }
    @media (orientation: landscape) and (max-height: 480px) {
      .deepdots-popup {
        height: 100vh !important;
        max-height: 100vh !important;
        overflow-y: auto !important;
      }
    }
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
    `;

    // Sección header (solo botón cerrar)
    const header = document.createElement('div');
    header.className = 'deepdots-popup-header';
    header.style.cssText = 'display:flex; justify-content:flex-end; align-items:center; width:100%;';

    // Botón de cierre (X)
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close popup');
    closeBtn.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    closeBtn.style.cssText = `
      background:transparent;
      border:none;
      width:32px;
      height:32px;
      display:flex;
      align-items:center;
      justify-content:center;
      border-radius: 8px;
      cursor:pointer;
      color:#111;
      padding:4px;
      transition: color .15s ease, transform .15s ease, background .15s ease;
      box-shadow: none;
    `;
    closeBtn.onmouseenter = () => {
        closeBtn.style.color = '#000000';
        closeBtn.style.background = 'rgba(0,0,0,0.06)';
        closeBtn.style.transform = 'scale(1.06)';
    };
    closeBtn.onmouseleave = () => {
        closeBtn.style.color = '#111';
        closeBtn.style.background = 'transparent';
        closeBtn.style.transform = 'scale(1)';
    };
    closeBtn.onclick = () => {
        emit('popup_clicked', surveyId, {action: 'close_icon'});
        onClose();
    };
    header.appendChild(closeBtn);

    ensureMagicFeedbackStyles(popup);
    ensureSpinnerStyles(popup);
    ensureResponsiveStyles(popup);

    const containerContent = document.createElement('div');
    containerContent.className = 'deepdots-popup-container-conetent';
    containerContent.style.cssText = `
    display:flex; 
    flex-direction:column; 
    padding: 0 20px 12px 20px;
      max-height: 80vh; /* límite general del popup */
      overflow: hidden; /* quita scroll del contenedor principal */
`

    // Sección principal (main) - Contenedor formulario + spinner
    const main = document.createElement('div');
    main.className = 'deepdots-popup-main';
    main.style.cssText = 'display:flex; flex-direction:column; width:100%; flex-grow:1; overflow-y:auto;';

    const formWrapper = document.createElement('div');
    formWrapper.style.cssText = 'position:relative; min-height:150px; width:100%;';

    const spinnerEl = document.createElement('div');
    spinnerEl.className = 'mf-spinner';
    spinnerEl.setAttribute('role', 'status');
    spinnerEl.setAttribute('aria-label', 'Loading survey');
    spinnerEl.innerHTML = '<div class="mf-spinner-circle"></div>';
    spinnerEl.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);';

    const formDivId = `magicfeedback-form-${surveyId}`;
    const formHost = document.createElement('div');
    formHost.id = formDivId;
    formHost.style.cssText = 'width:100%; visibility:hidden;';

    formWrapper.appendChild(spinnerEl);
    formWrapper.appendChild(formHost);
    main.appendChild(formWrapper);

    // Sección footer (acciones) - botones en extremos
    const footer = document.createElement('div');
    footer.className = 'deepdots-popup-footer';
    footer.setAttribute('data-actions-wrapper', 'true');
    footer.style.cssText = 'display:flex; flex-direction: row-reverse ;justify-content:space-between; align-items:center; gap:8px; margin-top:24px; width:100%;';

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
    cancelButton.style.display = 'none';

    const submitButton = document.createElement('button');
    submitButton.textContent = actions?.accept ? actions.accept.label : 'Complete Survey';
    submitButton.style.cssText = `
      background: #1E293B;
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

    footer.appendChild(cancelButton);
    footer.appendChild(submitButton);

    containerContent.appendChild(main);
    containerContent.appendChild(footer);

    // Ensamblar popup
    popup.appendChild(header);
    popup.appendChild(containerContent);

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
            onLoadedEvent?: (args: {
                formData: FormData
            }) => void;
            beforeSubmitEvent?: () => void;
            afterSubmitEvent?: (args: { error?: string, completed: boolean, progress: number, total: number }) => void;
            onBackEvent?: (args: { error?: string, progress: number, total: number, followup: boolean }) => void;
        }

        const generateOptions: TypedGenerateOptions = {
            addButton: false,
            getMetaData: true,
        };
        generateOptions.onLoadedEvent = ({formData}) => {
            // Calcular altura disponible y aplicarla al main (restando header + footer + paddings)
            try {
                /*
                const headerHeight = header.getBoundingClientRect().height;
                const footerHeight = footer.getBoundingClientRect().height;
                const paddingY = 48; // 24px top + 24px bottom
                const viewportLimit = window.innerHeight * 0.8; // coincide con max-height del popup
                const available = viewportLimit - headerHeight - footerHeight - paddingY;
                if (available > 120) { // asegurar un mínimo razonable
                    main.style.maxHeight = available + 'px';
                } */
            } catch (e) {
                // silencioso
            }
            // Personalización del popup basada en formData.style
            const s = formData?.style;
            if (s) {
                // Fondo del contenedor popup
                if (s.boxBackgroundColor) {
                    popup.style.background = s.boxBackgroundColor;
                }
                // Alineación del contenido principal
                if (s.contentAlign) {
                    // 'top' => start, 'center' => center
                    main.style.justifyContent = s.contentAlign === 'center' ? 'center' : 'flex-start';
                }
                // Botón primario (submit)
                if (s.buttonPrimaryColor) {
                    submitButton.style.background = s.buttonPrimaryColor;
                    submitButton.style.border = 'none';
                    submitButton.style.color = '#fff';
                }
                // Botón secundario (cancel)
                if (s.buttonSecondaryColor) {
                    cancelButton.style.background = 'transparent';
                    cancelButton.style.border = `1px solid ${s.buttonSecondaryColor}`;
                    cancelButton.style.color = '#333';
                }
                if (s.logo) {
                    if (!document.getElementById('deepdots-popup-logo')) {
                        // Insertar logo si existe
                        const logoImg = document.createElement('img');
                        logoImg.id = 'deepdots-popup-logo';
                        logoImg.src = s.logo;
                        logoImg.alt = 'Logo';
                        logoImg.style.cssText = 'max-height:40px; max-width:100%; object-fit:contain;';
                        if (s.logoSize) {
                            switch (s.logoSize) {
                                case 'small':
                                    logoImg.style.maxHeight = '30px';
                                    break;
                                case 'medium':
                                    logoImg.style.maxHeight = '50px';
                                    break;
                                case 'large':
                                    logoImg.style.maxHeight = '70px';
                                    break;
                            }
                        }
                        if (s.logoPosition) {
                            switch (s.logoPosition) {
                                case 'left':
                                    logoImg.style.margin = '0 16px 42px 0';
                                    logoImg.style.display = 'block';
                                    logoImg.style.marginLeft = '0';
                                    break;
                                case 'right':
                                    logoImg.style.margin = '0 0 42px 16px';
                                    logoImg.style.display = 'block';
                                    logoImg.style.marginLeft = 'auto';
                                    break;
                                case 'center':
                                    logoImg.style.margin = '0 auto 42px auto';
                                    logoImg.style.display = 'block';
                                    break;
                            }
                        }
                        // Insertar antes del main si no existe ya
                        containerContent.insertBefore(logoImg, main);
                    }
                }

                if (s.startMessage && s.startMessage !== '') {
                    if (submitButton.textContent === 'Start Survey') {
                        // Cambiar texto botón submit
                        submitButton.textContent = actions?.accept ? actions.accept.label : 'Complete Survey';
                        // Cambiar acción botón submit para envío
                        submitButton.onclick = () => {
                            if (!surveyCompletedEmitted) {
                                emit('popup_clicked', surveyId, {action: 'manual_send'});
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                (formInstance as any)?.send?.();
                            }
                        };

                    } else {
                        submitButton.onclick = () => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (formInstance as any)?.startForm?.();
                        }
                        submitButton.textContent = 'Start Survey';
                    }
                }
            }

            emit('popup_clicked', surveyId, {action: 'loaded'});
            setLoading(false); // esto hace visible el formulario y oculta el spinner
        };
        generateOptions.beforeSubmitEvent = () => {
            setLoading(true);
            emit('popup_clicked', surveyId, {action: 'before_submit'});
        };
        generateOptions.afterSubmitEvent = ({error, completed, total, progress}) => {
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
            // Si totla es mas de 1 y progress menor, es envío parcial, por lo que cambairemos el boton de cancel por back y llamara a onBackEvent
            if (total > 1 && progress < total) {
                cancelButton.textContent = 'Back';
                cancelButton.onclick = () => {
                    emit('popup_clicked', surveyId, {action: 'back'});
                    formInstance.back();

                }
            }
        };
        generateOptions.onBackEvent = ({progress}) => {
            emit('popup_clicked', surveyId, {action: 'back'});
            // Restaurar botón cancel
            if (progress === 0) {
                cancelButton.textContent = actions?.decline ? actions?.decline.label : 'Cancel';
                cancelButton.onclick = () => {
                    emit('popup_clicked', surveyId, {action: 'cancel'});
                    onClose();
                };
            }
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
