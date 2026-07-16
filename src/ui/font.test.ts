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
  it('sanea caracteres peligrosos en family', () => {
    expect(buildFontFamilyValue('Inter";}</style><script>')).toBe('"Interstylescript", -apple-system, system-ui, sans-serif');
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
  it('rechaza urls no seguras (sin @font-face)', () => {
    expect(buildFontFaceCss('Inter', 'javascript:alert(1)')).toBe('');
    expect(buildFontFaceCss('Inter', 'https://x.com/a".woff2')).toBe('');
  });
  it('acepta data: urls de fuente', () => {
    expect(buildFontFaceCss('Inter', 'data:font/woff2;base64,AAAA')).toContain('@font-face{font-family:"Inter";src:url("data:font/woff2;base64,AAAA")');
  });
});
