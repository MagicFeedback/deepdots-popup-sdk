import type { IdentityAnswer } from '../tracking/tracking-manager';

/**
 * Construye un HTML autocontenido que renderiza el survey de `@magicfeedback/native`
 * dentro de un WebView (React Native). Carga el bundle desde CDN, crea el form con la
 * identidad inyectada (`profile`/`metadata`) y reenvía los eventos del survey al host
 * vía el puente de react-native-webview: `window.ReactNativeWebView.postMessage`.
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
}

export function buildSurveyHtml(opts: BuildSurveyHtmlOptions): string {
  const env = opts.env === 'development' ? 'dev' : 'prod';
  const version = opts.version ?? '2.2.4';
  const cdn = `https://cdn.jsdelivr.net/npm/@magicfeedback/native@${version}/dist/magicfeedback-sdk.browser.js`;
  const sid = JSON.stringify(opts.surveyId);
  const pid = JSON.stringify(opts.productId);
  const profileJson = JSON.stringify(opts.profile ?? []);
  const metaJson = JSON.stringify(opts.metadata ?? []);

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="color-scheme" content="light"/>
<style>html,body{margin:0;padding:0;background:transparent;font-family:-apple-system,system-ui,sans-serif}#mf{width:100%;box-sizing:border-box}#mf *{max-width:100%;box-sizing:border-box}</style>
</head><body>
<div id="mf"></div>
<script>
(function(){
  function emit(s){ try{ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(s); } }catch(e){} }
  function emitJSON(n,p){ try{ emit(JSON.stringify({name:n,payload:p||{}})); }catch(e){} }
  window.DeepdotsClose = function(){ emitJSON('popup_close'); };
  var initialized=false;
  function initMF(){
    if(initialized || !window.magicfeedback) return initialized;
    initialized=true;
    try{
      window.magicfeedback.init({ debug:false, env:'${env}' });
      var form = window.magicfeedback.form(${sid}, ${pid}, ${profileJson}, ${metaJson});
      window.DeepdotsForm = form;
      form.generate('mf', {
        addButton:false,
        getMetaData:true,
        onLoadedEvent:function(){ emitJSON('loaded'); },
        beforeSubmitEvent:function(){ emitJSON('before_submit'); },
        afterSubmitEvent:function(p){
          try{ if(p && p.completed){ emitJSON('survey_completed', p); } else { emitJSON('after_submit', p); } }
          catch(e){ emitJSON('after_submit'); }
        },
        onBackEvent:function(p){ emitJSON('back', p); }
      }).catch(function(e){ emit('error:init'); });
    }catch(e){ emit('error:exception'); }
    return true;
  }
  var s=document.createElement('script'); s.src=${JSON.stringify(cdn)}; s.async=true;
  s.onload=function(){ initMF(); };
  s.onerror=function(){ emit('error:load'); };
  document.head.appendChild(s);
  var tries=0, t=setInterval(function(){ if(initMF()||++tries>40){ clearInterval(t); } },150);
})();
</script>
</body></html>`;
}
