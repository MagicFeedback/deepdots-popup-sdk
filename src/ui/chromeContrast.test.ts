import { describe, it, expect } from 'vitest';
import {
    CHROME_CONTRAST_JS,
    chromePalette,
    isDarkBackground,
    parseColor,
    relativeLuminance,
} from './chromeContrast';

/** El espejo ES5 que corre dentro del WebView, evaluado de verdad. */
const mirror = new Function(`${CHROME_CONTRAST_JS}; return { ddIsDarkBackground, ddChromePalette };`)() as {
    ddIsDarkBackground: (v?: string | null) => boolean | null;
    ddChromePalette: (dark: boolean) => Record<string, string>;
};

const SAMPLES = [
    '#000', '#fff', '#FFFFFF', '#111111', '#1e1e1e', '#0f172a', '#00aeef', '#777777', '#767676',
    '#808080', '#ffcc00', '#1E293Bcc', '#abcd', 'rgb(0,0,0)', 'rgba(255, 255, 255, 0.5)',
    'rgb(300,0,0)', 'red', 'var(--x)', '', '  #222  ', 'linear-gradient(#000,#fff)', '#12345',
];

describe('chromeContrast', () => {
    it('lee hex corto, largo, con alfa y rgb()', () => {
        expect(parseColor('#fff')).toEqual([255, 255, 255]);
        expect(parseColor('#1e1e1e')).toEqual([30, 30, 30]);
        expect(parseColor('#1E293Bcc')).toEqual([30, 41, 59]);
        expect(parseColor('rgba(10, 20, 30, 0.4)')).toEqual([10, 20, 30]);
    });

    it('descarta lo que no es un color legible', () => {
        for (const v of ['red', 'var(--x)', '', undefined, null, 'rgb(300,0,0)', '#12345', 'url(x)']) {
            expect(parseColor(v)).toBeNull();
            expect(isDarkBackground(v)).toBeNull();
        }
    });

    it('luminancia WCAG en los extremos', () => {
        expect(relativeLuminance([0, 0, 0])).toBe(0);
        expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
    });

    it('fondos oscuros → paleta dark, fondos claros → paleta light', () => {
        for (const dark of ['#000', '#111111', '#1e1e1e', '#0f172a', '#1E293B', '#333']) {
            expect(isDarkBackground(dark)).toBe(true);
        }
        for (const light of ['#fff', '#f5f5f5', '#00aeef', '#ffcc00', '#808080', '#e5e7eb']) {
            expect(isDarkBackground(light)).toBe(false);
        }
    });

    // En el gris medio ninguna de las dos paletas llega a 4.5:1; lo que se exige es elegir la
    // que más contrasta (con margen de redondeo en el punto de cruce).
    it('elige siempre el texto que más contrasta con el fondo', () => {
        const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        for (let v = 0; v <= 255; v += 5) {
            const bg = `rgb(${v},${v},${v})`;
            const pal = chromePalette(isDarkBackground(bg) as boolean);
            const l = relativeLuminance([v, v, v]);
            const t = relativeLuminance(parseColor(pal.textPrimary)!);
            const other = chromePalette(!isDarkBackground(bg)).textPrimary;
            const o = relativeLuminance(parseColor(other)!);
            expect(contrast(l, t)).toBeGreaterThanOrEqual(contrast(l, o) - 0.05);
        }
    });

    it('la paleta conserva los colores de siempre del theme', () => {
        expect(chromePalette(false)).toEqual({
            popupBg: '#fff', colorScheme: 'light', textPrimary: '#111',
            closeBtnHoverColor: '#000000', textMuted: '#6b7280', progressTrack: '#e5e7eb',
        });
        expect(chromePalette(true).colorScheme).toBe('dark');
        expect(chromePalette(true).textPrimary).toBe('#f0f0f0');
    });

    it('el espejo ES5 del WebView decide igual que el módulo', () => {
        for (const v of SAMPLES) {
            expect(mirror.ddIsDarkBackground(v)).toBe(isDarkBackground(v));
        }
        for (const dark of [true, false]) {
            const p = chromePalette(dark);
            expect(mirror.ddChromePalette(dark)).toEqual({
                colorScheme: p.colorScheme, textPrimary: p.textPrimary,
                closeBtnHoverColor: p.closeBtnHoverColor, textMuted: p.textMuted, progressTrack: p.progressTrack,
            });
        }
    });
});
