import { describe, it, expect, beforeEach } from 'vitest';
import { insertPopupLogo } from './logo';

/**
 * El orden importa: el logo es lo primero de la tarjeta después del header, y la barra de
 * progreso queda debajo (pegada a la pregunta). Antes se insertaba dentro del contenido, así que
 * la barra salía por encima del logo.
 */
function makePopup() {
  document.body.innerHTML = '';
  const popup = document.createElement('div');
  popup.id = 'dd-popup';
  const header = document.createElement('div');
  header.id = 'dd-header';
  const progress = document.createElement('div');
  progress.id = 'dd-progress';
  const content = document.createElement('div');
  content.id = 'dd-content';
  popup.append(header, progress, content);
  document.body.appendChild(popup);
  return { popup, progress };
}

const ids = (popup: HTMLElement) => Array.from(popup.children).map((el) => el.id);

describe('insertPopupLogo', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('inserta el logo entre el header y la barra de progreso', () => {
    const { popup, progress } = makePopup();
    const img = insertPopupLogo(popup, progress, { logo: 'https://x.com/l.png' }, 'dd-logo');

    expect(img).not.toBeNull();
    expect(ids(popup)).toEqual(['dd-header', 'dd-logo', 'dd-progress', 'dd-content']);
    expect(img!.src).toBe('https://x.com/l.png');
    expect(img!.alt).toBe('Logo');
  });

  it('sin logo en el estilo no toca el DOM', () => {
    const { popup, progress } = makePopup();
    expect(insertPopupLogo(popup, progress, {}, 'dd-logo')).toBeNull();
    expect(insertPopupLogo(popup, progress, undefined, 'dd-logo')).toBeNull();
    expect(ids(popup)).toEqual(['dd-header', 'dd-progress', 'dd-content']);
  });

  it('no duplica: una segunda llamada con el mismo id es no-op', () => {
    const { popup, progress } = makePopup();
    insertPopupLogo(popup, progress, { logo: 'a.png' }, 'dd-logo');
    expect(insertPopupLogo(popup, progress, { logo: 'b.png' }, 'dd-logo')).toBeNull();
    expect(popup.querySelectorAll('#dd-logo').length).toBe(1);
  });

  it('logoSize mapea a max-height', () => {
    const cases: [string, string][] = [['small', '30px'], ['medium', '50px'], ['large', '70px']];
    for (const [logoSize, expected] of cases) {
      const { popup, progress } = makePopup();
      const img = insertPopupLogo(popup, progress, { logo: 'a.png', logoSize }, 'dd-logo');
      expect(img!.style.maxHeight).toBe(expected);
    }
    // Valor desconocido: se queda con el default de 40px.
    const { popup, progress } = makePopup();
    const img = insertPopupLogo(popup, progress, { logo: 'a.png', logoSize: 'huge' }, 'dd-logo');
    expect(img!.style.maxHeight).toBe('40px');
  });

  it('logoPosition alinea sin hueco inferior (lo pone el bloque siguiente)', () => {
    const left = insertPopupLogo(makePopup().popup, document.getElementById('dd-progress'), { logo: 'a.png', logoPosition: 'left' }, 'dd-logo');
    expect(left!.style.marginBottom).toBe('0px');
    expect(left!.style.marginTop).toBe('12px');
    expect(left!.style.marginLeft).toBe('0px');

    const right = insertPopupLogo(makePopup().popup, document.getElementById('dd-progress'), { logo: 'a.png', logoPosition: 'right' }, 'dd-logo');
    expect(right!.style.marginLeft).toBe('auto');
    expect(right!.style.marginBottom).toBe('0px');

    const center = insertPopupLogo(makePopup().popup, document.getElementById('dd-progress'), { logo: 'a.png', logoPosition: 'center' }, 'dd-logo');
    expect(center!.style.marginLeft).toBe('auto');
    expect(center!.style.marginRight).toBe('auto');

    // Sin posición: bloque alineado a la izquierda, mismo hueco superior.
    const none = insertPopupLogo(makePopup().popup, document.getElementById('dd-progress'), { logo: 'a.png' }, 'dd-logo');
    expect(none!.style.display).toBe('block');
    expect(none!.style.marginTop).toBe('12px');
    expect(none!.style.marginBottom).toBe('0px');
  });
});
