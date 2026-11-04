/**
 * Excepción de emergencia del gate de release (DD-27). El mismo fichero en deepdots-popup-sdk y
 * deepdots-popup-mobile-native-sdk; el proceso está en docs/VERSIONING.md ("Emergency exception").
 *
 * Un check requerido en rojo o sin evidencia bloquea la release. Solo se puede publicar igualmente
 * si la PR de release tiene:
 *   - la etiqueta `release-gate-override`, puesta por alguien con permiso admin en el repo, y
 *   - una sección `## Release gate override` en la descripción con el motivo (no vacía).
 * Entonces el gate deja pasar los checks en rojo, lo dice en el log y las release notes llevan un
 * aviso con quién lo aprobó, el motivo y los checks que no estaban en verde. No hay forma de
 * saltárselo en silencio: sin PR de release, o si el commit publicado no es el probado, no hay
 * excepción posible.
 */

export const OVERRIDE_LABEL = 'release-gate-override';
const SECTION = /^##\s+Release gate override\s*$/im;

/** El motivo: el texto de la sección `## Release gate override` hasta el siguiente `## `. */
export function overrideReasonFrom(body = '') {
  const text = String(body ?? '');
  const m = SECTION.exec(text);
  if (!m) return '';
  const rest = text.slice(m.index + m[0].length);
  const end = rest.search(/^##\s/m);
  return (end < 0 ? rest : rest.slice(0, end)).replace(/<!--[\s\S]*?-->/g, '').trim();
}

/** Quién puso la etiqueta por última vez (si sigue puesta), de los eventos de la issue/PR. */
export function labelledBy(events = [], labels = []) {
  if (!labels.some((l) => (l?.name ?? l) === OVERRIDE_LABEL)) return null;
  const last = events.filter((e) => e.event === 'labeled' && e.label?.name === OVERRIDE_LABEL).at(-1);
  return last ? { login: last.actor?.login ?? null, at: last.created_at ?? null } : null;
}

/**
 * Decide si la excepción vale. `permission` = el permiso en el repo de quien puso la etiqueta.
 * Devuelve {granted, by, at, reason, problems}.
 */
export function evaluateOverride({ pr, events, permission }) {
  const by = labelledBy(events, pr?.labels ?? []);
  if (!by) return { granted: false, problems: [] };
  const reason = overrideReasonFrom(pr?.body);
  const problems = [];
  if (!by.login) problems.push(`no sé quién puso la etiqueta ${OVERRIDE_LABEL}`);
  else if (permission !== 'admin') problems.push(`la etiqueta ${OVERRIDE_LABEL} la puso ${by.login} (permiso ${permission ?? 'desconocido'}), y solo vale de un admin del repo`);
  if (!reason) problems.push('falta el motivo: sección "## Release gate override" en la descripción de la PR');
  return { granted: problems.length === 0, by: by.login, at: by.at, reason, problems };
}

/** Aviso para las release notes de una versión publicada con la excepción. */
export function overrideNotes({ by, at, reason, pr, failing }) {
  return [
    '',
    '## ⚠️ Published with a release gate override',
    '',
    `Required checks that were not green: ${failing.join('; ')}.`,
    `Approved by @${by}${at ? ` on ${at.slice(0, 10)}` : ''} on the release pull request #${pr}.`,
    '',
    `Reason: ${reason.replace(/\s+/g, ' ')}`,
    '',
  ].join('\n');
}
