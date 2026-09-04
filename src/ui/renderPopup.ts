import {DeepdotsEventType, PopupActions, PopupStyle, FormData} from '../types';
import { buildSurveyIdentity } from '../tracking/tracking-manager';
import type { PopupRenderOptions } from '../platform/renderer';
import { buildFontFaceCss, buildFontFamilyValue } from './font';
import { insertPopupLogo } from './logo';
import { sdkLog, sdkWarn, sdkError } from '../util/logger';
import magicfeedback from "@magicfeedback/native";
import magicfeedbackCss from '../assets/style.css';

// Inserta la hoja de estilos de MagicFeedback directamente en el popup para garantizar estilos incluso si el bundler no la inyecta globalmente.
function ensureMagicFeedbackStyles(_popup: HTMLElement) {
    const STYLE_ID = 'magicfeedback-sdk-styles';
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = magicfeedbackCss;
    document.head.appendChild(style);
}

// Añade estilos de spinner si no existen
function ensureSpinnerStyles(_popup: HTMLElement) {
    if (document.getElementById('deepdots-spinner-styles')) return;
    const style = document.createElement('style');
    style.id = 'deepdots-spinner-styles';
    style.textContent = `
    /* El enunciado trae margin-top:20px del CSS de surveys, que sumaba al hueco de la barra
       de progreso y descompensaba la simetría. Solo se anula en el primero: entre preguntas
       de la misma página sigue separando. */
    .deepdots-popup .magicfeedback-questions .magicfeedback-div:first-child .magicfeedback-label { margin-top: 0; }
    @keyframes ddspin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .mf-spinner { display:flex; justify-content:center; align-items:center; padding:8px 0; }
    .mf-spinner-circle { width:28px; height:28px; border:3px solid #e0e6ed; border-top-color:#1E293B; border-radius:50%; animation: ddspin 0.9s linear infinite; }
  `;
    document.head.appendChild(style);
}

function ensureResponsiveStyles(_popup: HTMLElement) {
    if (document.getElementById('deepdots-responsive-styles')) return;
    const style = document.createElement('style');
    style.id = 'deepdots-responsive-styles';
    style.textContent = `
    /* Responsive adjustments */
    @media (max-width: 640px) {
      .deepdots-popup {
        width: calc(100% - 24px) !important;
        max-width: calc(100% - 24px) !important;
        height: auto !important;
        max-height: 90vh !important;
        border-radius: 12px !important;
        padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom)) 16px !important;
        box-sizing: border-box;
      }
      .deepdots-popup .mf-spinner-circle { width: 32px; height: 32px; border-width: 4px; }
      .deepdots-popup button { font-size: 16px !important; }
      .deepdots-popup-header button { width:48px; height:48px; }
      .deepdots-popup-header button svg { width:26px; height:26px; }
      /* Apilados en el orden del DOM: la acción principal (Send/Start/Complete) arriba y
         Back debajo. */
      .deepdots-popup-footer { flex-direction: column !important; gap: 4px !important; }
      .deepdots-popup-footer button { width: 100%; }
    }
    @media (max-width: 400px) {
      .deepdots-popup { padding: calc(12px + env(safe-area-inset-top)) 12px calc(12px + env(safe-area-inset-bottom)) 12px !important; }
      .deepdots-popup-header button { width:48px; height:48px; }
      .deepdots-popup-header button svg { width:26px; height:26px; }
    }
    @media (orientation: landscape) and (max-height: 480px) {
      .deepdots-popup {
        height: 100vh !important;
        max-height: 100vh !important;
        overflow-y: auto !important;
      }
    }
  `;
    document.head.appendChild(style);
}

/**
 * CSS del host, en un <style> propio añadido DESPUÉS de los del SDK y de
 * `@magicfeedback/native` para que gane en cascada sin tocar ninguno de los dos.
 * Se reemplaza en cada render por si cambia entre popups.
 */
function ensureCustomCss(css?: string) {
    const STYLE_ID = 'deepdots-custom-css';
    const existing = document.getElementById(STYLE_ID);
    if (!css) {
        existing?.remove();
        return;
    }
    const el = (existing as HTMLStyleElement | null) ?? document.createElement('style');
    el.id = STYLE_ID;
    if (el.textContent !== css) el.textContent = css;
    // Reanexar mueve el nodo al final del head: garantiza que va tras las hojas del SDK.
    document.head.appendChild(el);
}

// Inyecta (una sola vez) el @font-face de la fuente personalizada.
function ensureFontFace(family: string, url: string) {
    const css = buildFontFaceCss(family, url);
    if (!css) return;
    const STYLE_ID = 'deepdots-font-face';
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
        el = document.createElement('style');
        el.id = STYLE_ID;
        document.head.appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
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
    onClose: () => void,
    env: string = 'production',
    userId?: string,
    style?: PopupStyle,
    sessionId?: string,
    miniService?: string,
    analyticsFeedbackSessionId?: string,
    options?: PopupRenderOptions,
): Promise<void> {
    let surveyCompletedEmitted = false;
    let stylesInjected = false;
    // Profundidad de navegación dentro del survey: +1 al avanzar, -1 al volver. Sustituye a
    // `total > 1 && progress > 0 && progress < total`, que escondía el Back cuando la pantalla
    // siguiente era una follow-up dinámica (no entran en el grafo: suman +0.5 al progress y
    // dejan el total igual, así que un survey de una pregunta con follow-up nunca lo mostraba).
    let pageDepth = 0;
    let onStartPage = false;

    const isDark = style?.theme === 'dark';
    const theme = {
        popupBg:          isDark ? '#1e1e1e' : '#fff',
        // El popup fija su propio fondo, así que debe fijar también el esquema de color.
        // Sin esto los controles de formulario (input/textarea/select) caen al estilo por
        // defecto del navegador: en un host con `prefers-color-scheme: dark` se pintan
        // oscuros con texto blanco sobre el fondo claro del popup.
        colorScheme:      isDark ? 'dark' : 'light',
        textPrimary:      isDark ? '#f0f0f0' : '#111',
        closeBtnHoverBg:  isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
        closeBtnHoverColor: isDark ? '#fff' : '#000000',
        textMuted:        isDark ? '#9ca3af' : '#6b7280',
        progressTrack:    isDark ? '#3f3f46' : '#e5e7eb',
    };

    const positionMap: Record<string, { justifyContent: string; alignItems: string; padding?: string; background: string }> = {
        'center':       { justifyContent: 'center',     alignItems: 'center',                        background: 'rgba(0,0,0,0.5)' },
        'bottom':       { justifyContent: 'center',     alignItems: 'flex-end',   padding: '16px',   background: 'transparent' },
        'bottom-right': { justifyContent: 'flex-end',   alignItems: 'flex-end',   padding: '16px',   background: 'transparent' },
        'bottom-left':  { justifyContent: 'flex-start', alignItems: 'flex-end',   padding: '16px',   background: 'transparent' },
        'top':          { justifyContent: 'center',     alignItems: 'flex-start', padding: '16px',   background: 'transparent' },
        'top-right':    { justifyContent: 'flex-end',   alignItems: 'flex-start', padding: '16px',   background: 'transparent' },
        'top-left':     { justifyContent: 'flex-start', alignItems: 'flex-start', padding: '16px',   background: 'transparent' },
    };
    const pos = positionMap[style?.position ?? 'center'] ?? positionMap['center'];

    // Crear popup base
    const popup = document.createElement('div');
    popup.id = 'dd-popup';
    popup.className = 'deepdots-popup';
    popup.style.cssText = `
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      background: ${theme.popupBg};
      color-scheme: ${theme.colorScheme};
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      min-height: 200px;
    `;

    const font = style?.font;
    if (font?.family) {
        const familyValue = buildFontFamilyValue(font.family);
        // El survey vive dentro del contenedor y hereda esta fuente.
        popup.style.fontFamily = familyValue;
        // La variable habilita que el <h2> (Montserrat por defecto) también la use.
        popup.style.setProperty('--deepdots-font', familyValue);
        // Los controles de formulario (button/input/textarea/select) NO heredan
        // font-family por defecto; esta clase activa la regla que los fuerza a heredar.
        popup.classList.add('deepdots-has-font');
        if (font.url) ensureFontFace(font.family, font.url);
    }

    // Sección header (título + botón cerrar)
    const header = document.createElement('div');
    header.className = 'deepdots-popup-header';
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:12px; width:100%; flex:0 0 auto;';

    // Título: `textContent`, nunca innerHTML — el valor viene de la API.
    const titleEl = document.createElement('h2');
    titleEl.id = 'dd-title';
    titleEl.className = 'deepdots-popup-title';
    // text-transform/text-align/margin neutralizan la regla `.deepdots-popup h2` del CSS del
    // survey (uppercase, centrado, margin-bottom 40px), pensada para los enunciados.
    titleEl.style.cssText = `margin:0; font-size:17px; font-weight:600; line-height:1.3; color:${theme.textPrimary}; text-transform:none; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;`;
    titleEl.hidden = true;
    const setTitle = (value?: string) => {
        if (!value) return;
        titleEl.textContent = value;
        titleEl.hidden = false;
    };
    setTitle(options?.title);
    header.appendChild(titleEl);

    // Botón de cierre (X)
    const closeBtn = document.createElement('button');
    closeBtn.id = 'dd-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close popup');
    closeBtn.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
      color:${theme.textPrimary};
      padding:4px;
      transition: color .15s ease, transform .15s ease, background .15s ease;
      box-shadow: none !important;
    `;
    closeBtn.onmouseenter = () => {
        closeBtn.style.color = theme.closeBtnHoverColor;
        closeBtn.style.background = theme.closeBtnHoverBg;
        closeBtn.style.transform = 'scale(1.06)';
    };
    closeBtn.onmouseleave = () => {
        closeBtn.style.color = theme.textPrimary;
        closeBtn.style.background = 'transparent';
        closeBtn.style.transform = 'scale(1)';
    };
    closeBtn.onclick = () => {
        emit('popup_clicked', surveyId, {action: 'close_icon'});
        onClose();
    };
    closeBtn.style.flex = '0 0 auto';
    closeBtn.style.marginLeft = 'auto';
    header.appendChild(closeBtn);

    // Barra de progreso ("Question X of Y" + barra), espejo de LineProgressQuestion (MagicSurvey).
    // `undefined` en el init deja decidir a la plataforma (style.showProgressBar).
    let progressEnabled = options?.showProgressBar === true;
    let progressShowUnit = true;
    let progressUnit: 'percentage' | 'fraction' = 'fraction';

    const progressEl = document.createElement('div');
    progressEl.id = 'dd-progress';
    progressEl.className = 'deepdots-progress';
    // Sin padding horizontal propio: se alinea con el título y con el contenido. El vertical es
    // el mismo arriba y abajo, y del mismo valor que el padding de la tarjeta.
    progressEl.style.cssText = 'display:none; flex-direction:column; gap:8px; width:100%; flex:0 0 auto; padding:16px 0; box-sizing:border-box;';
    const progressHead = document.createElement('div');
    progressHead.className = 'deepdots-progress-head';
    progressHead.style.cssText = 'display:flex; flex-direction:row; justify-content:space-between; align-items:center; width:100%; gap:8px;';
    const progressLabel = document.createElement('span');
    progressLabel.id = 'dd-progress-label';
    progressLabel.style.cssText = 'font-size:13px; line-height:1.2;';
    // "Question 1" en negrita y "of 3" en regular gris, como el mockup.
    const progressCurrent = document.createElement('span');
    progressCurrent.id = 'dd-progress-current';
    progressCurrent.style.cssText = `font-weight:700; color:${theme.textPrimary};`;
    const progressTotal = document.createElement('span');
    progressTotal.id = 'dd-progress-total';
    progressTotal.style.cssText = `font-weight:400; color:${theme.textMuted};`;
    progressLabel.appendChild(progressCurrent);
    progressLabel.appendChild(progressTotal);
    const progressFollowUp = document.createElement('span');
    progressFollowUp.id = 'dd-progress-followup';
    progressFollowUp.textContent = 'Follow-up';
    progressFollowUp.style.cssText = 'display:none; font-size:12px; font-weight:600; color:#fff; background:rgba(59,130,246,0.44); border-radius:999px; padding:2px 10px;';
    progressHead.appendChild(progressLabel);
    progressHead.appendChild(progressFollowUp);
    const progressTrack = document.createElement('div');
    progressTrack.className = 'deepdots-progress-track';
    progressTrack.style.cssText = `width:100%; height:4px; border-radius:999px; background:${theme.progressTrack}; overflow:hidden;`;
    const progressBar = document.createElement('div');
    progressBar.id = 'dd-progress-bar';
    progressBar.style.cssText = 'height:100%; width:0%; background:#22C55E; border-radius:999px; transition:width 450ms ease;';
    progressTrack.appendChild(progressBar);
    progressEl.appendChild(progressHead);
    progressEl.appendChild(progressTrack);

    function updateProgress(p: { progress?: number; total?: number; completed?: boolean; followup?: boolean }) {
        const total = typeof p.total === 'number' ? p.total : 0;
        const progress = typeof p.progress === 'number' ? p.progress : 0;
        if (!progressEnabled || onStartPage || p.completed || total <= 1) {
            progressEl.style.display = 'none';
            // Sin barra, el hueco cabecera→pregunta lo pone el contenido.
            containerContent.style.paddingTop = '16px';
            return;
        }
        progressEl.style.display = 'flex';
        // Con barra, el hueco inferior ya lo pone el bloque de progreso: no duplicarlo.
        containerContent.style.paddingTop = '0';
        // La barra usa el valor real (las follow-up suman +0.5 y avanzan media casilla); la
        // etiqueta redondea hacia abajo, porque una follow-up es un paso DENTRO de la misma
        // pregunta y no la siguiente.
        const current = Math.min(total, Math.max(1, progress + 1));
        const pct = Math.min(100, Math.max(0, (current / total) * 100));
        progressBar.style.width = `${pct}%`;
        const label = Math.min(total, Math.max(1, Math.floor(progress) + 1));
        progressLabel.style.display = progressShowUnit ? 'block' : 'none';
        if (progressUnit === 'percentage') {
            progressCurrent.textContent = `${Math.round(pct)}%`;
            progressTotal.textContent = '';
        } else {
            progressCurrent.textContent = `Question ${label}`;
            progressTotal.textContent = ` of ${total}`;
        }
        progressFollowUp.style.display = p.followup ? 'inline-block' : 'none';
    }

    ensureMagicFeedbackStyles(popup);
    ensureSpinnerStyles(popup);
    ensureResponsiveStyles(popup);
    // El último en entrar: el CSS del host gana sobre todo lo anterior.
    ensureCustomCss(options?.surveyCss);

    const containerContent = document.createElement('div');
    containerContent.id = 'dd-content';
    // Estaba escrito 'conetent'; el HTML del WebView siempre usó la forma correcta. Con
    // `surveyCss` esta clase pasa a ser superficie pública, así que las dos rutas deben coincidir.
    containerContent.className = 'deepdots-popup-container-content';
    // El popup es una columna: solo el bloque de preguntas hace scroll, para que el footer con
    // las acciones quede siempre pegado al borde inferior (antes vivía dentro del área
    // scrollable y en un survey largo había que bajar hasta el final para ver "Send").
    // Sin sangrado extra: el contenido se alinea con el título y con la barra de progreso
    // (antes sumaba 20px a los lados sobre el padding de la tarjeta). `overflow:hidden` deja
    // el scroll en `main`, no en el contenedor.
    containerContent.style.cssText = 'display:flex; flex-direction:column; flex:1 1 auto; min-height:0; padding:16px 0 0 0; overflow:hidden;'

    // Sección principal (main) - Contenedor formulario + spinner
    const main = document.createElement('div');
    main.id = 'dd-main';
    main.className = 'deepdots-popup-main';
    main.style.cssText = 'display:flex; flex-direction:column; width:100%; flex:1 1 auto; min-height:0; overflow-y:auto;';

    const formWrapper = document.createElement('div');
    formWrapper.id = 'dd-form-wrapper';
    formWrapper.style.cssText = 'width:100%; flex: 1 1 auto;';

    // Contenedor de aviso de error de validación
    const errorHint = document.createElement('div');
    errorHint.id = 'dd-error';
    errorHint.className = 'deepdots-error-hint';
    errorHint.style.cssText = `
      display: none;
      margin: 12px 0 0 0;
      padding: 10px 12px;
      border-radius: 6px;
      background: #FEF3C7; /* amber-100 */
      color: #92400E; /* amber-700 */
      border: 1px solid #FCD34D; /* amber-300 */
      font-size: 13px;
    `;
    errorHint.setAttribute('role', 'alert');
    errorHint.setAttribute('aria-live', 'polite');

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
    // Insertar el hint justo antes del footer
    main.appendChild(errorHint);

    // Sección footer (acciones) - botones en extremos
    const footer = document.createElement('div');
    footer.id = 'dd-footer';
    footer.className = 'deepdots-popup-footer';
    footer.setAttribute('data-actions-wrapper', 'true');
    footer.style.cssText = 'display:flex; flex-direction: row-reverse ;justify-content:space-between; align-items:center; gap:4px; margin-top:auto; width:100%; padding-top:12px;';

    // Botones
    const backButton = document.createElement('button');
    backButton.id = 'dd-back';
    backButton.className = 'dd-nav-btn';
    backButton.textContent = actions?.back ? actions.back.label : 'Back';
    // Secundario como botón de texto: sin borde, fondo ni sombra, para que el primario sea
    // la única CTA con peso visual.
    backButton.style.cssText = `
      background: transparent;
      color: ${theme.textMuted};
      border: none;
      min-height: 44px;
      padding: 12px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 15px;
      font-weight: 600;
      transition: filter .15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    `;
    backButton.onmouseenter = () => {
        backButton.style.filter = 'brightness(0.9)';
    }
    backButton.onmouseleave = () => {
        backButton.style.filter = 'brightness(1)';
    }
    backButton.onclick = () => {
        emit('popup_clicked', surveyId, {action: 'back'});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (formInstance as any)?.back?.();
    };

    // Boton start survyes, solo aprece cuando la encuesta empieza con mensaje de inicio
    // Width de 100% para que ocupe todo el espacio disponible
    const startButton = document.createElement('button');
    startButton.id = 'dd-start';
    startButton.className = 'dd-nav-btn';
    startButton.textContent = actions?.start ? actions.start.label : 'Start survey';
    startButton.style.cssText = `
      background: #1E293B;
      color: #fff;
      border: none;
      min-height: 44px;
      padding: 12px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 15px;
      font-weight: 600;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      transition: filter .15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    `;
    startButton.onclick = () => {
        emit('popup_clicked', surveyId, {action: 'start_survey'});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (formInstance as any)?.startForm?.();
        onStartPage = false;
        updateProgress({progress: formInstance?.progress, total: formInstance?.total});
    };

    // Botón cerrar popup, solo aparece al terminar la encuesta
    // Width de 100% para que ocupe todo el espacio disponible
    const closeButton = document.createElement('button');
    closeButton.id = 'dd-complete';
    closeButton.className = 'dd-nav-btn';
    closeButton.textContent = actions?.complete ? actions.complete.label : 'Complete survey';
    closeButton.style.cssText = `
      background: #1E293B;
      color: #fff;
      border: none;
      min-height: 44px;
      padding: 12px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 15px;
      font-weight: 600;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      transition: filter .15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    `;
    closeButton.onmouseenter = () => {
        closeButton.style.filter = 'brightness(0.9)';
    }
    closeButton.onmouseleave = () => {
        closeButton.style.filter = 'brightness(1)';
    }
    closeButton.onclick = () => {
        emit('popup_clicked', surveyId, {action: 'complete'});
        onClose();
    };

    // Botón send, si es primera pagina ocupara el espacio completo pero si no estara al lado derecho
    const submitButton = document.createElement('button');
    submitButton.id = 'dd-submit';
    submitButton.className = 'dd-nav-btn';
    submitButton.textContent = actions?.accept ? actions.accept.label : 'Send';
    submitButton.style.cssText = `
      background: #1E293B;
      color: #fff;
      border: none;
      min-height: 44px;
      padding: 12px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 15px;
      font-weight: 600;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      transition: filter .15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    `;
    submitButton.onclick = () => {
        if (!surveyCompletedEmitted) {
            emit('popup_clicked', surveyId, {action: 'manual_send'});
            // Dispara envío nativo si existe
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (formInstance as any)?.send?.();
        }
    };

    backButton.style.display = 'none';
    startButton.style.display = 'none';
    submitButton.style.display = 'none';
    closeButton.style.display = 'none';

    // Insertar botones dentro del footer en orden visual (row-reverse deja primario a la derecha)
    footer.appendChild(submitButton);
    footer.appendChild(backButton);
    footer.appendChild(closeButton);
    footer.appendChild(startButton);

    // Añadir footer al main y main al containerContent
    containerContent.appendChild(main);
    // El footer va fuera del área scrollable, como hermano de `main`.
    footer.style.flex = '0 0 auto';
    containerContent.appendChild(footer);

    // Helper para controlar visibilidad de botones según estado
    type ViewState = 'loading' | 'start' | 'in_progress_first' | 'in_progress_next' | 'completed' | 'error';

    function updateButtons(state: ViewState) {
        // Por defecto, ocultar todos
        backButton.style.display = 'none';
        startButton.style.display = 'none';
        submitButton.style.display = 'none';
        closeButton.style.display = 'none';
        // Reset widths por estado
        backButton.style.width = '';
        startButton.style.width = '';
        submitButton.style.width = '';
        closeButton.style.width = '';

        switch (state) {
            case 'loading':
                // Footer se ocultará desde setLoading
                break;
            case 'start':
                // Solo botón Start a ancho completo
                startButton.style.display = 'inline-flex';
                startButton.style.width = '100%';
                break;
            case 'in_progress_first':
                // Solo botón Send (lado derecho), ancho auto
                submitButton.style.display = 'inline-flex';
                submitButton.style.width = '';
                setLoading(false);
                break;
            case 'in_progress_next':
                // Mostrar Back (izquierda) + Send (derecha)
                backButton.style.display = 'inline-flex';
                submitButton.style.display = 'inline-flex';
                setLoading(false);
                break;
            case 'completed':
                // Mostrar Close/Complete a ancho completo como acción principal
                closeButton.style.display = 'inline-flex';
                closeButton.style.width = '100%';
                setLoading(false);
                break;
            case 'error':
                // En error, permitir cerrar (ancho auto)
                // closeButton.style.display = 'inline-flex';
                setLoading(false);
                break;
        }
    }

    /** Estado de navegación según la profundidad recorrida (no según `total`). */
    function updateNavButtons() {
        updateButtons(pageDepth > 0 ? 'in_progress_next' : 'in_progress_first');
    }

    /**
     * Pantalla final con el `successMessage` configurado en la plataforma. La pinta el popup y
     * no `@magicfeedback/native`, cuyo `renderSuccess` usa `textContent` (el mensaje es HTML del
     * editor: imagen + texto) y cuyo fallback es un literal que ignora el estilo del survey.
     * Va por innerHTML igual que `renderStartMessage` con el mensaje de inicio.
     */
    let successMessageHtml = '';
    function showSuccessScreen() {
        progressEl.style.display = 'none';
        formWrapper.style.display = 'none';
        let done = main.querySelector('.deepdots-success') as HTMLElement | null;
        if (!done) {
            done = document.createElement('div');
            done.className = 'deepdots-success';
            done.style.cssText = `width:100%; text-align:center; padding:24px 0; color:${theme.textPrimary};`;
            main.insertBefore(done, errorHint);
        }
        done.innerHTML = successMessageHtml || '<p>Thank you for your feedback!</p>';
        done.querySelectorAll('img').forEach((img) => {
            img.style.cssText = 'max-width:100%; height:auto; margin:0 auto 16px auto; display:block;';
        });
    }

    // Ensamblar popup
    popup.appendChild(header);
    popup.appendChild(progressEl);
    popup.appendChild(containerContent);

    container.innerHTML = '';
    container.appendChild(popup);
    container.style.display = 'flex';
    container.style.justifyContent = pos.justifyContent;
    container.style.alignItems = pos.alignItems;
    container.style.background = pos.background;
    if (pos.padding) container.style.padding = pos.padding;

    // Gestión dinámica de loading
    function setLoading(isLoading: boolean) {
        spinnerEl.style.display = isLoading ? 'flex' : 'none';
        if (!isLoading) {
            formHost.style.visibility = 'visible';
        }
        // Ocultar totalmente los botones cuando está cargando
        footer.style.display = isLoading ? 'none' : 'flex';
        // Ajustar estados de los botones por si se muestran
        backButton.disabled = isLoading;
        startButton.disabled = isLoading;
        closeButton.disabled = isLoading;
        submitButton.disabled = isLoading;
        submitButton.style.opacity = isLoading ? '0.6' : '1';
        submitButton.style.cursor = isLoading ? 'not-allowed' : 'pointer';
        // No sobrescribir el estado de botones al finalizar la carga.
        if (isLoading) {
            updateButtons('loading');
        }
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
            sdkWarn('[MagicFeedback] form() no disponible. Fallback manual.');
            setLoading(false);
            return;
        }
        magicfeedback.init({
            debug: true,
            env: env === 'production' ? 'prod' : 'dev'}
        );
        // Contrato Fase 1 §5: profile = identidad del usuario; metadata = contexto de tracking (session_id + user_id)
        const { profile, metadata } = buildSurveyIdentity(userId ?? null, sessionId ?? null, miniService ?? null, analyticsFeedbackSessionId ?? null);
        formInstance = magicfeedback.form(surveyId, productId, profile, metadata);

        interface TypedGenerateOptions {
            addButton: boolean;
            getMetaData: boolean;
            addSuccessScreen: boolean;
            onLoadedEvent?: (args: {
                formData: FormData,
                progress?: number, total?: number
            }) => void;
            beforeSubmitEvent?: () => void;
            afterSubmitEvent?: (args: { error?: string, completed: boolean, progress: number, total: number, followup?: boolean }) => void;
            onBackEvent?: (args: { error?: string, progress: number, total: number, followup: boolean }) => void;
        }

        const generateOptions: TypedGenerateOptions = {
            addButton: false,
            getMetaData: true,
            // La pantalla final la pinta el popup: `renderSuccess` de @magicfeedback/native usa
            // textContent, así que el mensaje de la plataforma (HTML con imagen) no se vería, y
            // su fallback es un literal genérico que ignora `style.successMessage`.
            addSuccessScreen: false,
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
            } catch {
                // silencioso
            }
            // Personalización del popup basada en formData.style
            const s = formData?.style;
            if (s && !stylesInjected) {
                stylesInjected = true;
                if (s.successMessage) successMessageHtml = s.successMessage;
                // La barra de progreso la decide el host (init) y, si no se pronuncia, la plataforma.
                if (options?.showProgressBar === undefined) progressEnabled = s.showProgressBar === true;
                if (s.showProgressUnit !== undefined) progressShowUnit = s.showProgressUnit !== false;
                if (s.progressUnit) progressUnit = s.progressUnit;
                if (s.loadingBarColor) {
                    progressBar.style.background = s.loadingBarColor;
                    progressFollowUp.style.background = s.loadingBarColor;
                }
                // Fondo del contenedor popup
                if (s.boxBackgroundColor) {
                    popup.style.background = s.boxBackgroundColor;
                }
                // Alineación del contenido principal
                if (s.contentAlign) {
                    // 'top' => start, 'center' => center
                    main.style.justifyContent = s.contentAlign === 'center' ? 'center' : 'flex-start';
                }
                // Botón primario (submit, start)
                if (s.buttonPrimaryColor) {
                    submitButton.style.background = s.buttonPrimaryColor;
                    submitButton.style.border = 'none';
                    submitButton.style.color = '#fff';

                    startButton.style.background = s.buttonPrimaryColor;
                    startButton.style.border = 'none';
                    startButton.style.color = '#fff';

                    closeButton.style.background = s.buttonPrimaryColor;
                    closeButton.style.border = 'none';
                    closeButton.style.color = '#fff';
                }
                // Botón secundario (back) — outlined: fondo blanco, letra y borde del color secundario
                if (s.buttonSecondaryColor) {
                    // Botón de texto: solo tiñe la etiqueta, sin recuperar fondo ni borde.
                    backButton.style.background = 'transparent';
                    backButton.style.color = s.buttonSecondaryColor;
                    backButton.style.border = 'none';
                }
                // El logo va encima de la barra de progreso, como hermano del header.
                insertPopupLogo(popup, progressEl, s, 'deepdots-popup-logo');

                if (s.startMessage && s.startMessage !== '') {
                    // Si hay mensaje de inicio, mostrar botón Start inicialmente
                    sdkLog(s.startMessage);
                    onStartPage = true;
                    updateButtons('start');
                } else {
                    // Si no hay mensaje de inicio, mostrar estado de primera página (solo Send)
                    updateButtons('in_progress_first');
                }
            } else {
                // Sin estilos, asumir primera página normal
                updateButtons('in_progress_first');
            }

            // El total solo se conoce con el form ya montado.
            updateProgress({progress: formInstance.progress, total: formInstance.total});
            emit('popup_clicked', surveyId, {action: 'loaded'});
            setLoading(false); // hace visible el formulario y oculta el spinner
        };
        generateOptions.beforeSubmitEvent = () => {
            setLoading(true);
            emit('popup_clicked', surveyId, {action: 'before_submit'});
        };
        generateOptions.afterSubmitEvent = ({error, completed, total, progress, followup}) => {
            // No cambiar estado de loading aquí; lo gestiona cada transición
            // Normalizar el error a texto seguro
            const errText = error ? (typeof error === 'string' ? error : ((error as unknown as {message?: string}).message ?? String(error))) : '';
            if (errText) {
                // Desactivar loading para que se vean los botones
                setLoading(false);
                // Caso específico: error de pregunta obligatoria
                if (errText.toLowerCase().includes('no response')) {
                    errorHint.textContent = 'Please answer the required question to continue.';
                    errorHint.style.display = 'block';
                    emit('popup_clicked', surveyId, {action: 'validation_error_required'});
                    // La página no ha cambiado: el estado de navegación se queda como estaba.
                    updateNavButtons();
                    return;
                }
                // Otros errores: mostrar mensaje genérico y permitir cerrar
                errorHint.textContent = 'An error occurred while submitting. Please try again or close the popup.';
                errorHint.style.display = 'block';
                emit('popup_clicked', surveyId, {action: 'submit_error', error: errText});
                // updateButtons('error');
                return;
            }
            // Limpiar hint si no hay error
            errorHint.style.display = 'none';
            setLoading(false);
            if (completed) {
                emit('survey_completed', surveyId, {action: 'completed'});
                surveyCompletedEmitted = true;
                showSuccessScreen();
                updateButtons('completed');
                updateProgress({progress, total, completed: true});
                return;
            }
            emit('popup_clicked', surveyId, {action: 'partial'});
            pageDepth++;
            updateNavButtons();
            updateProgress({progress, total, followup});
        };
        generateOptions.onBackEvent = ({progress, error, followup}) => {
            emit('popup_clicked', surveyId, {action: 'back'});
            // Con error ("No page found") no hubo navegación: la profundidad no se toca.
            if (!error) pageDepth = Math.max(0, pageDepth - 1);
            updateNavButtons();
            // onBackEvent no trae `total`: se lee del form, que es su dueño.
            updateProgress({progress, total: formInstance.total, followup});
        };

        // Ejecutar generación con opciones tipadas
        formInstance.generate(formDivId, generateOptions)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .catch((err: any) => {
                sdkError('[MagicFeedback] Error generating form:', err);
                setLoading(false);
            });
    } catch (e) {
        sdkError('[MagicFeedback] Exception initializing form:', e);
        setLoading(false);
    }
}
