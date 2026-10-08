import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { autofocusFirstTextQuestion, findAutofocusTarget, AUTOFOCUS_JS, type AutofocusTrigger } from './autofocus';

/**
 * Foco automático en la primera pregunta de la página cuando es de escribir.
 *
 * `@magicfeedback/native` vacía el formulario y lo repinta en cada página, con un bloque
 * `.magicfeedback-div` por pregunta. Solo cuenta la PRIMERA pregunta: si es de opciones y la
 * de texto va después, no se enfoca nada (el usuario empieza por arriba).
 */

/** Monta una página con una pregunta por cada `inner` (el marcado del control). */
function page(...inners: string[]): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = inners
    .map((inner) => `<div class="magicfeedback-div"><label class="magicfeedback-label">Q</label>${inner}</div>`)
    .join('');
  document.body.appendChild(root);
  return root;
}

describe('findAutofocusTarget', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it.each([
    ['texto', '<input type="text" class="magicfeedback-text">'],
    ['texto largo', '<textarea class="magicfeedback-longtext"></textarea>'],
    ['email', '<input type="email" class="magicfeedback-email">'],
    ['número', '<input type="number" class="magicfeedback-number">'],
  ])('elige la primera pregunta si es de %s', (_name, inner) => {
    const root = page(inner);
    expect(findAutofocusTarget(root)).toBe(root.querySelector('input, textarea'));
  });

  it('en CONTACT (varios campos anidados) elige el primero', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="magicfeedback-div"><label>Contacto</label>
        <div class="magicfeedback-div"><input type="text" id="name"></div>
        <div class="magicfeedback-div"><input type="email" id="mail"></div>
      </div>`;
    expect(findAutofocusTarget(root)?.id).toBe('name');
  });

  it.each([
    ['rating / radio', '<div class="magicfeedback-radio"><input type="radio" name="r"><input type="radio" name="r"></div>'],
    ['fecha (abre selector)', '<input type="date">'],
    ['contraseña', '<input type="password">'],
    ['select', '<select><option>a</option></select>'],
    ['info page (sin control)', '<p>Solo texto</p>'],
  ])('no elige nada si la primera pregunta es %s', (_name, inner) => {
    const root = page(inner, '<input type="text">');
    expect(findAutofocusTarget(root)).toBeNull();
  });

  it('una opción "Otro" con campo de texto dentro del rating no cuenta: el primer control es el radio', () => {
    const root = page('<input type="radio" name="r"><input type="text" class="magicfeedback-extra">');
    expect(findAutofocusTarget(root)).toBeNull();
  });

  it('ignora un campo deshabilitado o de solo lectura', () => {
    expect(findAutofocusTarget(page('<input type="text" disabled>'))).toBeNull();
    expect(findAutofocusTarget(page('<textarea readonly></textarea>'))).toBeNull();
  });

  it('sin preguntas (pantalla de bienvenida, de fin) no elige nada', () => {
    expect(findAutofocusTarget(page())).toBeNull();
    expect(findAutofocusTarget(null)).toBeNull();
  });
});

describe('autofocusFirstTextQuestion', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('al abrir, enfoca solo con puntero fino (escritorio)', () => {
    const root = page('<input type="text">');
    expect(autofocusFirstTextQuestion(root, 'open', false)).toBe(false);
    expect(document.activeElement).not.toBe(root.querySelector('input'));

    expect(autofocusFirstTextQuestion(root, 'open', true)).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('input'));
  });

  it('tras navegar, enfoca también en táctil (el usuario acaba de pulsar)', () => {
    const root = page('<textarea></textarea>');
    expect(autofocusFirstTextQuestion(root, 'navigation', false)).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('textarea'));
  });

  it('no roba el foco a un campo de la web del host', () => {
    const hostInput = document.createElement('input');
    document.body.appendChild(hostInput);
    hostInput.focus();
    const root = page('<input type="text">');

    expect(autofocusFirstTextQuestion(root, 'open', true)).toBe(false);
    expect(document.activeElement).toBe(hostInput);
  });

  it('sí lo mueve desde un botón del host (p. ej. el que disparó el popup) o desde el propio popup', () => {
    const hostButton = document.createElement('button');
    document.body.appendChild(hostButton);
    hostButton.focus();
    const root = page('<input type="text">');
    expect(autofocusFirstTextQuestion(root, 'open', true)).toBe(true);

    // Página siguiente con el foco en un campo del propio popup (la respuesta anterior).
    root.innerHTML = '<div class="magicfeedback-div"><textarea></textarea></div>';
    const prev = document.createElement('input');
    root.appendChild(prev);
    prev.focus();
    expect(autofocusFirstTextQuestion(root, 'navigation', false)).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('textarea'));
  });

  it('no hace nada si la primera pregunta no es de escribir', () => {
    const root = page('<input type="radio">', '<input type="text">');
    expect(autofocusFirstTextQuestion(root, 'navigation', true)).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });
});

describe('AUTOFOCUS_JS · espejo para el WebView', () => {
  let original: typeof window.matchMedia;
  beforeEach(() => { document.body.innerHTML = ''; original = window.matchMedia; });
  afterEach(() => { window.matchMedia = original; });

  function load() {
    return new Function(`${AUTOFOCUS_JS}; return ddAutofocusFirstTextQuestion;`)() as
      (root: HTMLElement, trigger: AutofocusTrigger) => boolean;
  }

  function pointer(fine: boolean) {
    window.matchMedia = ((q: string) => ({ matches: fine && q === '(pointer: fine)', media: q })) as unknown as typeof window.matchMedia;
  }

  it.each([
    ['open', true, '<input type="text">'],
    ['open', false, '<input type="text">'],
    ['navigation', false, '<textarea></textarea>'],
    ['navigation', true, '<input type="radio">'],
    ['navigation', false, '<input type="date">'],
  ] as const)('decide igual que el módulo (%s, fino=%s, %s)', (trigger, fine, inner) => {
    pointer(fine);
    const a = page(inner);
    const b = page(inner);
    const fromWebView = load()(a, trigger);
    document.body.focus();
    (document.activeElement as HTMLElement | null)?.blur();
    const fromModule = autofocusFirstTextQuestion(b, trigger);
    expect(fromWebView).toBe(fromModule);
  });

  it('respeta el campo del host igual que el módulo', () => {
    pointer(true);
    const hostInput = document.createElement('input');
    document.body.appendChild(hostInput);
    hostInput.focus();
    expect(load()(page('<input type="text">'), 'open')).toBe(false);
    expect(document.activeElement).toBe(hostInput);
  });
});
