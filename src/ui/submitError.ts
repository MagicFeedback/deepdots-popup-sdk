/**
 * Motivo de un error al enviar una página del survey, para el evento `survey_error`.
 *
 * El popup enseña siempre uno de dos textos (`errorRequired` / `errorSubmit`) y el motivo real
 * solo quedaba en la consola del visitante: un fallo en la web de un cliente no se podía
 * diagnosticar sin pedirle a él que abriera las devtools. `@magicfeedback/native` ≥ 2.2.37
 * manda un `SubmitError` con `code`; con una versión anterior solo hay texto, y "No response"
 * quería decir tanto "obligatoria vacía" como "la API no ha guardado la respuesta".
 *
 * Vive aparte de `renderPopup` por lo mismo que `reveal`: importarlo desde allí metería
 * `@magicfeedback/native` en el bundle de React Native. El WebView (`surveyHtml`) lleva su
 * propio espejo en ES5.
 */

export type SurveyErrorReason =
    | 'required'     // pregunta obligatoria sin responder (validación, no fallo)
    | 'send_failed'  // sdk/feedback no ha devuelto sesión (HTTP o red)
    | 'no_page'      // el historial del survey no tiene página actual (bug de estado)
    | 'unknown';     // cualquier otro error del survey (p. ej. una follow-up que revienta)

/** Largo máximo del mensaje que viaja a analítica: basta para identificar el error. */
export const SURVEY_ERROR_MESSAGE_MAX = 300;

const REASON_BY_CODE: Record<string, SurveyErrorReason> = {
    REQUIRED: 'required',
    SEND_FAILED: 'send_failed',
    NO_PAGE: 'no_page',
};

/** Texto seguro de un error de `afterSubmitEvent` (string, Error o lo que llegue). */
export function submitErrorText(error: unknown): string {
    if (!error) return '';
    if (typeof error === 'string') return error;
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : String(error);
}

export function classifySubmitError(error: unknown): { reason: SurveyErrorReason; message: string } {
    const message = submitErrorText(error).slice(0, SURVEY_ERROR_MESSAGE_MAX);
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
    if (typeof code === 'string' && REASON_BY_CODE[code]) return { reason: REASON_BY_CODE[code], message };
    // Sin `code` (native < 2.2.37): el criterio de siempre, por texto.
    if (message.toLowerCase().includes('no response')) return { reason: 'required', message };
    return { reason: 'unknown', message };
}

/**
 * Espejo ES5 de `classifySubmitError` para el JS del WebView (`surveyHtml`). Lo evalúa
 * `submitError.test.ts` contra la misma batería que el módulo, para que no diverjan.
 */
export const SUBMIT_ERROR_JS = `
function ddClassifySubmitError(error){
  var message='';
  if(error){
    if(typeof error==='string'){ message=error; }
    else if(typeof error.message==='string'){ message=error.message; }
    else { message=String(error); }
  }
  message=message.slice(0, ${SURVEY_ERROR_MESSAGE_MAX});
  var byCode={ REQUIRED:'required', SEND_FAILED:'send_failed', NO_PAGE:'no_page' };
  var code=error && typeof error==='object' ? error.code : undefined;
  if(typeof code==='string' && byCode.hasOwnProperty(code)){ return { reason: byCode[code], message: message }; }
  if(message.toLowerCase().indexOf('no response')!==-1){ return { reason: 'required', message: message }; }
  return { reason: 'unknown', message: message };
}`;
