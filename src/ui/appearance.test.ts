import { describe, it, expect } from 'vitest';
import {
    APPEARANCE_JS,
    DARK_DEFAULT_BG,
    DARK_DEFAULT_PRIMARY,
    LIGHT_DEFAULT_BG,
    ON_LIGHT_PRIMARY,
    chromeColors,
    normalizeAppearance,
    resolveForcedMode,
    type ColorMode,
    type StyleColors,
} from './appearance';
import { CHROME_CONTRAST_JS } from './chromeContrast';

/** El espejo ES5 del WebView (React Native), evaluado de verdad. */
const mirror = new Function(`${CHROME_CONTRAST_JS}; ${APPEARANCE_JS}; return { ddChromeColors, ddResolveForcedMode };`)() as {
    ddChromeColors: (s: StyleColors | null, theme: string | undefined, forced: ColorMode | null) => unknown;
    ddResolveForcedMode: (a: unknown) => ColorMode | null;
};

const LIGHT_BRAND = '#FFF7ED';
const DARK_STYLE = '#1C1F26';
const DARK_BLOCK = '#14161B';

describe('appearance (DD-241)', () => {
    it('la app fuerza el modo; sin ella no se fuerza nada', () => {
        expect(resolveForcedMode(undefined, true)).toBeNull();
        expect(resolveForcedMode(null, false)).toBeNull();
        expect(resolveForcedMode('light', true)).toBe('light');
        expect(resolveForcedMode('dark', false)).toBe('dark');
        expect(resolveForcedMode('system', true)).toBe('dark');
        expect(resolveForcedMode('system', false)).toBe('light');
        expect(mirror.ddResolveForcedMode('dark')).toBe('dark');
        expect(mirror.ddResolveForcedMode(undefined)).toBeNull();
    });

    it('normaliza valores del host', () => {
        expect(normalizeAppearance('system')).toBe('system');
        expect(normalizeAppearance('auto')).toBeUndefined();
        expect(normalizeAppearance(null)).toBeUndefined();
    });

    it('sin modo forzado es el paso 1 (DD-247)', () => {
        expect(chromeColors({ boxBackgroundColor: LIGHT_BRAND }, 'light', null)).toMatchObject({ background: LIGHT_BRAND, dark: false });
        expect(chromeColors({ boxBackgroundColor: DARK_STYLE }, 'light', null)).toMatchObject({ background: DARK_STYLE, dark: true });
        expect(chromeColors({}, 'dark', null)).toMatchObject({ background: DARK_DEFAULT_BG, dark: true });
        expect(chromeColors(null, undefined, null)).toMatchObject({ background: LIGHT_DEFAULT_BG, dark: false, primary: null });
    });

    it('oscuro forzado: bloque dark, luego Style ya oscuro, luego el oscuro por defecto', () => {
        expect(chromeColors({ boxBackgroundColor: LIGHT_BRAND, dark: { boxBackgroundColor: DARK_BLOCK } }, 'light', 'dark').background).toBe(DARK_BLOCK);
        expect(chromeColors({ boxBackgroundColor: DARK_STYLE }, 'light', 'dark').background).toBe(DARK_STYLE);
        expect(chromeColors({ boxBackgroundColor: LIGHT_BRAND }, 'light', 'dark')).toMatchObject({ background: DARK_DEFAULT_BG, dark: true });
        // Un color claro en el bloque dark no se usa como fondo.
        expect(chromeColors({ dark: { boxBackgroundColor: '#FFFFFF' } }, 'light', 'dark').background).toBe(DARK_DEFAULT_BG);
    });

    it('claro forzado ignora el theme oscuro', () => {
        expect(chromeColors({}, 'dark', 'light')).toMatchObject({ background: LIGHT_DEFAULT_BG, dark: false });
        expect(chromeColors({ boxBackgroundColor: LIGHT_BRAND, dark: { boxBackgroundColor: DARK_BLOCK } }, 'dark', 'light').background).toBe(LIGHT_BRAND);
    });

    it('botones y barra en tarjeta clara y oscura', () => {
        const brand = '#E11D48';
        const style: StyleColors = {
            buttonPrimaryColor: brand,
            buttonSecondaryColor: '#334155',
            loadingBarColor: '#22C55E',
            dark: { buttonPrimaryColor: '#FDA4AF', buttonSecondaryColor: '#CBD5E1', loadingBarColor: '#86EFAC' },
        };
        expect(chromeColors(style, 'light', 'light')).toMatchObject({ primary: brand, onPrimary: '#fff', secondary: '#334155', loadingBar: '#22C55E' });
        expect(chromeColors(style, 'light', 'dark')).toMatchObject({ primary: '#FDA4AF', onPrimary: ON_LIGHT_PRIMARY, secondary: '#CBD5E1', loadingBar: '#86EFAC' });
        // Sin bloque dark: la marca; sin marca: el claro por defecto con texto oscuro.
        expect(chromeColors({ buttonPrimaryColor: '#1D4ED8' }, 'light', 'dark')).toMatchObject({ primary: '#1D4ED8', onPrimary: '#fff' });
        expect(chromeColors({}, 'light', 'dark')).toMatchObject({ primary: DARK_DEFAULT_PRIMARY, onPrimary: ON_LIGHT_PRIMARY });
        // Tarjeta clara con botón claro: blanco como siempre (sin cambios en claro).
        expect(chromeColors({ buttonPrimaryColor: '#FACC15' }, 'light', null).onPrimary).toBe('#fff');
    });

    it('el espejo ES5 da lo mismo que el módulo', () => {
        const styles: (StyleColors | null)[] = [
            null, {}, { boxBackgroundColor: LIGHT_BRAND }, { boxBackgroundColor: DARK_STYLE },
            { boxBackgroundColor: '#808080' }, { boxBackgroundColor: 'var(--x)' },
            { boxBackgroundColor: LIGHT_BRAND, buttonPrimaryColor: '#E11D48', dark: { boxBackgroundColor: DARK_BLOCK, buttonPrimaryColor: '#FDA4AF', loadingBarColor: '#86EFAC' } },
            { dark: { boxBackgroundColor: '#FFFFFF', buttonSecondaryColor: '#CBD5E1' } },
        ];
        for (const s of styles) for (const theme of ['light', 'dark', undefined]) for (const forced of [null, 'light', 'dark'] as const) {
            expect(mirror.ddChromeColors(s, theme, forced)).toEqual(chromeColors(s, theme, forced));
        }
    });
});
