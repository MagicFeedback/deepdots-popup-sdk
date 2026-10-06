import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * En pantallas táctiles WebKit deja `:hover` "pegado" en el último punto tocado. Dentro del
 * WebView (RN/KMP) el botón Send es nativo, así que el último toque del WebView suele ser una
 * opción o el campo de texto de la página anterior: al pintarse la página siguiente, la opción
 * que cae en ese punto hereda el hover (borde de marca + fondo gris) y parece seleccionada sin
 * estarlo. Por eso todo `:hover` del CSS vendorizado va detrás de `@media (hover: hover)`.
 */
const css = readFileSync(resolve(__dirname, '../assets/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Selectores de cada regla con la lista de at-rules que la envuelven. */
function rules(source: string): Array<{ selector: string; parents: string[] }> {
    const out: Array<{ selector: string; parents: string[] }> = [];
    const stack: string[] = [];
    let start = 0;
    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        if (c === '{') {
            const prelude = source.slice(start, i).trim();
            if (!prelude.startsWith('@')) out.push({ selector: prelude, parents: [...stack] });
            stack.push(prelude);
            start = i + 1;
        } else if (c === '}') {
            stack.pop();
            start = i + 1;
        } else if (c === ';') {
            start = i + 1;
        }
    }
    return out;
}

describe('CSS vendorizado del survey: hover solo con puntero que lo soporte', () => {
    const all = rules(css);
    const hover = all.filter((r) => r.selector.includes(':hover'));

    it('tiene reglas :hover (si no, el test no protege nada)', () => {
        expect(hover.length).toBeGreaterThan(10);
    });

    it('toda regla :hover va dentro de @media (hover: hover)', () => {
        const unguarded = hover.filter((r) => !r.parents.some((p) => /@media\s*\(hover:\s*hover\)/.test(p)));
        expect(unguarded.map((r) => r.selector)).toEqual([]);
    });

    it('los grupos :hover + :focus conservan el :focus fuera del media (teclado en táctil)', () => {
        const focusRules = all.filter(
            (r) => /:focus/.test(r.selector) && r.parents.every((p) => !/hover:\s*hover/.test(p)),
        );
        const selectors = focusRules.map((r) => r.selector.replace(/\s+/g, ' '));
        expect(selectors).toContain('.magicfeedback-modal-close:focus');
        expect(selectors).toContain('.magicfeedback-upload-remove:focus-visible');
    });

    it('el estado seleccionado del boolean NO depende de hover', () => {
        const checked = all.find((r) =>
            r.selector.includes('.magicfeedback-boolean-option input[type="radio"]:checked + label'),
        );
        expect(checked?.parents).toEqual([]);
    });
});
