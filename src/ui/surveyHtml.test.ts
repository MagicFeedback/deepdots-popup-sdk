import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSurveyHtml } from './surveyHtml';

// Vitest/Vite trata `import from '*.css'` como CSS-para-inyectar-en-el-DOM (devuelve ''
// de export default), a diferencia del loader de tsup en el build real
// (`loader: { '.css': 'text' }`) que sí devuelve el texto. Leemos el fichero directamente
// para comparar contra el mismo contenido que `surveyHtml.ts` inyecta en producción.
const magicfeedbackCss = readFileSync(join(__dirname, '../assets/style.css'), 'utf-8');

describe('buildSurveyHtml stylesheet', () => {
  it('no enlaza el CSS default del CDN (usa el mismo que el popup web)', () => {
    // Nota: Vite/vitest trata `import from '*.css'` como CSS-para-inyectar-en-el-DOM (el
    // default export es '' en este entorno de test, a diferencia del loader `text` de tsup
    // en el build real) — por eso no comparamos `html` contra `magicfeedbackCss` aquí; ese
    // mismo límite ya existe en `renderPopup.inject-style.test.ts` (solo comprueba presencia).
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).not.toContain('magicfeedback-default.css');
  });

  it('.magicfeedback-radio va cualificado con `div` (no debe capturar el <input> que reutiliza esa clase)', () => {
    // @magicfeedback/native pone class="magicfeedback-radio magicfeedback-input" en el <input>
    // de las preguntas de rating; un selector .magicfeedback-radio sin cualificar rompe su tamaño.
    expect(magicfeedbackCss).toContain('div.magicfeedback-radio {');
    expect(magicfeedbackCss).not.toMatch(/(^|[^a-zA-Z0-9_-])\.magicfeedback-radio\s*\{/);
  });

  it('el scroll horizontal queda bloqueado en el contenedor scrollable (main), no atado a #mf', () => {
    // @magicfeedback/native sustituye el div #mf por su propio contenedor, así que un
    // safety-net `#mf *` deja de aplicar a cualquier cosa una vez el survey se monta.
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('overflow-x:hidden');
    expect(html).toContain('.deepdots-popup-main *{max-width:100%;box-sizing:border-box}');
    expect(html).not.toContain('#mf *{');
  });
});

describe('buildSurveyHtml chrome (paridad con renderPopup.ts)', () => {
  it('incluye el botón de cerrar y el footer con back/start/complete/send', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('id="dd-close"');
    expect(html).toContain('id="dd-back"');
    expect(html).toContain('id="dd-start"');
    expect(html).toContain('id="dd-complete"');
    expect(html).toContain('id="dd-submit"');
    expect(html).toContain("backBtn.textContent=\"Back\"");
    expect(html).toContain("startBtn.textContent=\"Start survey\"");
    expect(html).toContain("completeBtn.textContent=\"Complete survey\"");
    expect(html).toContain("submitBtn.textContent=\"Send\"");
  });

  it('usa las etiquetas de actions cuando se proveen', () => {
    const html = buildSurveyHtml({
      surveyId: 's1',
      productId: 'p1',
      actions: {
        back: { label: 'Atrás', cooldownDays: 1 },
        start: { label: 'Empezar' },
        accept: { label: 'Enviar', surveyId: 's1' },
        complete: { label: 'Listo', surveyId: 's1', autoCompleteParams: {} },
      },
    });
    expect(html).toContain('backBtn.textContent="Atrás"');
    expect(html).toContain('startBtn.textContent="Empezar"');
    expect(html).toContain('submitBtn.textContent="Enviar"');
    expect(html).toContain('completeBtn.textContent="Listo"');
  });

  it('tema dark: fondo del popup oscuro y color-scheme dark', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', theme: 'dark' });
    expect(html).toContain('background:#1e1e1e');
    expect(html).toContain('color-scheme:dark');
  });

  it('tema claro por defecto (sin theme)', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('background:#fff');
    expect(html).toContain('color-scheme:light');
  });

  it('position center: fondo de página con backdrop semitransparente', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', position: 'center' });
    expect(html).toContain('background:rgba(0,0,0,0.5)');
  });

  it('position bottom: sin backdrop, padding en el borde', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', position: 'bottom' });
    expect(html).toContain('background:transparent');
    expect(html).toContain('padding:16px');
  });

  it('en mobile los botones se apilan con la acción principal arriba y Back debajo', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    // El DOM es [submit, back, complete, start]: `column` deja Send arriba; `column-reverse`
    // (lo que había) lo mandaba abajo y subía el Back.
    expect(html).toContain('.deepdots-popup-footer{flex-direction:column;gap:4px}');
    expect(html).not.toContain('flex-direction:column-reverse');
    const submitIdx = html.indexOf('id="dd-submit"');
    const backIdx = html.indexOf('id="dd-back"');
    expect(submitIdx).toBeLessThan(backIdx);
  });

  it('en mobile (@media max-width:640px) las filas de opciones son más compactas', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('.magicfeedback-checkbox-container,.magicfeedback-radio-container{margin:4px 0;padding:4px 8px}');
    expect(html).toContain('.deepdots-popup input[type="radio"]{margin:6px 0 6px 8px}');
  });
});

describe('buildSurveyHtml chrome flag (host gestiona el contenedor)', () => {
  it('por defecto (chrome on): tarjeta con fondo, sombra y bordes redondeados', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('box-shadow:0 4px 6px rgba(0,0,0,0.1)');
    expect(html).toContain('border-radius:8px');
    expect(html).toContain('max-width:600px');
  });

  it('chrome:false: sin tarjeta (transparente, sin sombra, sin borde, llena el contenedor)', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', chrome: false });
    // el popup deja de pintar su propio "modal": lo envuelve el host
    expect(html).toContain('.deepdots-popup{');
    expect(html).toContain('box-shadow:none');
    expect(html).toContain('border-radius:0');
    expect(html).not.toContain('box-shadow:0 4px 6px rgba(0,0,0,0.1)');
    // sin backdrop de página aunque la position sea center (no oscurece: lo hace el host)
    const centered = buildSurveyHtml({ surveyId: 's1', productId: 'p1', chrome: false, position: 'center' });
    expect(centered).not.toContain('background:rgba(0,0,0,0.5)');
  });

  it('chrome:false: sigue siendo un survey funcional (bridge, form y botones)', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', chrome: false });
    expect(html).toContain('ReactNativeWebView');
    expect(html).toContain('id="mf"');
    expect(html).toContain('id="dd-submit"');
    expect(html).toContain('id="dd-close"');
  });

  it('chrome:false: no aplica el color de fondo del popup que viene de la API (lo controla el host)', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', chrome: false });
    expect(html).toContain('var chromeOn=false');
    const withChrome = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(withChrome).toContain('var chromeOn=true');
  });
});

describe('buildSurveyHtml título de cabecera', () => {
  it('sin título: la cabecera solo lleva la X (oculta el hueco del título)', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('<h2 id="dd-title" class="deepdots-popup-title" hidden></h2>');
    expect(html).toContain('setTitle("")');
  });

  it('con título: lo aplica por textContent, nunca interpolado en el HTML', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', title: 'App Survey' });
    expect(html).toContain('setTitle("App Survey")');
    // el marcado sigue vacío: el valor de la API no toca el HTML
    expect(html).toContain('<h2 id="dd-title" class="deepdots-popup-title" hidden></h2>');
  });

  it('un título con HTML no se interpola (queda como literal JS escapado)', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', title: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('setTitle("\\u003Cimg src=x onerror=alert(1)>")');
  });

  it('un título con </script> no puede cerrar el bloque de script', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', title: '</script><img src=x>' });
    // `<` escapado a \u003C: el parser de HTML ya no ve un cierre de script
    expect(html).not.toContain('</script><img');
    expect(html).toContain('\\u003C/script>');
  });

  it('NO cae al title del survey: el del popup es el único origen', () => {
    // `title` es un campo de la definición del popup (GET /sdk/{publicKey}/popups) y varía de
    // un popup a otro; vacío es un valor legítimo y debe quedarse vacío, no heredar el del survey.
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).not.toContain('setTitle(s.title)');
    expect(html).toContain('setTitle("")');
  });

  it('no hereda el uppercase del h2 del survey', () => {
    // `.deepdots-popup h2` del CSS de surveys es uppercase + centrado + margin-bottom 40px:
    // sirve para los enunciados, no para el título de la cabecera.
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', title: 'App Survey' });
    expect(html).toContain('#dd-title{');
    expect(html).toContain('text-transform:none');
    expect(html).toContain('text-align:left');
  });
});

describe('buildSurveyHtml barra de progreso', () => {
  it('sin preferencia del host: decide la plataforma (style.showProgressBar)', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('var progressPref=null');
    expect(html).toContain('if(progressPref===null){ progressEnabled=s.showProgressBar===true; }');
  });

  it('showProgressBar:true la fuerza desde el init', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', showProgressBar: true });
    expect(html).toContain('var progressPref=true');
    expect(html).toContain('var progressEnabled=progressPref===true');
  });

  it('showProgressBar:false la apaga aunque la plataforma la active', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', showProgressBar: false });
    expect(html).toContain('var progressPref=false');
  });

  it('incluye la barra y su etiqueta, ocultas por defecto', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('id="dd-progress"');
    expect(html).toContain('id="dd-progress-label"');
    expect(html).toContain('id="dd-progress-bar"');
    expect(html).toContain('.deepdots-progress{display:none');
  });

  it('se oculta en la pantalla de inicio, al completar y con una sola página', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('if(!progressEnabled||onStartPage||p&&p.completed||total<=1){');
    expect(html).toContain("progressEl.style.display='none'");
  });

  it('la etiqueta redondea hacia abajo (una follow-up no es la pregunta siguiente)', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    // la barra usa el valor real (con el +0.5 de las follow-up), la etiqueta el entero
    expect(html).toContain('var current=Math.min(total,Math.max(1,progress+1))');
    expect(html).toContain('var label=Math.min(total,Math.max(1,Math.floor(progress)+1))');
    expect(html).toContain("progressCurrent.textContent='Question '+label");
  });

  it('respeta progressUnit percentage y el color de loadingBarColor', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain("if(progressUnit==='percentage')");
    expect(html).toContain("progressCurrent.textContent=Math.round(pct)+'%'");
    expect(html).toContain('if(s.loadingBarColor){ progressBar.style.background=s.loadingBarColor;');
  });
});

describe('buildSurveyHtml métricas del diseño', () => {
  it('cabecera, progreso y contenido comparten el sangrado de la tarjeta', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    // Antes el contenido sumaba 20px a los lados y quedaba más adentro que el título.
    expect(html).toContain('.deepdots-popup-container-content{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;padding:16px 0 0 0;');
    expect(html).toContain('.deepdots-progress{display:none;flex-direction:column;gap:8px;width:100%;flex:0 0 auto;padding:16px 0');
  });

  it('la barra es fina y redondeada, con la pista en gris claro', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('.deepdots-progress-track{width:100%;height:4px;border-radius:999px;background:#e5e7eb');
    expect(html).toContain('#dd-progress-bar{height:100%;width:0%;background:#22C55E;border-radius:999px');
  });

  it('la etiqueta separa el número en negrita del "of N" en regular', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('id="dd-progress-current"');
    expect(html).toContain('id="dd-progress-total"');
    expect(html).toContain('#dd-progress-current{font-weight:700');
    expect(html).toContain('#dd-progress-total{font-weight:400;color:#6b7280}');
    expect(html).toContain("progressCurrent.textContent='Question '+label");
    expect(html).toContain("progressTotal.textContent=' of '+total");
  });

  it('los botones tienen altura y radio de acción táctil', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('.dd-nav-btn{display:none;border:none;min-height:44px;padding:12px 24px;border-radius:6px;cursor:pointer;font-size:15px;font-weight:600');
    expect(html).toContain('.deepdots-popup-footer{flex-direction:column;gap:4px}');
  });

  it('el hueco por arriba y por abajo de la barra de progreso es el mismo', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    // 16px arriba y 16px abajo, el mismo valor que el padding de la tarjeta.
    expect(html).toContain('.deepdots-progress{display:none;flex-direction:column;gap:8px;width:100%;flex:0 0 auto;padding:16px 0');
    // El margin-top del enunciado sumaba 20px por debajo y rompía la simetría.
    expect(html).toContain('.deepdots-popup .magicfeedback-questions .magicfeedback-div:first-child .magicfeedback-label{margin-top:0}');
    // Con barra el contenido no añade nada; sin barra es él quien separa de la cabecera.
    expect(html).toContain("content.style.paddingTop='0'");
    expect(html).toContain("content.style.paddingTop='16px'");
  });

  it('el secundario es un botón de texto: sin borde ni fondo', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('#dd-back{background:transparent;color:#6b7280;border:none}');
    // y el color de la API tampoco le devuelve el marco
    expect(html).toContain("backBtn.style.background='transparent'; backBtn.style.color=s.buttonSecondaryColor; backBtn.style.border='none'");
  });

  it('chrome:false no duplica los insets de safe-area del contenedor del host', () => {
    // El host ya aplica el safe area; sumarlo otra vez dejaba un hueco muerto bajo el footer.
    const hostOwned = buildSurveyHtml({ surveyId: 's1', productId: 'p1', chrome: false });
    expect(hostOwned).toContain('.deepdots-popup{width:100%;max-width:100%;border-radius:0;padding:16px}');
    expect(hostOwned).not.toContain('env(safe-area-inset-bottom)');

    // Con chrome el popup sí es el que se separa de los bordes de la ventana.
    const own = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(own).toContain('env(safe-area-inset-bottom)');
    expect(own).toContain('width:calc(100% - 24px)');
  });

  it('en tema dark el texto secundario y la pista se adaptan', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', theme: 'dark' });
    expect(html).toContain('#dd-progress-total{font-weight:400;color:#9ca3af}');
    expect(html).toContain('background:#3f3f46');
  });
});

describe('buildSurveyHtml pantalla final', () => {
  it('desactiva la pantalla final de @magicfeedback/native y pinta la propia', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    // renderSuccess del SDK de surveys usa textContent y su fallback ignora el estilo del
    // survey, así que el mensaje de la plataforma (HTML con imagen) nunca se vería.
    expect(html).toContain('addSuccessScreen:false');
    expect(html).toContain('function showSuccessScreen()');
    // El contenedor se crea al completar, no viene en el marcado inicial.
    expect(html).toContain("done.id='dd-success'");
    expect(html).toContain('.deepdots-success{display:none');
  });

  it('usa el successMessage de la plataforma como HTML, con fallback', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('if(s.successMessage){ successMessageHtml=s.successMessage; }');
    expect(html).toContain("done.innerHTML=successMessageHtml || '<p>Thank you for your feedback!</p>'");
    // la imagen del mensaje se ajusta al ancho disponible
    expect(html).toContain('.deepdots-success img{max-width:100%;height:auto');
  });

  it('al completar oculta el formulario y la barra, y muestra la pantalla final', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    const completedBranch = html.slice(html.indexOf('if(p && p.completed){'));
    expect(completedBranch.slice(0, 220)).toContain('showSuccessScreen()');
    expect(html).toContain("if(wrapper){ wrapper.style.display='none'; }");
  });
});

describe('buildSurveyHtml surveyCss (CSS del host)', () => {
  it('sin surveyCss no añade nada', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).not.toContain('deepdots-custom');
  });

  it('va después de todo el CSS del SDK para ganar en cascada', () => {
    const marker = '.magicfeedback-radio-container{border:none}';
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', surveyCss: marker });
    expect(html).toContain(marker);
    // por detrás de la media query, que es el último bloque propio
    expect(html.indexOf(marker)).toBeGreaterThan(html.indexOf('@media (max-width:640px)'));
    // y todavía dentro del <style>
    expect(html.indexOf(marker)).toBeLessThan(html.indexOf('</style>'));
  });

  it('un </style> en el CSS del host no puede cerrar el bloque', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', surveyCss: '</style><img src=x onerror=alert(1)>' });
    // el primer </style> del documento sigue siendo el del SDK, no el inyectado
    expect(html).not.toContain('</style><img');
    expect(html).toContain('<\\/style');
  });
});

describe('buildSurveyHtml navegación (botón Back)', () => {
  it('el Back se decide por profundidad de página, no por total>1', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('var pageDepth=0');
    expect(html).toContain("updateButtons(pageDepth>0?'in_progress_next':'in_progress_first')");
    // la condición vieja escondía el Back cuando la siguiente pantalla era una follow-up
    expect(html).not.toContain('p.total>1 && p.progress>0 && p.progress<p.total');
  });

  it('avanzar suma profundidad y volver la resta', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('pageDepth++');
    expect(html).toContain('if(!(p&&p.error)){ pageDepth=Math.max(0,pageDepth-1); }');
  });

  it('un error de validación no cambia la profundidad', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    const validationBranch = html.slice(html.indexOf('Please answer the required question'));
    expect(validationBranch.slice(0, 200)).toContain('updateNavButtons()');
  });
});

describe('buildSurveyHtml layout (footer fijo)', () => {
  it('el footer vive fuera del área scrollable', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    const mainEnd = html.indexOf('</div>', html.indexOf('id="dd-error"'));
    const footerStart = html.indexOf('id="dd-footer"');
    expect(footerStart).toBeGreaterThan(mainEnd);
  });

  it('solo el bloque de preguntas hace scroll; el contenedor reparte el alto', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('.deepdots-popup-container-content{display:flex;flex-direction:column;flex:1 1 auto;min-height:0');
    expect(html).toContain('.deepdots-popup-main{display:flex;flex-direction:column;width:100%;flex:1 1 auto;min-height:0;overflow-y:auto');
    // el límite viejo de 80vh atado al main dejaba el footer al final del scroll
    expect(html).not.toContain('max-height:80vh');
  });

  it('el alto queda acotado: 90vh con chrome, 100% del contenedor sin chrome', () => {
    expect(buildSurveyHtml({ surveyId: 's1', productId: 'p1' })).toContain('max-height:90vh');
    expect(buildSurveyHtml({ surveyId: 's1', productId: 'p1', chrome: false })).toContain('height:100%;max-height:100%');
  });
});

describe('buildSurveyHtml stylesheet (legacy)', () => {
  it('sigue cargando el JS del survey desde el CDN', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', version: '2.2.4' });
    expect(html).toContain('https://cdn.jsdelivr.net/npm/@magicfeedback/native@2.2.4/dist/magicfeedback-sdk.browser.js');
  });
});

describe('buildSurveyHtml font', () => {
  it('sin font: usa la fuente de sistema y no incluye @font-face', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('font-family:-apple-system,system-ui,sans-serif');
    expect(html).not.toContain('@font-face');
  });
  it('con font.family: aplica la familia con fallback', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', font: { family: 'Inter' } });
    expect(html).toContain('"Inter", -apple-system, system-ui, sans-serif');
    expect(html).not.toContain('@font-face');
  });
  it('con font.url: inyecta el @font-face y aplica la familia', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1', font: { family: 'Inter', url: 'https://x.com/Inter.woff2' } });
    expect(html).toContain('@font-face{font-family:"Inter";src:url("https://x.com/Inter.woff2") format("woff2")');
    expect(html).toContain('"Inter", -apple-system, system-ui, sans-serif');
  });
});

describe('buildSurveyHtml logo', () => {
  it('lo cuelga del popup, antes de la barra de progreso (no dentro del scroll)', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    // Espejo de insertPopupLogo (src/ui/logo.ts) en la ruta web.
    expect(html).toContain('popup.insertBefore(logoImg, progressEl);');
    // Antes vivía dentro de #dd-main y se iba con el scroll del formulario.
    expect(html).not.toContain('main.insertBefore(logoImg');
  });

  it('el logo es un bloque con hueco solo por arriba', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('#dd-logo{max-height:40px;max-width:100%;object-fit:contain;display:block;margin:12px 0 0 0}');
    expect(html).toContain("logoImg.style.margin='12px 16px 0 0'");
    expect(html).toContain("logoImg.style.margin='12px 0 0 16px'");
    expect(html).toContain("logoImg.style.margin='12px auto 0 auto'");
  });
});
