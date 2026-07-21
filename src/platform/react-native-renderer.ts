import type { DeepdotsEventType, PopupActions, PopupStyle } from '../types';
import type { PopupRenderer } from './renderer';
import { buildSurveyIdentity } from '../tracking/tracking-manager';
import { buildSurveyHtml } from '../ui/surveyHtml';
import { sdkWarn } from '../util/logger';

type EmitFn = (type: DeepdotsEventType, surveyId: string, data?: Record<string, unknown>) => void;

/** Payload que recibe el host para montar el WebView del survey. */
export interface ReactNativeSurveyPayload {
  surveyId: string;
  productId: string;
  /** HTML autocontenido para `<WebView source={{ html }}>`. */
  html: string;
}

export interface ReactNativeRendererOptions {
  /** Se llama al mostrar un popup: monta el WebView con `payload.html`. */
  onShow?: (payload: ReactNativeSurveyPayload) => void;
  /** Se llama al cerrar el popup: desmonta el WebView. */
  onHide?: () => void;
}

/**
 * Renderer de React Native: el SDK no puede pintar componentes RN, así que entrega el
 * HTML del survey al host (que lo monta en `react-native-webview`) y traduce los
 * mensajes del WebView a eventos de popup del SDK (→ `POST /sdk/popups`, Messaging #18–22).
 *
 * Uso:
 * ```tsx
 * const renderer = new ReactNativePopupRenderer({
 *   onShow: (p) => setSurvey({ ...p, visible: true }),
 *   onHide: () => setSurvey((s) => ({ ...s, visible: false })),
 * });
 * sdk.setRenderer(renderer);
 * // …
 * <WebView source={{ html: survey.html }}
 *          onMessage={(e) => renderer.handleMessage(e.nativeEvent.data)} />
 * ```
 */
export class ReactNativePopupRenderer implements PopupRenderer {
  private emitFn: EmitFn | null = null;
  private onCloseFn: (() => void) | null = null;
  private currentSurveyId: string | null = null;
  private partialEmitted = false;

  constructor(private options: ReactNativeRendererOptions = {}) {}

  init(): void {
    /* nada que preparar */
  }

  show(
    surveyId: string,
    productId: string,
    _actions: PopupActions | undefined,
    emit: EmitFn,
    onClose: () => void,
    env: string = 'production',
    userId?: string,
    style?: PopupStyle,
    sessionId?: string,
    miniService?: string,
    analyticsFeedbackSessionId?: string,
  ): void {
    this.emitFn = emit;
    this.onCloseFn = onClose;
    this.currentSurveyId = surveyId;
    this.partialEmitted = false;

    const { profile, metadata } = buildSurveyIdentity(userId ?? null, sessionId ?? null, miniService ?? null, analyticsFeedbackSessionId ?? null);
    const html = buildSurveyHtml({ surveyId, productId, env, profile, metadata, font: style?.font });
    if (this.options.onShow) {
      this.options.onShow({ surveyId, productId, html });
    } else {
      sdkWarn(
        '[Deepdots] ReactNativePopupRenderer sin onShow: pasa { onShow } a new ReactNativePopupRenderer({...}) para montar el WebView del survey.',
      );
    }
  }

  hide(): void {
    this.options.onHide?.();
    this.currentSurveyId = null;
  }

  /**
   * El host la conecta al `onMessage` del WebView. Traduce los mensajes del survey a
   * eventos del SDK: primera interacción → `popup_clicked` (PARTIAL), completado →
   * `survey_completed` (COMPLETED) y cierra el popup.
   */
  handleMessage(raw: string): void {
    const surveyId = this.currentSurveyId;
    if (!surveyId || !this.emitFn) return;

    let name: string | undefined;
    try {
      name = (JSON.parse(raw) as { name?: string }).name;
    } catch {
      name = raw; // mensajes simples ("error:load")
    }

    switch (name) {
      case 'loaded':
      case 'before_submit':
      case 'after_submit':
      case 'back':
        if (!this.partialEmitted) {
          this.partialEmitted = true;
          this.emitFn('popup_clicked', surveyId, { action: 'partial' });
        }
        break;
      case 'survey_completed':
        this.emitFn('survey_completed', surveyId);
        this.onCloseFn?.(); // el core enruta a hidePopup() → renderer.hide() → onHide
        break;
      case 'popup_close':
        this.onCloseFn?.();
        break;
      default:
        break;
    }
  }
}

/** Detección simple de entorno React Native. */
export function isReactNativeEnv(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof navigator !== 'undefined' && (navigator as any).product === 'ReactNative';
}

/** Factoría usada por `createDefaultRenderer` cuando se detecta RN (el host debería pasar onShow). */
export function createReactNativeRenderer(): PopupRenderer {
  return new ReactNativePopupRenderer();
}
