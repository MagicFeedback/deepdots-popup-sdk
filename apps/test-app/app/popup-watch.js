// Observa el popup del SDK desde fuera (como lo vería QA), sin depender de su API: cuándo se
// hace visible, cuándo se cierra y si enseña el error de carga. Funciona con cualquier versión
// porque solo mira el DOM que el renderer web pinta (#deepdots-popup-container).

import { lab } from './lab.js';

let visible = false;
let loadErrorShown = false;

function check() {
  const container = document.getElementById('deepdots-popup-container');
  const popup = container?.querySelector('.deepdots-popup');
  // El contenedor es `position: fixed`, así que `offsetParent` no sirve: se mira la caja pintada.
  const box = popup?.getBoundingClientRect();
  const nowVisible =
    Boolean(box && box.width > 0 && box.height > 0) &&
    getComputedStyle(container).visibility !== 'hidden' &&
    getComputedStyle(container).display !== 'none';
  if (nowVisible !== visible) {
    visible = nowVisible;
    lab.log('sdk', visible ? 'popup visible' : 'popup hidden');
  }
  const err = container?.querySelector('#dd-load-error');
  const errShown = Boolean(err) && getComputedStyle(err).display !== 'none';
  if (errShown && !loadErrorShown) lab.log('error', 'popup load error shown', err.textContent.trim());
  loadErrorShown = errShown;
}

export function watchPopup() {
  new MutationObserver(check).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden'],
  });
}

/** Para los tests: ¿hay un popup del SDK a la vista ahora mismo? */
lab.popupVisible = () => visible;
