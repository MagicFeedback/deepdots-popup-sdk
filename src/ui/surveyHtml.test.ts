import { describe, it, expect } from 'vitest';
import { buildSurveyHtml } from './surveyHtml';

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
