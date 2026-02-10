import {DeepdotsEventType, PopupActions} from '../types';
import { renderPopup } from '../ui/renderPopup';
import { isReactNativeEnv, createReactNativeRenderer } from './react-native-renderer';

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
    env?: string
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
      document.body.appendChild(this.container);
    }
  }

  show(
    surveyId: string,
    productId: string,
    actions: PopupActions | undefined,
    emit: (type: DeepdotsEventType, surveyId: string, data?: Record<string, unknown>) => void,
    onClose: () => void,
    env: string = 'production'
  ): void {
    if (!this.container) this.init();
    if (!this.container) return; // aún sin DOM
    renderPopup(this.container, surveyId, productId, actions, emit, onClose, env);
  }

  hide(): void {
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
