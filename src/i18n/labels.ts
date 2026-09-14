import type { PopupActions } from '../types';

/**
 * Textos que pinta el SDK alrededor del survey (botones del footer, barra de progreso,
 * aria-labels y avisos de error). NO son textos del survey: las preguntas, placeholders y
 * opciones las localiza `@magicfeedback/native` con `formData.lang[0]`, el idioma configurado
 * en la integración. Este módulo existe para que el chrome del popup hable ese mismo idioma
 * en lugar de quedarse siempre en inglés.
 *
 * Espejo del `i18n/DefaultLabels.kt` del SDK nativo (KMP): mismos locales y mismas reglas de
 * resolución, para que las tres rutas (popup DOM web, WebView de RN y Compose) digan lo mismo.
 */

/** Locales con traducción propia. Cualquier otro idioma cae a `en`. */
export type PopupLocale =
  | 'en' | 'es' | 'da' | 'no' | 'sv' | 'fi' | 'de' | 'fr' | 'pt' | 'ar' | 'bn' | 'zh-CN';

export interface PopupLabels {
  /** Acción principal: enviar la respuesta. */
  accept: string;
  /** Acción de descarte. */
  decline: string;
  /** Botón de la pantalla de bienvenida. */
  start: string;
  /** Botón de la pantalla final. */
  complete: string;
  /** Volver a la pregunta anterior. */
  back: string;
  /** Sustantivo del contador de progreso ("Question" en `Question 2 of 5`). */
  question: string;
  /** Separador del contador de progreso ("of" en `Question 2 of 5`). */
  of: string;
  /** Distintivo de las preguntas de seguimiento dinámicas. */
  followUp: string;
  /** aria-label del botón de cerrar. */
  closeAria: string;
  /** aria-label del spinner mientras carga el survey. */
  loadingAria: string;
  /** Aviso al intentar avanzar con una pregunta obligatoria sin responder. */
  errorRequired: string;
  /** Aviso cuando el envío falla. */
  errorSubmit: string;
}

const EN: PopupLabels = {
  accept: 'Send',
  decline: 'Cancel',
  start: 'Start survey',
  complete: 'Complete survey',
  back: 'Back',
  question: 'Question',
  of: 'of',
  followUp: 'Follow-up',
  closeAria: 'Close popup',
  loadingAria: 'Loading survey',
  errorRequired: 'Please answer the required question to continue.',
  errorSubmit: 'An error occurred while submitting. Please try again or close the popup.',
};

const ES: PopupLabels = {
  accept: 'Enviar',
  decline: 'Cancelar',
  start: 'Empezar encuesta',
  complete: 'Completar encuesta',
  back: 'Atrás',
  question: 'Pregunta',
  of: 'de',
  followUp: 'Seguimiento',
  closeAria: 'Cerrar ventana emergente',
  loadingAria: 'Cargando encuesta',
  errorRequired: 'Responde la pregunta obligatoria para continuar.',
  errorSubmit: 'Se produjo un error al enviar. Inténtalo de nuevo o cierra la ventana.',
};

const DA: PopupLabels = {
  accept: 'Send',
  decline: 'Annuller',
  start: 'Start undersøgelse',
  complete: 'Afslut undersøgelse',
  back: 'Tilbage',
  question: 'Spørgsmål',
  of: 'af',
  followUp: 'Opfølgning',
  closeAria: 'Luk pop op',
  loadingAria: 'Indlæser undersøgelse',
  errorRequired: 'Besvar venligst det obligatoriske spørgsmål for at fortsætte.',
  errorSubmit: 'Der opstod en fejl under afsendelsen. Prøv igen, eller luk pop op-vinduet.',
};

const NO: PopupLabels = {
  accept: 'Send',
  decline: 'Avbryt',
  start: 'Start undersøkelse',
  complete: 'Fullfør undersøkelse',
  back: 'Tilbake',
  question: 'Spørsmål',
  of: 'av',
  followUp: 'Oppfølging',
  closeAria: 'Lukk popup',
  loadingAria: 'Laster undersøkelse',
  errorRequired: 'Svar på det obligatoriske spørsmålet for å fortsette.',
  errorSubmit: 'Det oppstod en feil under innsendingen. Prøv igjen, eller lukk popupen.',
};

const SV: PopupLabels = {
  accept: 'Skicka',
  decline: 'Avbryt',
  start: 'Starta undersökning',
  complete: 'Slutför undersökning',
  back: 'Tillbaka',
  question: 'Fråga',
  of: 'av',
  followUp: 'Uppföljning',
  closeAria: 'Stäng popup',
  loadingAria: 'Laddar undersökning',
  errorRequired: 'Svara på den obligatoriska frågan för att fortsätta.',
  errorSubmit: 'Ett fel uppstod vid inskickningen. Försök igen eller stäng popupen.',
};

const FI: PopupLabels = {
  accept: 'Lähetä',
  decline: 'Peruuta',
  start: 'Aloita kysely',
  complete: 'Viimeistele kysely',
  back: 'Takaisin',
  question: 'Kysymys',
  of: '/',
  followUp: 'Jatkokysymys',
  closeAria: 'Sulje ponnahdusikkuna',
  loadingAria: 'Ladataan kyselyä',
  errorRequired: 'Vastaa pakolliseen kysymykseen jatkaaksesi.',
  errorSubmit: 'Lähetyksessä tapahtui virhe. Yritä uudelleen tai sulje ponnahdusikkuna.',
};

const DE: PopupLabels = {
  accept: 'Senden',
  decline: 'Abbrechen',
  start: 'Umfrage starten',
  complete: 'Umfrage abschließen',
  back: 'Zurück',
  question: 'Frage',
  of: 'von',
  followUp: 'Folgefrage',
  closeAria: 'Popup schließen',
  loadingAria: 'Umfrage wird geladen',
  errorRequired: 'Bitte beantworte die Pflichtfrage, um fortzufahren.',
  errorSubmit: 'Beim Senden ist ein Fehler aufgetreten. Versuche es erneut oder schließe das Popup.',
};

const FR: PopupLabels = {
  accept: 'Envoyer',
  decline: 'Annuler',
  start: "Commencer l'enquête",
  complete: "Terminer l'enquête",
  back: 'Retour',
  question: 'Question',
  of: 'sur',
  followUp: 'Question complémentaire',
  closeAria: 'Fermer la fenêtre',
  loadingAria: "Chargement de l'enquête",
  errorRequired: 'Veuillez répondre à la question obligatoire pour continuer.',
  errorSubmit: "Une erreur s'est produite lors de l'envoi. Réessayez ou fermez la fenêtre.",
};

const PT: PopupLabels = {
  accept: 'Enviar',
  decline: 'Cancelar',
  start: 'Iniciar questionário',
  complete: 'Concluir questionário',
  back: 'Voltar',
  question: 'Pergunta',
  of: 'de',
  followUp: 'Seguimento',
  closeAria: 'Fechar janela',
  loadingAria: 'A carregar questionário',
  errorRequired: 'Responda à pergunta obrigatória para continuar.',
  errorSubmit: 'Ocorreu um erro ao enviar. Tente novamente ou feche a janela.',
};

// ⚠️ Árabe: el texto es RTL pero el chrome del popup sigue maquetado LTR (ver nota en el
// README). Traducir ya es mejor que dejarlo en inglés; la dirección es una decisión aparte.
const AR: PopupLabels = {
  accept: 'إرسال',
  decline: 'إلغاء',
  start: 'ابدأ الاستبيان',
  complete: 'إنهاء الاستبيان',
  back: 'رجوع',
  question: 'سؤال',
  of: 'من',
  followUp: 'سؤال متابعة',
  closeAria: 'إغلاق النافذة المنبثقة',
  loadingAria: 'جارٍ تحميل الاستبيان',
  errorRequired: 'يرجى الإجابة على السؤال المطلوب للمتابعة.',
  errorSubmit: 'حدث خطأ أثناء الإرسال. يرجى المحاولة مرة أخرى أو إغلاق النافذة.',
};

const BN: PopupLabels = {
  accept: 'পাঠান',
  decline: 'বাতিল',
  start: 'জরিপ শুরু করুন',
  complete: 'জরিপ সম্পূর্ণ করুন',
  back: 'পিছনে',
  question: 'প্রশ্ন',
  of: '/',
  followUp: 'ফলো-আপ',
  closeAria: 'পপআপ বন্ধ করুন',
  loadingAria: 'জরিপ লোড হচ্ছে',
  errorRequired: 'চালিয়ে যেতে আবশ্যক প্রশ্নের উত্তর দিন।',
  errorSubmit: 'জমা দেওয়ার সময় একটি ত্রুটি ঘটেছে। আবার চেষ্টা করুন বা পপআপ বন্ধ করুন।',
};

const ZH_CN: PopupLabels = {
  accept: '发送',
  decline: '取消',
  start: '开始问卷',
  complete: '完成问卷',
  back: '返回',
  question: '问题',
  of: '/',
  followUp: '追问',
  closeAria: '关闭弹窗',
  loadingAria: '正在加载问卷',
  errorRequired: '请回答必答题后继续。',
  errorSubmit: '提交时出错。请重试或关闭弹窗。',
};

/** Tabla completa de traducciones, indexada por locale. */
export const LABELS: Record<PopupLocale, PopupLabels> = {
  en: EN,
  es: ES,
  da: DA,
  no: NO,
  sv: SV,
  fi: FI,
  de: DE,
  fr: FR,
  pt: PT,
  ar: AR,
  bn: BN,
  'zh-CN': ZH_CN,
};

/** Locales con traducción propia del SDK. */
export const SUPPORTED_LANGUAGES: PopupLocale[] = [
  // Los 11 idiomas que la plataforma ofrece para un survey, más zh-CN (que el SDK nativo ya
  // traía). Si la plataforma añade uno nuevo, hay que añadirlo aquí o el chrome saldrá en
  // inglés bajo un survey traducido.
  'en', 'es', 'da', 'no', 'sv', 'fi', 'de', 'fr', 'pt', 'ar', 'bn', 'zh-CN',
];

/**
 * Normaliza un tag BCP-47 al locale con traducción. Reglas (idénticas a KMP):
 *  - el prefijo de idioma manda, sin importar región ni caja (`da`, `da-DK`, `da_DK` → `da`);
 *  - las variantes noruegas (`nb`, `nn`) colapsan en `no`;
 *  - las variantes chinas (`zh`, `zh-Hans`, `zh-CN`, `zh-TW`) colapsan en `zh-CN`;
 *  - `pt-BR` y `pt-PT` comparten juego, igual que `de-AT`/`de-CH` o `fr-CA`;
 *  - cualquier otra cosa, incluido un valor no-string del backend, cae a `en`.
 */
export function resolveLocale(lang?: string | null): PopupLocale {
  if (typeof lang !== 'string') return 'en';
  const normalized = lang.trim().toLowerCase().replace(/_/g, '-');
  if (!normalized) return 'en';
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN';
  const primary = normalized.split('-')[0];
  switch (primary) {
    case 'en': return 'en';
    case 'es': return 'es';
    case 'da': return 'da';
    case 'no':
    case 'nb':
    case 'nn': return 'no';
    case 'sv': return 'sv';
    case 'fi': return 'fi';
    case 'de': return 'de';
    case 'fr': return 'fr';
    case 'pt': return 'pt';
    case 'ar': return 'ar';
    case 'bn': return 'bn';
    default: return 'en';
  }
}

/**
 * Locales que se escriben de derecha a izquierda. Espejo de `RTL_LANGUAGES` de
 * `@magicfeedback/native` (2.2.22), que estampa `dir="rtl"` en el contenedor del survey para
 * esos idiomas: el chrome del popup tiene que voltear con él o media tarjeta queda mirando a
 * un lado y media al otro.
 */
export const RTL_LOCALES: PopupLocale[] = ['ar'];

/** Si el chrome debe pintarse de derecha a izquierda para `lang`. */
export function isRtlLanguage(lang?: string | null): boolean {
  return RTL_LOCALES.includes(resolveLocale(lang));
}

/** Valor del atributo `dir` del chrome para `lang`. Siempre explícito: nunca se hereda del host. */
export function directionFor(lang?: string | null): 'rtl' | 'ltr' {
  return isRtlLanguage(lang) ? 'rtl' : 'ltr';
}

/** Textos del chrome del popup para `lang`. Cae a inglés si el idioma no está soportado. */
export function getLabels(lang?: string | null): PopupLabels {
  return LABELS[resolveLocale(lang)];
}

/** Etiquetas de los cuatro botones del footer, ya resueltas. */
export interface ResolvedActionLabels {
  accept: string;
  decline: string;
  start: string;
  complete: string;
  back: string;
}

/**
 * Resuelve las etiquetas de los botones con la prioridad acordada: lo que configure la
 * plataforma por popup (`actions.*.label`) gana siempre; si falta o viene en blanco, se usa
 * la traducción del SDK para `lang`.
 */
export function resolveActionLabels(actions: PopupActions | undefined, lang?: string | null): ResolvedActionLabels {
  const labels = getLabels(lang);
  const pick = (value: string | undefined, fallback: string): string => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed ? value as string : fallback;
  };
  return {
    accept: pick(actions?.accept?.label, labels.accept),
    decline: pick(actions?.decline?.label, labels.decline),
    start: pick(actions?.start?.label, labels.start),
    complete: pick(actions?.complete?.label, labels.complete),
    back: pick(actions?.back?.label, labels.back),
  };
}

/**
 * Fuente JavaScript del resolutor de locale, para incrustar en el HTML del WebView (React
 * Native): allí el idioma del survey solo se conoce ya dentro del WebView, así que la
 * normalización tiene que viajar con el HTML. Es un espejo literal de `resolveLocale`, y
 * `labels.test.ts` compara las dos implementaciones contra la misma batería de tags para que
 * no se separen en silencio.
 */
export const RESOLVE_LOCALE_JS = `function ddResolveLocale(lang){
  if(typeof lang!=='string') return 'en';
  var n=lang.trim().toLowerCase().replace(/_/g,'-');
  if(!n) return 'en';
  if(n==='zh'||n.indexOf('zh-')===0) return 'zh-CN';
  var p=n.split('-')[0];
  if(p==='en') return 'en';
  if(p==='es') return 'es';
  if(p==='da') return 'da';
  if(p==='no'||p==='nb'||p==='nn') return 'no';
  if(p==='sv') return 'sv';
  if(p==='fi') return 'fi';
  if(p==='de') return 'de';
  if(p==='fr') return 'fr';
  if(p==='pt') return 'pt';
  if(p==='ar') return 'ar';
  if(p==='bn') return 'bn';
  return 'en';
}`;
