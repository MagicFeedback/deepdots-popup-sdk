import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DeepdotsPopups } from './deepdots-popups';
import { NoopPopupRenderer } from '../platform/renderer';
import { flushPopupsLoad, mockPopupsApi } from './test-helpers';
import type { PopupDefinition } from '../types';

/**
 * Fixtures "conocidos como buenos" del manifiesto de compatibilidad (MF-3241,
 * release/compatibility.json). Cada uno es una respuesta de GET /sdk/{publicKey}/popups que
 * esta version tiene que seguir mostrando; check.mjs ya comprueba que cumplen el schema de
 * configuracion, esto comprueba que el SDK los pinta.
 */

interface ManifestFixture {
  id: string;
  path: string;
  trigger: { event: string; href?: string };
}

const manifest = JSON.parse(readFileSync('release/compatibility.json', 'utf8')) as { fixtures: ManifestFixture[] };

function goTo(href: string): void {
  (window as unknown as { location: { href: string } }).location.href = href;
}

describe('fixtures del manifiesto de compatibilidad', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    goTo('http://localhost:3000/');
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(manifest.fixtures)('$id se muestra', async (fixture) => {
    const defs = JSON.parse(readFileSync(fixture.path, 'utf8')) as PopupDefinition[];
    const popups = new DeepdotsPopups();
    popups.setRenderer(new NoopPopupRenderer());
    const shown = vi.fn();
    popups.on('popup_shown', shown);
    mockPopupsApi(defs);
    popups.init({ apiKey: 'k', language: 'en' });
    await flushPopupsLoad();
    popups.autoLaunch();
    if (fixture.trigger.href) goTo(fixture.trigger.href);

    popups.triggerEvent(fixture.trigger.event);

    expect(shown).toHaveBeenCalledWith(expect.objectContaining({ surveyId: defs[0].surveyId }));
  });
});
