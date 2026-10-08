/**
 * Foco automático en la primera pregunta de la página cuando es de escribir.
 *
 * `@magicfeedback/native` vacía el formulario y lo repinta en cada página, con un bloque
 * `.magicfeedback-div` por pregunta, así que basta con mirar el primer bloque tras cada cambio de
 * página. Solo cuenta la PRIMERA pregunta: si es de opciones y la de texto va después, no se
 * enfoca nada.
 *
 * Cuándo:
 * - `open` (el popup acaba de aparecer): solo con puntero fino (ratón/trackpad). En táctil el
 *   teclado taparía medio popup sin que el usuario haya hecho nada.
 * - `navigation` (Start, Siguiente, Atrás): en todos los dispositivos, porque el usuario acaba
 *   de pulsar y está esperando la pregunta siguiente.
 */

export type AutofocusTrigger = 'open' | 'navigation';

/**
 * Tipos de `<input>` que cuentan como "de escribir" (TEXT, EMAIL, NUMBER y los campos de
 * CONTACT). Fuera `date`, que abre un selector, y `password`.
 */
export const AUTOFOCUS_INPUT_TYPES: readonly string[] = ['text', 'email', 'number', 'tel', 'url', 'search'];

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Campo a enfocar en la página que hay en `root`, o `null` si la primera pregunta no es de escribir. */
export function findAutofocusTarget(root: ParentNode | null | undefined): TextField | null {
    if (!root) return null;
    const block = root.querySelector('.magicfeedback-div');
    if (!block) return null;
    // El primer control de la pregunta decide: en un rating con opción "Otro" el campo de texto
    // va detrás de los radios y no debe ganar.
    const control = block.querySelector('input:not([type="hidden"]), textarea, select, button');
    if (!control) return null;
    const field = control as TextField;
    if (field.disabled || field.readOnly) return null;
    if (control.tagName === 'TEXTAREA') return field;
    if (control.tagName === 'INPUT' && AUTOFOCUS_INPUT_TYPES.includes((control as HTMLInputElement).type)) return field;
    return null;
}

function hasFinePointer(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(pointer: fine)').matches;
}

function isEditable(el: Element): boolean {
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable === true;
}

/**
 * Enfoca la primera pregunta de la página si es de escribir y el momento lo permite. Devuelve
 * si ha movido el foco.
 *
 * Nunca roba el foco a un campo editable de la web del host: un popup que salta por tiempo
 * mientras el usuario escribe en un formulario de la página no le cambia el sitio del cursor.
 */
export function autofocusFirstTextQuestion(
    root: HTMLElement | null | undefined,
    trigger: AutofocusTrigger,
    finePointer: boolean = hasFinePointer(),
): boolean {
    if (!root) return false;
    if (trigger === 'open' && !finePointer) return false;
    const target = findAutofocusTarget(root);
    if (!target) return false;
    const active = root.ownerDocument?.activeElement;
    if (active && !root.contains(active) && isEditable(active)) return false;
    // Sin scroll: el campo es la primera pregunta (ya está a la vista) y en web un scroll aquí
    // movería la página del host.
    try {
        target.focus({ preventScroll: true });
    } catch {
        target.focus();
    }
    return root.ownerDocument?.activeElement === target;
}

/**
 * Espejo ES5 para el JS que corre DENTRO del WebView (React Native y KMP), que no comparte
 * módulos con el bundle. `autofocus.test.ts` lo evalúa y compara sus decisiones con las del
 * módulo, para que las dos implementaciones no se separen.
 */
export const AUTOFOCUS_JS = `
function ddAutofocusFirstTextQuestion(root, trigger){
  if(!root){ return false; }
  var fine = typeof window.matchMedia==='function' && window.matchMedia('(pointer: fine)').matches;
  if(trigger==='open' && !fine){ return false; }
  var block = root.querySelector('.magicfeedback-div');
  if(!block){ return false; }
  var control = block.querySelector('input:not([type="hidden"]), textarea, select, button');
  if(!control || control.disabled || control.readOnly){ return false; }
  var types = ${JSON.stringify(AUTOFOCUS_INPUT_TYPES)};
  var ok = control.tagName==='TEXTAREA' || (control.tagName==='INPUT' && types.indexOf(control.type)!==-1);
  if(!ok){ return false; }
  var active = document.activeElement;
  if(active && !root.contains(active)){
    var tag = active.tagName;
    if(tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT' || active.isContentEditable===true){ return false; }
  }
  try { control.focus({ preventScroll: true }); } catch(e){ control.focus(); }
  return document.activeElement===control;
}`;
