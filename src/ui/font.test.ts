import { describe, it, expect } from 'vitest';
import { buildFontFaceCss, buildFontFamilyValue, fontFormatFromUrl } from './font';

describe('fontFormatFromUrl', () => {
  it('deriva el format de la extensión', () => {
    expect(fontFormatFromUrl('https://x.com/Inter.woff2')).toBe('woff2');
    expect(fontFormatFromUrl('https://x.com/Inter.ttf')).toBe('truetype');
    expect(fontFormatFromUrl('https://x.com/Inter.otf')).toBe('opentype');
  });
  it('ignora query/hash', () => {
    expect(fontFormatFromUrl('https://x.com/Inter.woff2?v=3#a')).toBe('woff2');
  });
  it('devuelve undefined si no reconoce la extensión', () => {
    expect(fontFormatFromUrl('https://x.com/Inter.eot')).toBeUndefined();
  });
});
describe('buildFontFamilyValue', () => {
  it('añade el fallback de sistema', () => {
    expect(buildFontFamilyValue('Inter')).toBe('"Inter", -apple-system, system-ui, sans-serif');
  });
});
describe('buildFontFaceCss', () => {
  it('devuelve "" sin url', () => {
    expect(buildFontFaceCss('Inter', undefined)).toBe('');
  });
  it('arma el @font-face con format conocido', () => {
    expect(buildFontFaceCss('Inter', 'https://x.com/Inter.woff2')).toBe(
      '@font-face{font-family:"Inter";src:url("https://x.com/Inter.woff2") format("woff2");font-display:swap;}',
    );
  });
  it('omite format() si la extensión no se reconoce', () => {
    expect(buildFontFaceCss('Inter', 'https://x.com/Inter.eot')).toBe(
      '@font-face{font-family:"Inter";src:url("https://x.com/Inter.eot");font-display:swap;}',
    );
  });
});
