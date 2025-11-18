import type { DeepdotsEventType } from '../types';
import type { PopupRenderer } from './renderer';

/**
 * Stub de renderer para React Native.
 * NOTA: Este archivo es sólo un ejemplo y NO renderiza UI real.
 * En una app RN se debería conectar con un Context, NativeModule o bridge para mostrar un Modal.
 */
export class ReactNativePopupRenderer implements PopupRenderer {
  private mounted = false;
  private lastSurveyId: string | null = null;
  private emitFn: ((type: DeepdotsEventType, surveyId: string, data?: Record<string, unknown>) => void) | null = null;
  private onCloseFn: (() => void) | null = null;
  private completed = false;

  init(): void {
    // Preparar cualquier estado / registro de listeners nativos.
    // Aquí se podría inicializar un NativeModule o store global.
    // No hace nada en el stub.
  }

  show(
    surveyId: string,
    productId: string,
    data: Record<string, unknown> | undefined,
    emit: (type: DeepdotsEventType, surveyId: string, data?: Record<string, unknown>) => void,
    onClose: () => void
  ): void {
    this.mounted = true;
    this.lastSurveyId = surveyId;
    this.emitFn = emit;
    this.onCloseFn = onClose;
    this.completed = false;
    // Simula primera interacción / aparición
    queueMicrotask(() => emit('popup_clicked', surveyId, data));
    console.log('[ReactNativePopupRenderer] (stub) show survey:', { surveyId, productId, data });
  }

  /** Completar la encuesta desde la capa nativa */
  public completeSurvey(data?: Record<string, unknown>): void {
    if (!this.mounted || this.completed || !this.lastSurveyId || !this.emitFn) return;
    this.completed = true;
    this.emitFn('survey_completed', this.lastSurveyId, data);
    // cerrar popup
    this.onCloseFn?.();
    this.mounted = false;
    console.log('[ReactNativePopupRenderer] (stub) survey completed:', { surveyId: this.lastSurveyId, data });
    this.lastSurveyId = null;
  }

  hide(): void {
    if (!this.mounted) return;
    this.mounted = false;
    console.log('[ReactNativePopupRenderer] (stub) hide survey:', this.lastSurveyId);
    this.lastSurveyId = null;
  }
}

/**
 * Detección simple de entorno React Native.
 * navigator.product === 'ReactNative' suele estar presente.
 */
export function isReactNativeEnv(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof navigator !== 'undefined' && (navigator as any).product === 'ReactNative';
}

/** Factoría opcional para crear renderer RN si detectado */
export function createReactNativeRenderer(): PopupRenderer {
  return new ReactNativePopupRenderer();
}
