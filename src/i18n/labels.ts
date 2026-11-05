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
  | 'en' | 'es' | 'da' | 'no' | 'sv' | 'fi' | 'de' | 'fr' | 'pt' | 'ar' | 'bn' | 'zh-CN'
  // El resto de idiomas oficiales de la UE (DD-67).
  | 'bg' | 'cs' | 'el' | 'et' | 'ga' | 'hr' | 'hu' | 'it' | 'lt' | 'lv' | 'mt' | 'nl' | 'pl' | 'ro' | 'sk' | 'sl';

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
  /** Aviso al intentar avanzar con un email que no es una dirección válida (`INVALID_EMAIL`). */
  errorInvalidEmail: string;
  /** Aviso cuando el envío falla. */
  errorSubmit: string;
  /** Aviso cuando el survey no ha podido cargar (el popup solo ofrece cerrarlo). */
  errorLoad: string;
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
  errorInvalidEmail: 'Please enter a valid email address.',
  errorSubmit: 'An error occurred while submitting. Please try again or close the popup.',
  errorLoad: "We couldn't load this survey.",
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
  errorInvalidEmail: 'Introduce una dirección de correo electrónico válida.',
  errorSubmit: 'Se produjo un error al enviar. Inténtalo de nuevo o cierra la ventana.',
  errorLoad: 'No se ha podido cargar la encuesta.',
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
  errorInvalidEmail: 'Indtast venligst en gyldig e-mailadresse.',
  errorSubmit: 'Der opstod en fejl under afsendelsen. Prøv igen, eller luk pop op-vinduet.',
  errorLoad: 'Undersøgelsen kunne ikke indlæses.',
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
  errorInvalidEmail: 'Skriv inn en gyldig e-postadresse.',
  errorSubmit: 'Det oppstod en feil under innsendingen. Prøv igjen, eller lukk popupen.',
  errorLoad: 'Undersøkelsen kunne ikke lastes inn.',
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
  errorInvalidEmail: 'Ange en giltig e-postadress.',
  errorSubmit: 'Ett fel uppstod vid inskickningen. Försök igen eller stäng popupen.',
  errorLoad: 'Enkäten kunde inte laddas.',
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
  errorInvalidEmail: 'Anna kelvollinen sähköpostiosoite.',
  errorSubmit: 'Lähetyksessä tapahtui virhe. Yritä uudelleen tai sulje ponnahdusikkuna.',
  errorLoad: 'Kyselyä ei voitu ladata.',
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
  errorInvalidEmail: 'Bitte gib eine gültige E-Mail-Adresse ein.',
  errorSubmit: 'Beim Senden ist ein Fehler aufgetreten. Versuche es erneut oder schließe das Popup.',
  errorLoad: 'Die Umfrage konnte nicht geladen werden.',
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
  errorInvalidEmail: 'Veuillez saisir une adresse e-mail valide.',
  errorSubmit: "Une erreur s'est produite lors de l'envoi. Réessayez ou fermez la fenêtre.",
  errorLoad: "Impossible de charger l'enquête.",
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
  errorInvalidEmail: 'Insira um endereço de e-mail válido.',
  errorSubmit: 'Ocorreu um erro ao enviar. Tente novamente ou feche a janela.',
  errorLoad: 'Não foi possível carregar o inquérito.',
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
  errorInvalidEmail: 'يرجى إدخال عنوان بريد إلكتروني صالح.',
  errorSubmit: 'حدث خطأ أثناء الإرسال. يرجى المحاولة مرة أخرى أو إغلاق النافذة.',
  errorLoad: 'تعذّر تحميل الاستبيان.',
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
  errorInvalidEmail: 'একটি বৈধ ইমেল ঠিকানা লিখুন।',
  errorSubmit: 'জমা দেওয়ার সময় একটি ত্রুটি ঘটেছে। আবার চেষ্টা করুন বা পপআপ বন্ধ করুন।',
  errorLoad: 'সমীক্ষাটি লোড করা যায়নি।',
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
  errorInvalidEmail: '请输入有效的电子邮件地址。',
  errorSubmit: '提交时出错。请重试或关闭弹窗。',
  errorLoad: '无法加载问卷。',
};

const BG: PopupLabels = {
  accept: 'Изпращане',
  decline: 'Отказ',
  start: 'Започване на анкетата',
  complete: 'Завършване на анкетата',
  back: 'Назад',
  question: 'Въпрос',
  of: 'от',
  followUp: 'Допълнителен въпрос',
  closeAria: 'Затваряне на изскачащия прозорец',
  loadingAria: 'Анкетата се зарежда',
  errorRequired: 'Моля, отговорете на задължителния въпрос, за да продължите.',
  errorInvalidEmail: 'Моля, въведете валиден имейл адрес.',
  errorSubmit: 'Възникна грешка при изпращането. Моля, опитайте отново или затворете прозореца.',
  errorLoad: 'Не успяхме да заредим тази анкета.',
};

const CS: PopupLabels = {
  accept: 'Odeslat',
  decline: 'Zrušit',
  start: 'Zahájit průzkum',
  complete: 'Dokončit průzkum',
  back: 'Zpět',
  question: 'Otázka',
  of: 'z',
  followUp: 'Doplňující otázka',
  closeAria: 'Zavřít vyskakovací okno',
  loadingAria: 'Načítání průzkumu',
  errorRequired: 'Před pokračováním prosím odpovězte na povinnou otázku.',
  errorInvalidEmail: 'Zadejte prosím platnou e-mailovou adresu.',
  errorSubmit: 'Při odesílání došlo k chybě. Zkuste to prosím znovu nebo okno zavřete.',
  errorLoad: 'Tento průzkum se nepodařilo načíst.',
};

const EL: PopupLabels = {
  accept: 'Αποστολή',
  decline: 'Ακύρωση',
  start: 'Έναρξη έρευνας',
  complete: 'Ολοκλήρωση έρευνας',
  back: 'Πίσω',
  question: 'Ερώτηση',
  of: 'από',
  followUp: 'Συμπληρωματική ερώτηση',
  closeAria: 'Κλείσιμο αναδυόμενου παραθύρου',
  loadingAria: 'Φόρτωση έρευνας',
  errorRequired: 'Απαντήστε στην υποχρεωτική ερώτηση για να συνεχίσετε.',
  errorInvalidEmail: 'Εισαγάγετε μια έγκυρη διεύθυνση email.',
  errorSubmit: 'Παρουσιάστηκε σφάλμα κατά την αποστολή. Δοκιμάστε ξανά ή κλείστε το παράθυρο.',
  errorLoad: 'Δεν ήταν δυνατή η φόρτωση αυτής της έρευνας.',
};

const ET: PopupLabels = {
  accept: 'Saada',
  decline: 'Tühista',
  start: 'Alusta küsitlust',
  complete: 'Lõpeta küsitlus',
  back: 'Tagasi',
  question: 'Küsimus',
  of: '/',
  followUp: 'Täpsustav küsimus',
  closeAria: 'Sulge hüpikaken',
  loadingAria: 'Küsitluse laadimine',
  errorRequired: 'Jätkamiseks vasta palun kohustuslikule küsimusele.',
  errorInvalidEmail: 'Palun sisesta kehtiv e-posti aadress.',
  errorSubmit: 'Saatmisel tekkis viga. Proovi uuesti või sulge hüpikaken.',
  errorLoad: 'Seda küsitlust ei õnnestunud laadida.',
};

const GA: PopupLabels = {
  accept: 'Seol',
  decline: 'Cealaigh',
  start: 'Tosaigh an suirbhé',
  complete: 'Críochnaigh an suirbhé',
  back: 'Siar',
  question: 'Ceist',
  of: 'as',
  followUp: 'Ceist leantach',
  closeAria: 'Dún an phreabfhuinneog',
  loadingAria: 'Suirbhé á lódáil',
  errorRequired: 'Freagair an cheist éigeantach chun leanúint ar aghaidh, le do thoil.',
  errorInvalidEmail: 'Cuir isteach seoladh ríomhphoist bailí, le do thoil.',
  errorSubmit: 'Tharla earráid agus é á sheoladh. Triail arís nó dún an phreabfhuinneog.',
  errorLoad: 'Níorbh fhéidir linn an suirbhé seo a lódáil.',
};

const HR: PopupLabels = {
  accept: 'Pošalji',
  decline: 'Odustani',
  start: 'Započni anketu',
  complete: 'Završi anketu',
  back: 'Natrag',
  question: 'Pitanje',
  of: 'od',
  followUp: 'Dodatno pitanje',
  closeAria: 'Zatvori skočni prozor',
  loadingAria: 'Učitavanje ankete',
  errorRequired: 'Molimo odgovorite na obavezno pitanje kako biste nastavili.',
  errorInvalidEmail: 'Unesite valjanu e-adresu.',
  errorSubmit: 'Došlo je do pogreške pri slanju. Pokušajte ponovno ili zatvorite prozor.',
  errorLoad: 'Nismo uspjeli učitati ovu anketu.',
};

const HU: PopupLabels = {
  accept: 'Küldés',
  decline: 'Mégse',
  start: 'Kérdőív indítása',
  complete: 'Kérdőív befejezése',
  back: 'Vissza',
  question: 'Kérdés',
  of: '/',
  followUp: 'Kiegészítő kérdés',
  closeAria: 'Felugró ablak bezárása',
  loadingAria: 'Kérdőív betöltése',
  errorRequired: 'Kérjük, válaszoljon a kötelező kérdésre a továbblépéshez.',
  errorInvalidEmail: 'Kérjük, adjon meg érvényes e-mail-címet.',
  errorSubmit: 'Hiba történt a küldés során. Próbálja újra, vagy zárja be az ablakot.',
  errorLoad: 'Nem sikerült betölteni ezt a kérdőívet.',
};

const IT: PopupLabels = {
  accept: 'Invia',
  decline: 'Annulla',
  start: 'Inizia il sondaggio',
  complete: 'Completa il sondaggio',
  back: 'Indietro',
  question: 'Domanda',
  of: 'di',
  followUp: 'Approfondimento',
  closeAria: 'Chiudi popup',
  loadingAria: 'Caricamento del sondaggio',
  errorRequired: 'Rispondi alla domanda obbligatoria per continuare.',
  errorInvalidEmail: 'Inserisci un indirizzo email valido.',
  errorSubmit: 'Si è verificato un errore durante l\'invio. Riprova o chiudi il popup.',
  errorLoad: 'Non è stato possibile caricare questo sondaggio.',
};

const LT: PopupLabels = {
  accept: 'Siųsti',
  decline: 'Atšaukti',
  start: 'Pradėti apklausą',
  complete: 'Baigti apklausą',
  back: 'Atgal',
  question: 'Klausimas',
  of: 'iš',
  followUp: 'Papildomas klausimas',
  closeAria: 'Uždaryti iššokantį langą',
  loadingAria: 'Įkeliama apklausa',
  errorRequired: 'Norėdami tęsti, atsakykite į privalomą klausimą.',
  errorInvalidEmail: 'Įveskite galiojantį el. pašto adresą.',
  errorSubmit: 'Siunčiant įvyko klaida. Bandykite dar kartą arba uždarykite langą.',
  errorLoad: 'Nepavyko įkelti šios apklausos.',
};

const LV: PopupLabels = {
  accept: 'Nosūtīt',
  decline: 'Atcelt',
  start: 'Sākt aptauju',
  complete: 'Pabeigt aptauju',
  back: 'Atpakaļ',
  question: 'Jautājums',
  of: 'no',
  followUp: 'Papildjautājums',
  closeAria: 'Aizvērt uznirstošo logu',
  loadingAria: 'Notiek aptaujas ielāde',
  errorRequired: 'Lūdzu, atbildiet uz obligāto jautājumu, lai turpinātu.',
  errorInvalidEmail: 'Lūdzu, ievadiet derīgu e-pasta adresi.',
  errorSubmit: 'Nosūtot radās kļūda. Lūdzu, mēģiniet vēlreiz vai aizveriet logu.',
  errorLoad: 'Neizdevās ielādēt šo aptauju.',
};

const MT: PopupLabels = {
  accept: 'Ibgħat',
  decline: 'Ikkanċella',
  start: 'Ibda l-istħarriġ',
  complete: 'Lesti l-istħarriġ',
  back: 'Lura',
  question: 'Mistoqsija',
  of: 'minn',
  followUp: 'Mistoqsija ta\' segwitu',
  closeAria: 'Agħlaq il-popup',
  loadingAria: 'Qed jitgħabba l-istħarriġ',
  errorRequired: 'Jekk jogħġbok wieġeb il-mistoqsija obbligatorja biex tkompli.',
  errorInvalidEmail: 'Jekk jogħġbok daħħal indirizz tal-email validu.',
  errorSubmit: 'Seħħ żball waqt il-bgħit. Erġa\' pprova jew agħlaq il-popup.',
  errorLoad: 'Ma stajniex intellgħu dan l-istħarriġ.',
};

const NL: PopupLabels = {
  accept: 'Verzenden',
  decline: 'Annuleren',
  start: 'Enquête starten',
  complete: 'Enquête afronden',
  back: 'Terug',
  question: 'Vraag',
  of: 'van',
  followUp: 'Vervolgvraag',
  closeAria: 'Pop-up sluiten',
  loadingAria: 'Enquête wordt geladen',
  errorRequired: 'Beantwoord de verplichte vraag om verder te gaan.',
  errorInvalidEmail: 'Voer een geldig e-mailadres in.',
  errorSubmit: 'Er is iets misgegaan bij het verzenden. Probeer het opnieuw of sluit de pop-up.',
  errorLoad: 'We konden deze enquête niet laden.',
};

const PL: PopupLabels = {
  accept: 'Wyślij',
  decline: 'Anuluj',
  start: 'Rozpocznij ankietę',
  complete: 'Zakończ ankietę',
  back: 'Wstecz',
  question: 'Pytanie',
  of: 'z',
  followUp: 'Pytanie uzupełniające',
  closeAria: 'Zamknij okno',
  loadingAria: 'Ładowanie ankiety',
  errorRequired: 'Odpowiedz na wymagane pytanie, aby przejść dalej.',
  errorInvalidEmail: 'Wpisz prawidłowy adres e-mail.',
  errorSubmit: 'Podczas wysyłania wystąpił błąd. Spróbuj ponownie lub zamknij okno.',
  errorLoad: 'Nie udało się wczytać tej ankiety.',
};

const RO: PopupLabels = {
  accept: 'Trimiteți',
  decline: 'Anulați',
  start: 'Începeți sondajul',
  complete: 'Finalizați sondajul',
  back: 'Înapoi',
  question: 'Întrebarea',
  of: 'din',
  followUp: 'Întrebare suplimentară',
  closeAria: 'Închideți fereastra pop-up',
  loadingAria: 'Se încarcă sondajul',
  errorRequired: 'Vă rugăm să răspundeți la întrebarea obligatorie pentru a continua.',
  errorInvalidEmail: 'Vă rugăm să introduceți o adresă de e-mail validă.',
  errorSubmit: 'A apărut o eroare la trimitere. Încercați din nou sau închideți fereastra.',
  errorLoad: 'Nu am putut încărca acest sondaj.',
};

const SK: PopupLabels = {
  accept: 'Odoslať',
  decline: 'Zrušiť',
  start: 'Začať prieskum',
  complete: 'Dokončiť prieskum',
  back: 'Späť',
  question: 'Otázka',
  of: 'z',
  followUp: 'Doplňujúca otázka',
  closeAria: 'Zavrieť vyskakovacie okno',
  loadingAria: 'Načítava sa prieskum',
  errorRequired: 'Ak chcete pokračovať, odpovedzte, prosím, na povinnú otázku.',
  errorInvalidEmail: 'Zadajte, prosím, platnú e-mailovú adresu.',
  errorSubmit: 'Pri odosielaní sa vyskytla chyba. Skúste to znova alebo okno zatvorte.',
  errorLoad: 'Tento prieskum sa nepodarilo načítať.',
};

const SL: PopupLabels = {
  accept: 'Pošlji',
  decline: 'Prekliči',
  start: 'Začni anketo',
  complete: 'Zaključi anketo',
  back: 'Nazaj',
  question: 'Vprašanje',
  of: 'od',
  followUp: 'Dodatno vprašanje',
  closeAria: 'Zapri pojavno okno',
  loadingAria: 'Nalaganje ankete',
  errorRequired: 'Za nadaljevanje odgovorite na obvezno vprašanje.',
  errorInvalidEmail: 'Vnesite veljaven e-poštni naslov.',
  errorSubmit: 'Pri pošiljanju je prišlo do napake. Poskusite znova ali zaprite okno.',
  errorLoad: 'Ankete ni bilo mogoče naložiti.',
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
  bg: BG,
  cs: CS,
  el: EL,
  et: ET,
  ga: GA,
  hr: HR,
  hu: HU,
  it: IT,
  lt: LT,
  lv: LV,
  mt: MT,
  nl: NL,
  pl: PL,
  ro: RO,
  sk: SK,
  sl: SL,
};

/** Locales con traducción propia del SDK. */
export const SUPPORTED_LANGUAGES: PopupLocale[] = [
  // Los 11 idiomas que la plataforma ofrece para un survey, más zh-CN (que el SDK nativo ya
  // traía). Si la plataforma añade uno nuevo, hay que añadirlo aquí o el chrome saldrá en
  // inglés bajo un survey traducido.
  'en', 'es', 'da', 'no', 'sv', 'fi', 'de', 'fr', 'pt', 'ar', 'bn', 'zh-CN',
  // El resto de idiomas oficiales de la UE (DD-67), traducidos a máquina: pendientes de
  // revisión nativa.
  'bg', 'cs', 'el', 'et', 'ga', 'hr', 'hu', 'it', 'lt', 'lv', 'mt', 'nl', 'pl', 'ro', 'sk', 'sl',
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
    case 'bg': return 'bg';
    case 'cs': return 'cs';
    case 'el': return 'el';
    case 'et': return 'et';
    case 'ga': return 'ga';
    case 'hr': return 'hr';
    case 'hu': return 'hu';
    case 'it': return 'it';
    case 'lt': return 'lt';
    case 'lv': return 'lv';
    case 'mt': return 'mt';
    case 'nl': return 'nl';
    case 'pl': return 'pl';
    case 'ro': return 'ro';
    case 'sk': return 'sk';
    case 'sl': return 'sl';
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
  if(p==='bg') return 'bg';
  if(p==='cs') return 'cs';
  if(p==='el') return 'el';
  if(p==='et') return 'et';
  if(p==='ga') return 'ga';
  if(p==='hr') return 'hr';
  if(p==='hu') return 'hu';
  if(p==='it') return 'it';
  if(p==='lt') return 'lt';
  if(p==='lv') return 'lv';
  if(p==='mt') return 'mt';
  if(p==='nl') return 'nl';
  if(p==='pl') return 'pl';
  if(p==='ro') return 'ro';
  if(p==='sk') return 'sk';
  if(p==='sl') return 'sl';
  return 'en';
}`;
