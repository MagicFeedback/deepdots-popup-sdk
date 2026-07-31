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

  it('en mobile (@media max-width:640px) las filas de opciones son más compactas', () => {
    const html = buildSurveyHtml({ surveyId: 's1', productId: 'p1' });
    expect(html).toContain('.magicfeedback-checkbox-container,.magicfeedback-radio-container{margin:4px 0;padding:4px 8px}');
    expect(html).toContain('.deepdots-popup input[type="radio"]{margin:6px 0 6px 8px}');
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
