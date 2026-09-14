import type { DeepdotsEventType, PopupActions, PopupStyle } from '../types';
import type { PopupRenderer, PopupRenderOptions } from './renderer';
import { buildSurveyIdentity } from '../tracking/tracking-manager';
import { buildSurveyHtml } from '../ui/surveyHtml';
import { REVEAL_TIMEOUT_MS } from '../ui/reveal';
import { sdkWarn } from '../util/logger';

/**
 * Margen que el aviso nativo de "listo" deja por detrás del techo que ya lleva el HTML. El
 * WebView se revela solo a `REVEAL_TIMEOUT_MS`; este respaldo solo debe entrar cuando el WebView
 * no llega ni a ejecutar el HTML (motor que no arranca, documento que no carga), que es el único
 * caso en el que el host se quedaría esperando para siempre.
 */
export const NATIVE_READY_GRACE_MS = 500;

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
  /**
   * Se llama cuando el survey ya está pintado dentro del WebView, o pasado el techo de espera.
   *
   * Sirve para no enseñar un WebView en blanco: monta el WebView en cuanto llegue `onShow` (fuera
   * de pantalla o transparente) y ábrelo al recibir `onReady`. El HTML se revela solo de todas
   * formas, así que el host que no lo use sigue funcionando igual.
   */
  onReady?: (payload: { surveyId: string }) => void;
}

/**
 * Renderer de React Native: el SDK no puede pintar componentes RN, así que entrega el
 * HTML del survey al host (que lo monta en `react-native-webview`) y traduce los
 * mensajes del WebView a eventos de popup del SDK (→ `POST /sdk/popups`, Messaging #18–22).
 *
 * Uso: monta el WebView con `onShow` y enséñalo con `onReady`, para que el usuario no vea el
 * WebView arrancando en blanco (motor + bundle del CDN + fetch del survey).
 * ```tsx
 * const renderer = new ReactNativePopupRenderer({
 *   onShow: (p) => setSurvey({ ...p, ready: false }),
 *   onReady: () => setSurvey((s) => (s ? { ...s, ready: true } : s)),
 *   onHide: () => setSurvey(null),
 * });
 * sdk.setRenderer(renderer);
 * // …
 * // ⚠️ Con `<Modal visible={survey.ready}>` esto NO funciona: React Native no monta los hijos
 * // de un Modal cerrado, así que el WebView no empezaría a cargar y `ready` no llegaría nunca.
 * // El WebView tiene que estar montado y solo invisible.
 * {survey ? (
 *   <View style={[StyleSheet.absoluteFill, { opacity: survey.ready ? 1 : 0 }]}
 *         pointerEvents={survey.ready ? 'auto' : 'none'}>
 *     <WebView source={{ html: survey.html }}
 *              onMessage={(e) => renderer.handleMessage(e.nativeEvent.data)} />
 *   </View>
 * ) : null}
 * ```
 *
 * Quien prefiera no complicarse puede ignorar `onReady` y abrir su Modal en `onShow`: el HTML se
 * revela solo igualmente, así que el usuario verá el contenedor del host unos cientos de ms antes
 * que la tarjeta, pero nunca el spinner.
 */
export class ReactNativePopupRenderer implements PopupRenderer {
  private emitFn: EmitFn | null = null;
  private onCloseFn: (() => void) | null = null;
  private currentSurveyId: string | null = null;
  private partialEmitted = false;
  private readyEmitted = false;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private options: ReactNativeRendererOptions = {}) {}

  init(): void {
    /* nada que preparar */
  }

  show(
    surveyId: string,
    productId: string,
    actions: PopupActions | undefined,
    emit: EmitFn,
    onClose: () => void,
    env: string = 'production',
    userId?: string,
    style?: PopupStyle,
    sessionId?: string,
    miniService?: string,
    analyticsFeedbackSessionId?: string,
    renderChrome?: boolean,
    options?: PopupRenderOptions,
  ): void {
    this.emitFn = emit;
    this.onCloseFn = onClose;
    this.currentSurveyId = surveyId;
    this.partialEmitted = false;
    this.readyEmitted = false;
    this.armReadyFallback(surveyId);

    const { profile, metadata } = buildSurveyIdentity(userId ?? null, sessionId ?? null, miniService ?? null, analyticsFeedbackSessionId ?? null);
    const html = buildSurveyHtml({
      surveyId,
      productId,
      env,
      profile,
      metadata,
      font: style?.font,
      theme: style?.theme,
      position: style?.position,
      actions,
      // renderChrome:false (init) → HTML sin tarjeta/overlay: el host lo envuelve en su Modal.
      chrome: renderChrome,
      title: options?.title,
      showProgressBar: options?.showProgressBar,
      surveyCss: options?.surveyCss,
      language: options?.language,
    });
    if (this.options.onShow) {
      this.options.onShow({ surveyId, productId, html });
    } else {
      sdkWarn(
        '[Deepdots] ReactNativePopupRenderer has no onShow: pass { onShow } to new ReactNativePopupRenderer({...}) to mount the survey WebView.',
      );
    }
  }

  hide(): void {
    this.clearReadyFallback();
    this.options.onHide?.();
    this.currentSurveyId = null;
  }

  /** Respaldo del aviso de listo por si el WebView no llega a ejecutar el HTML. */
  private armReadyFallback(surveyId: string): void {
    this.clearReadyFallback();
    if (!this.options.onReady) return;
    this.readyTimer = setTimeout(() => {
      this.readyTimer = null;
      this.emitReady(surveyId);
    }, REVEAL_TIMEOUT_MS + NATIVE_READY_GRACE_MS);
  }

  private clearReadyFallback(): void {
    if (this.readyTimer !== null) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
  }

  /** Idempotente: el WebView puede avisar a la vez que vence el respaldo. */
  private emitReady(surveyId: string): void {
    if (this.readyEmitted) return;
    this.readyEmitted = true;
    this.clearReadyFallback();
    this.options.onReady?.({ surveyId });
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
      case 'ready':
        // El survey ya está pintado dentro del WebView. NO es interacción del usuario: no debe
        // marcar el popup como PARTIAL.
        this.emitReady(surveyId);
        break;
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
        // Solo reporta el estado COMPLETED. NO cierra: el WebView acaba de pintar la pantalla
        // final del survey y cerrar aquí la hacía invisible. El cierre llega después con
        // `popup_close`, cuando el usuario pulsa el botón de completar.
        this.emitFn('survey_completed', surveyId);
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
