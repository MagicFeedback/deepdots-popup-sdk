import type { IdentityAnswer } from '../tracking/tracking-manager';
import { buildFontFaceCss, buildFontFamilyValue } from './font';
import type { PopupActions, PopupFont } from '../types';
import magicfeedbackCss from '../assets/style.css';

/**
 * Construye un HTML autocontenido que renderiza el popup (chrome + survey de
 * `@magicfeedback/native`) dentro de un WebView (React Native). Es el equivalente RN de
 * `renderPopup.ts` (DOM real, solo navegador): mismo header con botón cerrar, spinner,
 * footer con back/start/send, gate "Start survey" y colores/logo desde `formData.style`.
 * Carga el bundle del survey desde CDN, crea el form con la identidad inyectada
 * (`profile`/`metadata`) y reenvía los eventos al host vía el puente de
 * react-native-webview: `window.ReactNativeWebView.postMessage`.
 *
 * Mensajes emitidos (JSON `{name, payload}`): `loaded`, `before_submit`, `after_submit`,
 * `survey_completed`, `back`, `popup_close`.
 */
export interface BuildSurveyHtmlOptions {
  surveyId: string;
  productId: string;
  env?: string; // 'production' | 'development'
  profile?: IdentityAnswer[];
  metadata?: IdentityAnswer[];
  version?: string; // versión de @magicfeedback/native
  font?: PopupFont; // fuente personalizada (family + url opcional)
  theme?: 'light' | 'dark';
  position?: 'bottom' | 'bottom-right' | 'bottom-left' | 'top' | 'top-right' | 'top-left' | 'center';
  actions?: PopupActions;
  /**
   * Renderiza el "modal" del popup (tarjeta con fondo/sombra/bordes + overlay + posicionamiento).
   * Default `true`. Con `false` el HTML es transparente y llena el contenedor: el host monta su
   * propio Modal/tarjeta y controla el estilo. El survey sigue siendo funcional (bridge, form,
   * botones y botón de cerrar). Pensado para React Native cuando el host gestiona el contenedor.
   */
  chrome?: boolean;
  /**
   * Título de la cabecera, a la izquierda del botón de cerrar. Es el `title` de la definición
   * del popup (`GET /sdk/{publicKey}/popups`), así que cambia de un popup a otro. Vacío es un
   * valor legítimo: la cabecera se queda solo con la X. NO cae al título del survey.
   */
  title?: string;
  /**
   * Barra de progreso ("Question X of Y" + barra) bajo la cabecera. `undefined` respeta el
   * `showProgressBar` que configure la plataforma en el estilo del survey; `true`/`false` lo
   * fuerzan desde el host. Solo se pinta con más de una página y fuera de la pantalla de inicio.
   */
  showProgressBar?: boolean;
  /**
   * CSS del host, inyectado como último bloque de estilos: gana en cascada sobre el del SDK
   * y sobre el de `@magicfeedback/native` sin tener que tocar ninguno de los dos. Es la vía
   * para reestilar el área de preguntas (enunciados, opciones, escalas) por integración.
   */
  surveyCss?: string;
}

interface PositionRule {
  justifyContent: string;
  alignItems: string;
  padding: string;
  background: string;
}

const POSITION_MAP: Record<string, PositionRule> = {
  center: { justifyContent: 'center', alignItems: 'center', padding: '0', background: 'rgba(0,0,0,0.5)' },
  bottom: { justifyContent: 'center', alignItems: 'flex-end', padding: '16px', background: 'transparent' },
  'bottom-right': { justifyContent: 'flex-end', alignItems: 'flex-end', padding: '16px', background: 'transparent' },
  'bottom-left': { justifyContent: 'flex-start', alignItems: 'flex-end', padding: '16px', background: 'transparent' },
  top: { justifyContent: 'center', alignItems: 'flex-start', padding: '16px', background: 'transparent' },
  'top-right': { justifyContent: 'flex-end', alignItems: 'flex-start', padding: '16px', background: 'transparent' },
  'top-left': { justifyContent: 'flex-start', alignItems: 'flex-start', padding: '16px', background: 'transparent' },
};

/**
 * Serializa un valor para incrustarlo dentro de un `<script>`. `JSON.stringify` no escapa `<`,
 * así que un `</script>` dentro de un texto de la API (título, etiqueta de botón, metadata)
 * cerraría el bloque y el resto se interpretaría como HTML. Escapa también los separadores de
 * línea U+2028/U+2029, que son JSON válido pero rompen un literal de JavaScript.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003C')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildSurveyHtml(opts: BuildSurveyHtmlOptions): string {
  const env = opts.env === 'development' ? 'dev' : 'prod';
  const version = opts.version ?? '2.2.4';
  const cdn = `https://cdn.jsdelivr.net/npm/@magicfeedback/native@${version}/dist/magicfeedback-sdk.browser.js`;
  const sid = jsonForScript(opts.surveyId);
  const pid = jsonForScript(opts.productId);
  const profileJson = jsonForScript(opts.profile ?? []);
  const metaJson = jsonForScript(opts.metadata ?? []);
  const fontFaceCss = opts.font ? buildFontFaceCss(opts.font.family, opts.font.url) : '';
  const fontFamilyValue = opts.font ? buildFontFamilyValue(opts.font.family) : '-apple-system,system-ui,sans-serif';
  const popupClass = opts.font?.family ? 'deepdots-popup deepdots-has-font' : 'deepdots-popup';

  const isDark = opts.theme === 'dark';
  const popupBg = isDark ? '#1e1e1e' : '#fff';
  const colorScheme = isDark ? 'dark' : 'light';
  const textPrimary = isDark ? '#f0f0f0' : '#111';
  const textMuted = isDark ? '#9ca3af' : '#6b7280';
  const trackBg = isDark ? '#3f3f46' : '#e5e7eb';
  const pos = POSITION_MAP[opts.position ?? 'center'] ?? POSITION_MAP.center;

  // chrome:false → el host envuelve el survey en su propio Modal/tarjeta. El HTML se vuelve
  // transparente y llena el contenedor (sin fondo/sombra/borde/overlay/posicionamiento propios);
  // así se evita el "doble modal" cuando el host ya monta el suyo. Survey funcional intacto.
  const chrome = opts.chrome !== false;
  const bodyBg = chrome ? pos.background : 'transparent';
  const bodyPadding = chrome ? pos.padding : '0';
  const bodyDisplay = chrome ? 'flex' : 'block';
  const cardBg = chrome ? popupBg : 'transparent';
  const cardShadow = chrome ? '0 4px 6px rgba(0,0,0,0.1)' : 'none';
  const cardRadius = chrome ? '8px' : '0';
  const cardMaxWidth = chrome ? '600px' : 'none';
  const cardWidth = chrome ? '90%' : '100%';
  const cardMinHeight = chrome ? '200px' : '0';
  // Con chrome el alto lo marca el contenido (hasta 90vh); sin chrome llena el contenedor del
  // host. En ambos casos hace falta un alto acotado para que el footer pueda quedar fijo abajo.
  const cardHeight = chrome ? 'auto' : '100%';
  const cardMaxHeight = chrome ? '90vh' : '100%';
  // En móvil la tarjeta se estrecha y se separa de los bordes de la ventana... salvo con
  // chrome:false, donde el contenedor es del host: ahí llena el ancho y NO añade los insets
  // de safe-area (el host ya los aplica; sumarlos otra vez dejaba un hueco muerto bajo el footer).
  const mobileCard = chrome
    ? `.deepdots-popup{width:calc(100% - 24px);max-width:calc(100% - 24px);border-radius:12px;padding:calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom)) 16px}`
    : `.deepdots-popup{width:100%;max-width:100%;border-radius:0;padding:16px}`;

  // El título viaja como literal JSON y se aplica con textContent: viene de la API y no debe
  // interpolarse en el HTML (mismo criterio anti-inyección que `font.family`).
  const titleJson = jsonForScript(opts.title ?? '');
  // CSS del host: va el último para ganar en cascada. Se corta en `</style>` porque el bloque
  // se cierra ahí y todo lo que siguiera pasaría a interpretarse como HTML.
  const customCss = (opts.surveyCss ?? '').replace(/<\/\s*style/gi, '<\\/style');
  // `null` = decide la plataforma (style.showProgressBar); true/false = lo fuerza el host.
  const progressPref = opts.showProgressBar === undefined ? 'null' : String(opts.showProgressBar);

  const backLabel = jsonForScript(opts.actions?.back?.label ?? 'Back');
  const startLabel = jsonForScript(opts.actions?.start?.label ?? 'Start survey');
  const completeLabel = jsonForScript(opts.actions?.complete?.label ?? 'Complete survey');
  const submitLabel = jsonForScript(opts.actions?.accept?.label ?? 'Send');

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="color-scheme" content="${colorScheme}"/>
<style>
${magicfeedbackCss}
${fontFaceCss}
html,body{margin:0;padding:0;height:100%;font-family:${fontFamilyValue}}
body{display:${bodyDisplay};justify-content:${pos.justifyContent};align-items:${pos.alignItems};background:${bodyBg};padding:${bodyPadding};box-sizing:border-box}
.deepdots-popup{position:relative;display:flex;flex-direction:column;justify-content:flex-start;background:${cardBg};color-scheme:${colorScheme};border-radius:${cardRadius};padding:24px;box-shadow:${cardShadow};max-width:${cardMaxWidth};width:${cardWidth};min-height:${cardMinHeight};height:${cardHeight};max-height:${cardMaxHeight};box-sizing:border-box}
.deepdots-popup-header{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;flex:0 0 auto}
/* Neutraliza la regla \`.deepdots-popup h2\` del CSS del survey (uppercase, centrado y
   margin-bottom 40px), pensada para los enunciados y no para el título de la cabecera. */
#dd-title{margin:0;font-family:var(--deepdots-font,'Montserrat',inherit);font-size:17px;font-weight:600;line-height:1.3;color:${textPrimary};text-transform:none;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#dd-close{background:transparent;border:none;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:8px;cursor:pointer;color:${textPrimary};padding:4px;flex:0 0 auto;margin-left:auto}
/* Progreso alineado con la cabecera: sin padding horizontal propio, lo marca la tarjeta.
   El vertical es el mismo arriba y abajo, y del mismo valor que el padding de la tarjeta. */
.deepdots-progress{display:none;flex-direction:column;gap:8px;width:100%;flex:0 0 auto;padding:16px 0;box-sizing:border-box}
.deepdots-progress-head{display:flex;flex-direction:row;justify-content:space-between;align-items:center;width:100%;gap:8px}
#dd-progress-label{font-size:13px;line-height:1.2}
/* "Question 1" en negrita y "of 3" en regular gris, como el mockup. */
#dd-progress-current{font-weight:700;color:${textPrimary}}
#dd-progress-total{font-weight:400;color:${textMuted}}
#dd-progress-followup{display:none;font-size:12px;font-weight:600;color:#fff;background:rgba(59,130,246,0.44);border-radius:999px;padding:2px 10px}
.deepdots-progress-track{width:100%;height:4px;border-radius:999px;background:${trackBg};overflow:hidden}
#dd-progress-bar{height:100%;width:0%;background:#22C55E;border-radius:999px;transition:width 450ms ease}
/* El popup es una columna: solo el bloque de preguntas hace scroll, para que el footer
   con las acciones quede siempre visible en el borde inferior (antes vivía dentro del
   área scrollable y había que bajar hasta el final para ver "Send"). */
/* Sin sangrado extra: el contenido se alinea con el título y con la barra de progreso (antes
   sumaba 20px a los lados sobre el padding de la tarjeta y quedaba más adentro que la cabecera). */
/* Sin barra de progreso, este padding-top es el que separa la cabecera de la pregunta. Con
   barra, el JS lo pone a 0 y el hueco lo aporta el padding inferior del bloque de progreso,
   de modo que el espacio por arriba y por abajo de la barra es idéntico. */
.deepdots-popup-container-content{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;padding:16px 0 0 0;overflow:hidden;box-sizing:border-box}
/* El enunciado trae margin-top:20px del CSS de surveys, que sumaba al hueco de la barra y
   descompensaba la simetría. Solo se anula en el primero: entre preguntas sigue separando. */
.deepdots-popup .magicfeedback-questions .magicfeedback-div:first-child .magicfeedback-label{margin-top:0}
.deepdots-popup-main{display:flex;flex-direction:column;width:100%;flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;position:relative}
#dd-form-wrapper{width:100%;flex:1 1 auto}
#mf{width:100%;box-sizing:border-box;visibility:hidden}
.deepdots-popup-main *{max-width:100%;box-sizing:border-box}
#dd-logo{max-height:40px;max-width:100%;object-fit:contain;display:block;margin:12px 0 0 0}
.deepdots-error-hint{display:none;margin:12px 0 0 0;padding:10px 12px;border-radius:6px;background:#FEF3C7;color:#92400E;border:1px solid #FCD34D;font-size:13px}
/* Pantalla final: el HTML del editor de la plataforma (imagen + texto), centrado. */
.deepdots-success{display:none;width:100%;text-align:center;padding:24px 0;color:${textPrimary}}
.deepdots-success img{max-width:100%;height:auto;margin:0 auto 16px auto;display:block}
.deepdots-success p{margin:0;font-size:16px;font-weight:600;line-height:1.4}
.deepdots-popup-footer{display:flex;flex-direction:row-reverse;justify-content:space-between;align-items:center;gap:4px;margin-top:auto;width:100%;padding-top:12px}
.dd-nav-btn{display:none;border:none;min-height:44px;padding:12px 24px;border-radius:6px;cursor:pointer;font-size:15px;font-weight:600;align-items:center;justify-content:center;text-align:center}
/* Secundario como botón de texto: sin borde ni fondo, para que el primario sea la única CTA. */
#dd-back{background:transparent;color:${textMuted};border:none}
#dd-start,#dd-complete,#dd-submit{background:#1E293B;color:#fff;border:none}
#dd-submit:disabled,#dd-start:disabled,#dd-back:disabled,#dd-complete:disabled{opacity:0.6;cursor:not-allowed}
.mf-spinner{display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
.mf-spinner-circle{width:28px;height:28px;border:3px solid #e0e6ed;border-top-color:#1E293B;border-radius:50%;animation:ddspin 0.9s linear infinite}
@keyframes ddspin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
@media (max-width:640px){
  ${mobileCard}
  /* Apilados: la acción principal (Send/Start/Complete) arriba y Back debajo. El orden del
     DOM ya es ese, así que \`column\` (no \`column-reverse\`) es lo que lo respeta. */
  .deepdots-popup-footer{flex-direction:column;gap:4px}
  .dd-nav-btn{width:100%}
  .magicfeedback-checkbox-container,.magicfeedback-radio-container{margin:4px 0;padding:4px 8px}
  .magicfeedback-checkbox label,.magicfeedback-radio-container label{font-size:15px}
  .deepdots-popup input[type="radio"]{margin:6px 0 6px 8px}
  .deepdots-popup input[type="checkbox"]{width:16px;height:16px}
}
${customCss}
</style>
</head><body>
<div class="${popupClass}" id="dd-popup">
  <div class="deepdots-popup-header">
    <h2 id="dd-title" class="deepdots-popup-title" hidden></h2>
    <button type="button" id="dd-close" aria-label="Close popup">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>
  <div class="deepdots-progress" id="dd-progress">
    <div class="deepdots-progress-head">
      <span id="dd-progress-label"><span id="dd-progress-current"></span><span id="dd-progress-total"></span></span>
      <span id="dd-progress-followup">Follow-up</span>
    </div>
    <div class="deepdots-progress-track"><div id="dd-progress-bar"></div></div>
  </div>
  <div class="deepdots-popup-container-content" id="dd-content">
    <div class="deepdots-popup-main" id="dd-main">
      <div id="dd-form-wrapper">
        <div class="mf-spinner" id="dd-spinner" role="status" aria-label="Loading survey"><div class="mf-spinner-circle"></div></div>
        <div id="mf"></div>
      </div>
      <div class="deepdots-error-hint" id="dd-error" role="alert" aria-live="polite"></div>
    </div>
    <div class="deepdots-popup-footer" id="dd-footer">
      <button type="button" class="dd-nav-btn" id="dd-submit">Send</button>
      <button type="button" class="dd-nav-btn" id="dd-back">Back</button>
      <button type="button" class="dd-nav-btn" id="dd-complete">Complete survey</button>
      <button type="button" class="dd-nav-btn" id="dd-start">Start survey</button>
    </div>
  </div>
</div>
<script>
(function(){
  function emit(s){ try{ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(s); } }catch(e){} }
  function emitJSON(n,p){ try{ emit(JSON.stringify({name:n,payload:p||{}})); }catch(e){} }
  window.DeepdotsClose = function(){ emitJSON('popup_close'); };
  var chromeOn=${chrome ? 'true' : 'false'};

  var popup=document.getElementById('dd-popup');
  var main=document.getElementById('dd-main');
  var content=document.getElementById('dd-content');
  var footer=document.getElementById('dd-footer');
  var spinner=document.getElementById('dd-spinner');
  var formHost=document.getElementById('mf');
  var errorHint=document.getElementById('dd-error');
  var backBtn=document.getElementById('dd-back');
  var startBtn=document.getElementById('dd-start');
  var completeBtn=document.getElementById('dd-complete');
  var submitBtn=document.getElementById('dd-submit');
  var titleEl=document.getElementById('dd-title');
  var progressEl=document.getElementById('dd-progress');
  var progressLabel=document.getElementById('dd-progress-label');
  var progressCurrent=document.getElementById('dd-progress-current');
  var progressTotal=document.getElementById('dd-progress-total');
  var progressFollowUp=document.getElementById('dd-progress-followup');
  var progressBar=document.getElementById('dd-progress-bar');

  function setTitle(t){
    if(!t) return;
    titleEl.textContent=t;
    titleEl.hidden=false;
  }
  setTitle(${titleJson});

  // Estado de la barra de progreso. \`progressPref\` null = manda la plataforma (style).
  var progressPref=${progressPref};
  var progressEnabled=progressPref===true;
  var progressShowUnit=true;
  var progressUnit='fraction';
  var onStartPage=false;

  function updateProgress(p){
    var total=p&&typeof p.total==='number'?p.total:0;
    var progress=p&&typeof p.progress==='number'?p.progress:0;
    // Solo tiene sentido con más de una página, fuera de la pantalla de inicio y sin completar.
    if(!progressEnabled||onStartPage||p&&p.completed||total<=1){
      progressEl.style.display='none';
      // Sin barra, el hueco cabecera→pregunta lo pone el contenido.
      content.style.paddingTop='16px';
      return;
    }
    progressEl.style.display='flex';
    // Con barra, el hueco inferior ya lo pone el bloque de progreso: no duplicarlo.
    content.style.paddingTop='0';
    // Espejo de LineProgressQuestion (MagicSurvey): la barra usa el valor real (las follow-up
    // suman +0.5 y avanzan media casilla) y la etiqueta redondea hacia abajo, porque una
    // follow-up es un paso DENTRO de la misma pregunta, no la siguiente.
    var current=Math.min(total,Math.max(1,progress+1));
    var pct=Math.min(100,Math.max(0,(current/total)*100));
    progressBar.style.width=pct+'%';
    var label=Math.min(total,Math.max(1,Math.floor(progress)+1));
    progressLabel.style.display=progressShowUnit?'block':'none';
    if(progressUnit==='percentage'){
      progressCurrent.textContent=Math.round(pct)+'%';
      progressTotal.textContent='';
    } else {
      progressCurrent.textContent='Question '+label;
      progressTotal.textContent=' of '+total;
    }
    progressFollowUp.style.display=p&&p.followup?'inline-block':'none';
  }

  backBtn.textContent=${backLabel};
  startBtn.textContent=${startLabel};
  completeBtn.textContent=${completeLabel};
  submitBtn.textContent=${submitLabel};

  document.getElementById('dd-close').onclick=function(){ emitJSON('popup_close'); };
  backBtn.onclick=function(){ if(window.DeepdotsForm && window.DeepdotsForm.back){ window.DeepdotsForm.back(); } };
  startBtn.onclick=function(){
    if(window.DeepdotsForm && window.DeepdotsForm.startForm){
      window.DeepdotsForm.startForm();
      onStartPage=false;
      updateProgress({ progress:window.DeepdotsForm.progress, total:window.DeepdotsForm.total, completed:false, followup:false });
    }
  };
  completeBtn.onclick=function(){ emitJSON('popup_close'); };
  var surveyCompletedEmitted=false;
  submitBtn.onclick=function(){
    if(surveyCompletedEmitted) return;
    if(window.DeepdotsForm && window.DeepdotsForm.send){ window.DeepdotsForm.send(); }
  };

  // Mensaje final configurado en la plataforma (\`style.successMessage\`). Se guarda al cargar
  // y se pinta al completar. Va por innerHTML porque es HTML del editor de la plataforma
  // (imagen + texto), igual que ya hace \`renderStartMessage\` con el mensaje de inicio.
  var successMessageHtml='';
  function showSuccessScreen(){
    progressEl.style.display='none';
    var wrapper=document.getElementById('dd-form-wrapper');
    if(wrapper){ wrapper.style.display='none'; }
    var done=document.getElementById('dd-success');
    if(!done){
      done=document.createElement('div');
      done.id='dd-success';
      done.className='deepdots-success';
      main.insertBefore(done, errorHint);
    }
    done.innerHTML=successMessageHtml || '<p>Thank you for your feedback!</p>';
    done.style.display='block';
  }

  // Profundidad de navegación DENTRO del survey: +1 por página avanzada, -1 al volver.
  // Sustituye a la condición \`total>1 && progress>0 && progress<total\`, que escondía el
  // Back siempre que la siguiente pantalla era una follow-up dinámica: las follow-up no
  // entran en el grafo (suman +0.5 al progress y no tocan el total), así que un survey de
  // una pregunta con follow-up tiene total=1 y nunca cumplía \`total>1\`.
  var pageDepth=0;

  function updateNavButtons(){
    updateButtons(pageDepth>0?'in_progress_next':'in_progress_first');
  }

  function updateButtons(state){
    backBtn.style.display='none';
    startBtn.style.display='none';
    submitBtn.style.display='none';
    completeBtn.style.display='none';
    backBtn.style.width='';
    startBtn.style.width='';
    submitBtn.style.width='';
    completeBtn.style.width='';
    if(state==='start'){
      startBtn.style.display='inline-flex';
      startBtn.style.width='100%';
    } else if(state==='in_progress_first'){
      submitBtn.style.display='inline-flex';
    } else if(state==='in_progress_next'){
      backBtn.style.display='inline-flex';
      submitBtn.style.display='inline-flex';
    } else if(state==='completed'){
      completeBtn.style.display='inline-flex';
      completeBtn.style.width='100%';
    }
  }

  function setLoading(isLoading){
    spinner.style.display=isLoading?'flex':'none';
    if(!isLoading){ formHost.style.visibility='visible'; }
    footer.style.display=isLoading?'none':'flex';
    backBtn.disabled=isLoading; startBtn.disabled=isLoading; completeBtn.disabled=isLoading; submitBtn.disabled=isLoading;
    if(isLoading){ updateButtons(null); }
  }
  setLoading(true);

  var initialized=false;
  function initMF(){
    if(initialized || !window.magicfeedback) return initialized;
    initialized=true;
    try{
      window.magicfeedback.init({ debug:false, env:'${env}' });
      var form = window.magicfeedback.form(${sid}, ${pid}, ${profileJson}, ${metaJson});
      window.DeepdotsForm = form;
      var stylesInjected=false;
      form.generate('mf', {
        addButton:false,
        getMetaData:true,
        // La pantalla final la pinta el popup: renderSuccess de @magicfeedback/native usa
        // textContent, así que el mensaje de la plataforma (HTML con imagen) no se vería, y su
        // fallback es un literal genérico que ignora style.successMessage.
        addSuccessScreen:false,
        onLoadedEvent:function(args){
          var s=args && args.formData ? args.formData.style : null;
          if(s && !stylesInjected){
            stylesInjected=true;
            if(s.successMessage){ successMessageHtml=s.successMessage; }
            // La barra de progreso la decide el host (init) y, si no se pronuncia, la plataforma.
            if(progressPref===null){ progressEnabled=s.showProgressBar===true; }
            if(s.showProgressUnit!==undefined){ progressShowUnit=s.showProgressUnit!==false; }
            if(s.progressUnit){ progressUnit=s.progressUnit; }
            if(s.loadingBarColor){ progressBar.style.background=s.loadingBarColor; progressFollowUp.style.background=s.loadingBarColor; }
            if(chromeOn && s.boxBackgroundColor){ popup.style.background=s.boxBackgroundColor; }
            if(s.contentAlign){ main.style.justifyContent = s.contentAlign==='center' ? 'center' : 'flex-start'; }
            if(s.buttonPrimaryColor){
              submitBtn.style.background=s.buttonPrimaryColor; submitBtn.style.border='none'; submitBtn.style.color='#fff';
              startBtn.style.background=s.buttonPrimaryColor; startBtn.style.border='none'; startBtn.style.color='#fff';
              completeBtn.style.background=s.buttonPrimaryColor; completeBtn.style.border='none'; completeBtn.style.color='#fff';
            }
            if(s.buttonSecondaryColor){
              // Botón de texto: solo tiñe la etiqueta, sin recuperar fondo ni borde.
              backBtn.style.background='transparent'; backBtn.style.color=s.buttonSecondaryColor; backBtn.style.border='none';
            }
            if(s.logo && !document.getElementById('dd-logo')){
              var logoImg=document.createElement('img');
              logoImg.id='dd-logo'; logoImg.src=s.logo; logoImg.alt='Logo';
              if(s.logoSize==='small'){ logoImg.style.maxHeight='30px'; }
              else if(s.logoSize==='medium'){ logoImg.style.maxHeight='50px'; }
              else if(s.logoSize==='large'){ logoImg.style.maxHeight='70px'; }
              if(s.logoPosition==='left'){ logoImg.style.margin='12px 16px 0 0'; logoImg.style.marginLeft='0'; }
              else if(s.logoPosition==='right'){ logoImg.style.margin='12px 0 0 16px'; logoImg.style.marginLeft='auto'; }
              else if(s.logoPosition==='center'){ logoImg.style.margin='12px auto 0 auto'; }
              // Encima de la barra de progreso, como hermano del header (espejo de ui/logo.ts en
              // web). Fuera de #dd-main, así el logo no se va con el scroll del formulario.
              popup.insertBefore(logoImg, progressEl);
            }
            if(s.startMessage && s.startMessage!==''){ onStartPage=true; updateButtons('start'); }
            else { updateButtons('in_progress_first'); }
          } else {
            updateButtons('in_progress_first');
          }
          // El total solo se conoce una vez montado el form; sin él no hay barra que pintar.
          updateProgress({ progress:form.progress, total:form.total, completed:false, followup:false });
          emitJSON('loaded');
          setLoading(false);
        },
        beforeSubmitEvent:function(){
          setLoading(true);
          emitJSON('before_submit');
        },
        afterSubmitEvent:function(p){
          var error=p && p.error ? (typeof p.error==='string' ? p.error : String(p.error)) : '';
          if(error){
            setLoading(false);
            if(error.toLowerCase().indexOf('no response')!==-1){
              // La página no ha cambiado: el estado de navegación se queda como estaba.
              errorHint.textContent='Please answer the required question to continue.';
              errorHint.style.display='block';
              updateNavButtons();
              return;
            }
            errorHint.textContent='An error occurred while submitting. Please try again or close the popup.';
            errorHint.style.display='block';
            return;
          }
          errorHint.style.display='none';
          setLoading(false);
          if(p && p.completed){
            surveyCompletedEmitted=true;
            showSuccessScreen();
            updateButtons('completed');
            updateProgress(p);
            emitJSON('survey_completed', p);
            return;
          }
          pageDepth++;
          updateNavButtons();
          updateProgress(p);
          emitJSON('after_submit', p);
        },
        onBackEvent:function(p){
          // Con error ("No page found") no hubo navegación: la profundidad no se toca.
          if(!(p&&p.error)){ pageDepth=Math.max(0,pageDepth-1); }
          updateNavButtons();
          // onBackEvent no trae \`total\`: se lee del form, que es su dueño.
          updateProgress({ progress:p&&p.progress, total:form.total, completed:false, followup:p&&p.followup });
          emitJSON('back', p);
        }
      }).catch(function(e){ setLoading(false); emit('error:init'); });
    }catch(e){ setLoading(false); emit('error:exception'); }
    return true;
  }
  var s=document.createElement('script'); s.src=${JSON.stringify(cdn)}; s.async=true;
  s.onload=function(){ initMF(); };
  s.onerror=function(){ setLoading(false); emit('error:load'); };
  document.head.appendChild(s);
  var tries=0, t=setInterval(function(){ if(initMF()||++tries>40){ clearInterval(t); } },150);
})();
</script>
</body></html>`;
}
