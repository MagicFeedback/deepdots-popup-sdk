import {DeepdotsEventType, PopupActions, PopupStyle} from '../types';
import { isReactNativeEnv, createReactNativeRenderer } from './react-native-renderer';
// renderPopup (DOM + @magicfeedback/native) se carga PEREZOSAMENTE solo al mostrar
// un popup en navegador, para que importar el SDK sea seguro en React Native/SSR.

/**
 * Ajustes de presentación que no vienen del estilo del popup. Van agrupados para no seguir
 * alargando la lista posicional de `show`, que ya arrastra doce parámetros.
 */
export interface PopupRenderOptions {
  /**
   * Título de la cabecera: el `title` de la definición del popup, tal cual llega de la API.
   * Varía por popup y vacío es un valor válido (la cabecera se queda solo con la X).
   */
  title?: string;
  /** Barra de progreso: `undefined` deja decidir a la plataforma, `true`/`false` la fuerzan. */
  showProgressBar?: boolean;
  /** CSS del host, inyectado el último: gana sobre el del SDK y el de `@magicfeedback/native`. */
  surveyCss?: string;
}

export interface PopupRenderer {
  /** Preparar recursos si aplica */
  init?(): void;
  /** Mostrar popup */
  show(
    surveyId: string,
    productId: string,
    actions: PopupActions | undefined,
    emit: (type: DeepdotsEventType, surveyId: string, data?: Record<string, unknown>) => void,
    onClose: () => void,
    env?: string,
    userId?: string,
    style?: PopupStyle,
    sessionId?: string,
    miniService?: string,
    analyticsFeedbackSessionId?: string,
    renderChrome?: boolean,
    options?: PopupRenderOptions,
  ): void;
  /** Ocultar popup */
  hide(): void;
}

/** Renderer que no hace nada (SSR / entornos sin DOM) */
export class NoopPopupRenderer implements PopupRenderer {
  show(): void { /* no-op */ }
  hide(): void { /* no-op */ }
}

/** Renderer para navegadores usando la implementación actual basada en renderPopup */
export class BrowserPopupRenderer implements PopupRenderer {
  private container: HTMLElement | null = null;
  private visible = false;

  init(): void {
    if (typeof document === 'undefined') return;
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'deepdots-popup-container';
      this.container.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: none;
          z-index: 999999;
          background: rgba(0, 0, 0, 0.5);
          justify-content: center;
          align-items: center;
        `;
    }
    if (!document.body.contains(this.container)) {
      document.body.appendChild(this.container);
    }
  }

  show(
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
    _renderChrome?: boolean, // solo aplica a RN (WebView); el popup DOM web siempre lleva su chrome
    options?: PopupRenderOptions,
  ): void {
    if (this.visible) return;
    if (!this.container || !document.body.contains(this.container)) this.init();
    if (!this.container) return; // aún sin DOM
    this.visible = true;
    const container = this.container;
    void import('../ui/renderPopup').then(({ renderPopup }) => {
      renderPopup(container, surveyId, productId, actions, emit, onClose, env, userId, style, sessionId, miniService, analyticsFeedbackSessionId, options);
    });
  }

  hide(): void {
    this.visible = false;
    if (this.container) {
      this.container.style.display = 'none';
      this.container.innerHTML = '';
    }
  }
}

/** Factoría para obtener renderer por defecto */
export function createDefaultRenderer(): PopupRenderer {
  if (typeof document === 'undefined') {
    // Entorno sin DOM: probar RN primero
    if (isReactNativeEnv()) return createReactNativeRenderer();
    return new NoopPopupRenderer();
  }
  // Si estamos en React Native y hay WebView con document emulado, aún queremos RN renderer
  if (isReactNativeEnv()) return createReactNativeRenderer();
  return new BrowserPopupRenderer();
}
