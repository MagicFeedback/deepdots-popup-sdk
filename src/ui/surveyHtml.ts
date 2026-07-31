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

export function buildSurveyHtml(opts: BuildSurveyHtmlOptions): string {
  const env = opts.env === 'development' ? 'dev' : 'prod';
  const version = opts.version ?? '2.2.4';
  const cdn = `https://cdn.jsdelivr.net/npm/@magicfeedback/native@${version}/dist/magicfeedback-sdk.browser.js`;
  const sid = JSON.stringify(opts.surveyId);
  const pid = JSON.stringify(opts.productId);
  const profileJson = JSON.stringify(opts.profile ?? []);
  const metaJson = JSON.stringify(opts.metadata ?? []);
  const fontFaceCss = opts.font ? buildFontFaceCss(opts.font.family, opts.font.url) : '';
  const fontFamilyValue = opts.font ? buildFontFamilyValue(opts.font.family) : '-apple-system,system-ui,sans-serif';
  const popupClass = opts.font?.family ? 'deepdots-popup deepdots-has-font' : 'deepdots-popup';

  const isDark = opts.theme === 'dark';
  const popupBg = isDark ? '#1e1e1e' : '#fff';
  const colorScheme = isDark ? 'dark' : 'light';
  const textPrimary = isDark ? '#f0f0f0' : '#111';
  const pos = POSITION_MAP[opts.position ?? 'center'] ?? POSITION_MAP.center;

  const backLabel = JSON.stringify(opts.actions?.back?.label ?? 'Back');
  const startLabel = JSON.stringify(opts.actions?.start?.label ?? 'Start survey');
  const completeLabel = JSON.stringify(opts.actions?.complete?.label ?? 'Complete survey');
  const submitLabel = JSON.stringify(opts.actions?.accept?.label ?? 'Send');

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="color-scheme" content="${colorScheme}"/>
<style>
${magicfeedbackCss}
${fontFaceCss}
html,body{margin:0;padding:0;height:100%;font-family:${fontFamilyValue}}
body{display:flex;justify-content:${pos.justifyContent};align-items:${pos.alignItems};background:${pos.background};padding:${pos.padding};box-sizing:border-box}
.deepdots-popup{position:relative;display:flex;flex-direction:column;justify-content:flex-start;background:${popupBg};color-scheme:${colorScheme};border-radius:8px;padding:24px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:600px;width:90%;min-height:200px;box-sizing:border-box}
.deepdots-popup-header{display:flex;justify-content:flex-end;align-items:center;width:100%}
#dd-close{background:transparent;border:none;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:8px;cursor:pointer;color:${textPrimary};padding:4px}
.deepdots-popup-container-content{display:flex;flex-direction:column;padding:0 20px 12px 20px;max-height:80vh;overflow:hidden;box-sizing:border-box}
.deepdots-popup-main{display:flex;flex-direction:column;width:100%;max-height:80vh;overflow-y:auto;overflow-x:hidden;position:relative}
#dd-form-wrapper{width:100%;flex:1 1 auto}
#mf{width:100%;box-sizing:border-box;visibility:hidden}
.deepdots-popup-main *{max-width:100%;box-sizing:border-box}
#dd-logo{max-height:40px;max-width:100%;object-fit:contain}
.deepdots-error-hint{display:none;margin:12px 0 0 0;padding:10px 12px;border-radius:6px;background:#FEF3C7;color:#92400E;border:1px solid #FCD34D;font-size:13px}
.deepdots-popup-footer{display:flex;flex-direction:row-reverse;justify-content:space-between;align-items:center;gap:8px;margin-top:auto;width:100%;padding-top:16px}
.dd-nav-btn{display:none;border:none;padding:12px 24px;border-radius:4px;cursor:pointer;font-size:14px;box-shadow:0 2px 4px rgba(0,0,0,0.1);align-items:center;justify-content:center;text-align:center}
#dd-back{background:transparent;color:#333;border:1px solid #999}
#dd-start,#dd-complete,#dd-submit{background:#1E293B;color:#fff;border:none}
#dd-submit:disabled,#dd-start:disabled,#dd-back:disabled,#dd-complete:disabled{opacity:0.6;cursor:not-allowed}
.mf-spinner{display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
.mf-spinner-circle{width:28px;height:28px;border:3px solid #e0e6ed;border-top-color:#1E293B;border-radius:50%;animation:ddspin 0.9s linear infinite}
@keyframes ddspin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
@media (max-width:640px){
  .deepdots-popup{width:calc(100% - 24px);max-width:calc(100% - 24px);border-radius:12px}
  .deepdots-popup-footer{flex-direction:column-reverse;gap:12px}
  .dd-nav-btn{width:100%}
  .magicfeedback-checkbox-container,.magicfeedback-radio-container{margin:4px 0;padding:4px 8px}
  .magicfeedback-checkbox label,.magicfeedback-radio-container label{font-size:15px}
  .deepdots-popup input[type="radio"]{margin:6px 0 6px 8px}
  .deepdots-popup input[type="checkbox"]{width:16px;height:16px}
}
</style>
</head><body>
<div class="${popupClass}" id="dd-popup">
  <div class="deepdots-popup-header">
    <button type="button" id="dd-close" aria-label="Close popup">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>
  <div class="deepdots-popup-container-content">
    <div class="deepdots-popup-main" id="dd-main">
      <div id="dd-form-wrapper">
        <div class="mf-spinner" id="dd-spinner" role="status" aria-label="Loading survey"><div class="mf-spinner-circle"></div></div>
        <div id="mf"></div>
      </div>
      <div class="deepdots-error-hint" id="dd-error" role="alert" aria-live="polite"></div>
      <div class="deepdots-popup-footer" id="dd-footer">
        <button type="button" class="dd-nav-btn" id="dd-submit">Send</button>
        <button type="button" class="dd-nav-btn" id="dd-back">Back</button>
        <button type="button" class="dd-nav-btn" id="dd-complete">Complete survey</button>
        <button type="button" class="dd-nav-btn" id="dd-start">Start survey</button>
      </div>
    </div>
  </div>
</div>
<script>
(function(){
  function emit(s){ try{ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(s); } }catch(e){} }
  function emitJSON(n,p){ try{ emit(JSON.stringify({name:n,payload:p||{}})); }catch(e){} }
  window.DeepdotsClose = function(){ emitJSON('popup_close'); };

  var popup=document.getElementById('dd-popup');
  var main=document.getElementById('dd-main');
  var footer=document.getElementById('dd-footer');
  var spinner=document.getElementById('dd-spinner');
  var formHost=document.getElementById('mf');
  var errorHint=document.getElementById('dd-error');
  var backBtn=document.getElementById('dd-back');
  var startBtn=document.getElementById('dd-start');
  var completeBtn=document.getElementById('dd-complete');
  var submitBtn=document.getElementById('dd-submit');

  backBtn.textContent=${backLabel};
  startBtn.textContent=${startLabel};
  completeBtn.textContent=${completeLabel};
  submitBtn.textContent=${submitLabel};

  document.getElementById('dd-close').onclick=function(){ emitJSON('popup_close'); };
  backBtn.onclick=function(){ if(window.DeepdotsForm && window.DeepdotsForm.back){ window.DeepdotsForm.back(); } };
  startBtn.onclick=function(){ if(window.DeepdotsForm && window.DeepdotsForm.startForm){ window.DeepdotsForm.startForm(); } };
  completeBtn.onclick=function(){ emitJSON('popup_close'); };
  var surveyCompletedEmitted=false;
  submitBtn.onclick=function(){
    if(surveyCompletedEmitted) return;
    if(window.DeepdotsForm && window.DeepdotsForm.send){ window.DeepdotsForm.send(); }
  };

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
        onLoadedEvent:function(args){
          var s=args && args.formData ? args.formData.style : null;
          if(s && !stylesInjected){
            stylesInjected=true;
            if(s.boxBackgroundColor){ popup.style.background=s.boxBackgroundColor; }
            if(s.contentAlign){ main.style.justifyContent = s.contentAlign==='center' ? 'center' : 'flex-start'; }
            if(s.buttonPrimaryColor){
              submitBtn.style.background=s.buttonPrimaryColor; submitBtn.style.border='none'; submitBtn.style.color='#fff';
              startBtn.style.background=s.buttonPrimaryColor; startBtn.style.border='none'; startBtn.style.color='#fff';
              completeBtn.style.background=s.buttonPrimaryColor; completeBtn.style.border='none'; completeBtn.style.color='#fff';
            }
            if(s.buttonSecondaryColor){
              backBtn.style.background='#fff'; backBtn.style.color=s.buttonSecondaryColor; backBtn.style.border='1px solid '+s.buttonSecondaryColor;
            }
            if(s.logo && !document.getElementById('dd-logo')){
              var logoImg=document.createElement('img');
              logoImg.id='dd-logo'; logoImg.src=s.logo; logoImg.alt='Logo';
              if(s.logoSize==='small'){ logoImg.style.maxHeight='30px'; }
              else if(s.logoSize==='medium'){ logoImg.style.maxHeight='50px'; }
              else if(s.logoSize==='large'){ logoImg.style.maxHeight='70px'; }
              if(s.logoPosition==='left'){ logoImg.style.margin='0 16px 20px 0'; logoImg.style.display='block'; logoImg.style.marginLeft='0'; }
              else if(s.logoPosition==='right'){ logoImg.style.margin='0 0 20px 16px'; logoImg.style.display='block'; logoImg.style.marginLeft='auto'; }
              else if(s.logoPosition==='center'){ logoImg.style.margin='0 auto 20px auto'; logoImg.style.display='block'; }
              main.insertBefore(logoImg, document.getElementById('dd-form-wrapper'));
            }
            if(s.startMessage && s.startMessage!==''){ updateButtons('start'); }
            else { updateButtons('in_progress_first'); }
          } else {
            updateButtons('in_progress_first');
          }
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
              errorHint.textContent='Please answer the required question to continue.';
              errorHint.style.display='block';
              updateButtons('in_progress_next');
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
            updateButtons('completed');
            emitJSON('survey_completed', p);
            return;
          }
          if(p && p.total>1 && p.progress>0 && p.progress<p.total){ updateButtons('in_progress_next'); }
          else { updateButtons('in_progress_first'); }
          emitJSON('after_submit', p);
        },
        onBackEvent:function(p){
          if(p && p.progress===0){ updateButtons('in_progress_first'); }
          else { updateButtons('in_progress_next'); }
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
