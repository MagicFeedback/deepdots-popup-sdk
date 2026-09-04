#!/usr/bin/env node
/**
 * Re-vendoriza el CSS del survey desde @magicfeedback/native.
 *
 * El popup inyecta este CSS en el <head> de la PÁGINA DEL HOST (web) y en el <head> del
 * WebView (RN/KMP), así que la hoja del paquete no se puede usar tal cual: hay que acotar sus
 * selectores desnudos (`h2`, `p`, `input`, `select`…) para no repintar la web del cliente, y
 * quitarle el @import de Google Fonts.
 *
 * Uso: node scripts/vendor-survey-css.mjs   (tras un `npm i @magicfeedback/native@<v>`)
 *
 * Cada transformación falla si no encuentra su patrón: si el paquete reorganiza la hoja, el
 * script avisa en vez de generar un CSS a medias.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PKG = 'node_modules/@magicfeedback/native';
const SRC = `${PKG}/dist/styles/magicfeedback-default.css`;
const OUT = 'src/assets/style.css';
const SCOPE = '.deepdots-popup';

const version = JSON.parse(readFileSync(`${PKG}/package.json`, 'utf8')).version;
let css = readFileSync(SRC, 'utf8');

function replaceOnce(needle, value, what) {
    const i = css.indexOf(needle);
    if (i === -1) throw new Error(`vendor-survey-css: no encuentro "${what}". Revisa ${SRC}.`);
    if (css.indexOf(needle, i + needle.length) !== -1) throw new Error(`vendor-survey-css: "${what}" aparece más de una vez.`);
    css = css.slice(0, i) + value + css.slice(i + needle.length);
}

// 1. Fuera el @import de Google Fonts: el popup gestiona su tipografía (PopupStyle.font) y no
//    debe disparar una petición a fonts.googleapis.com desde la página del host.
const importLine = /^@import url\("https:\/\/fonts\.googleapis\.com[^"]*"\);\n/m;
if (!importLine.test(css)) throw new Error('vendor-survey-css: no encuentro el @import de Google Fonts.');
css = css.replace(importLine, '/* @import de Google Fonts (Nunito) eliminado al vendorizar: la fuente la pone el popup. */\n');

// 2. La fuente del survey la hereda del popup, y PopupStyle.font gana vía --deepdots-font.
replaceOnce(
    '.magicfeedback-container {\n    font-family: var(--mf-font-sans), sans-serif;',
    '.magicfeedback-container {\n    /* Local: hereda la fuente del popup; --deepdots-font viene de PopupStyle.font. */\n    font-family: var(--deepdots-font, inherit);',
    'font-family de .magicfeedback-container',
);

// 3. Acotar los selectores desnudos a `.deepdots-popup` para no repintar la web del host.
// Los grupos multilínea van PRIMERO: comparten la última línea (`select {`, `textarea {`) con
// las reglas de una sola, y al reescribirlos dejan una única coincidencia para estas.
const BARE = [
    'input[type="date"],\ninput[type="text"],\ninput[type="number"],\ninput[type="email"],\ninput[type="password"],\ntextarea,\nselect {',
    // dentro de @media (max-width: 768px), indentado 4
    '    input[type="date"],\n    input[type="text"],\n    input[type="number"],\n    input[type="email"],\n    input[type="password"],\n    textarea,\n    select {',
    'input::placeholder,\ntextarea::placeholder {',
    'input::-webkit-outer-spin-button,\ninput::-webkit-inner-spin-button {',
    'input.error,\nselect.error,\ntextarea.error {',
    'h2 {',
    'p {',
    'textarea {',
    'select {',
    'input[type="number"] {',
];
for (const sel of BARE) {
    const indent = sel.startsWith('    ') ? '    ' : '';
    const scoped = sel
        .split(',\n')
        .map((part) => `${indent}${SCOPE} ${part.trim()}`)
        .join(',\n');
    // Ancla en el salto de línea previo para no capturar `.magicfeedback-x select {`.
    replaceOnce(`\n${sel}`, `\n${scoped}`, `selector desnudo ${sel.split('\n')[0]}`);
}

// 4. `magicfeedback-radio` también acaba en el <input> del boolean (renderBoolean se la pone al
//    input y la devuelve como elementTypeClass del contenedor), así que la regla del grupo se
//    cualifica con el tag para no tocar el control.
replaceOnce(
    '.magicfeedback-checkbox,\n.magicfeedback-radio {',
    '.magicfeedback-checkbox,\ndiv.magicfeedback-radio {',
    'grupo .magicfeedback-radio',
);

const header = `/**
 * NO EDITAR A MANO — generado por scripts/vendor-survey-css.mjs
 *
 * Copia de @magicfeedback/native@${version} → dist/styles/magicfeedback-default.css
 * (la hoja canónica del paquete, la que apunta su campo "style"), con estos cambios locales:
 *
 *  1. Sin el @import de Google Fonts (Nunito): no queremos una petición externa desde la
 *     página del host, y la tipografía la decide el popup.
 *  2. .magicfeedback-container hereda la fuente del popup (var(--deepdots-font, inherit)).
 *  3. Los selectores desnudos (h2, p, input, textarea, select, ::placeholder, .error) van
 *     acotados a .deepdots-popup: este CSS se inyecta en el <head> del host y sin acotar
 *     repintaría su web.
 *  4. El grupo .magicfeedback-radio se cualifica como div.magicfeedback-radio (la clase acaba
 *     también en el <input> del boolean).
 *  5. Al final, un bloque de reglas propias del popup (fuente en los controles y padding del
 *     radio nativo).
 *
 * Las variables --mf-* se dejan en :root a propósito: el modal del priority-list se portea a
 * <body>, fuera de .deepdots-popup, y ahí las necesita.
 *
 * Para subir de versión: npm i @magicfeedback/native@<v> && node scripts/vendor-survey-css.mjs
 */

`;

const local = `

/* ========================================
   LOCAL — reglas del popup, no vienen del paquete
   ======================================== */

/* Los controles de formulario no heredan font-family: cuando el popup trae fuente propia
   (clase deepdots-has-font), se les fuerza la del contenedor. */
${SCOPE}.deepdots-has-font button,
${SCOPE}.deepdots-has-font input,
${SCOPE}.deepdots-has-font textarea,
${SCOPE}.deepdots-has-font select {
    font-family: var(--deepdots-font, inherit);
}

/* WebKit sí aplica el padding al radio nativo: con padding el control se dibuja enorme (se vio
   en iOS, WebView de RN y Safari, no en Chrome). El paquete ya no lo pone, pero la regla es
   barata y evita que vuelva. */
${SCOPE} input[type="radio"] {
    padding: 0;
}
`;

writeFileSync(OUT, header + css.trimEnd() + local);
console.log(`vendorizado ${SRC} (${version}) → ${OUT}`);
