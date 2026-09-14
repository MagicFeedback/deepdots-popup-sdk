import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Apertura diferida: el popup no se enseña con el spinner girando, se enseña ya montado.
 *
 * Medido contra producción, el spinner está en pantalla lo que tarde el JSON del survey
 * (`GET /sdk/app/{surveyId}/{key}/info`: ~250 ms de mediana desde Europa, 775 ms con el servicio
 * frío, y en cada apertura porque no manda `Cache-Control`). El feedback del cliente es esa
 * sensación. Aquí el DOM se monta invisible, se carga el survey y solo entonces se revela; el
 * techo `REVEAL_TIMEOUT_MS` evita que una red mala deje al usuario sin popup: pasado ese tiempo
 * se abre con spinner, que es el comportamiento de siempre.
 */

/** Control del mock: qué hace `generate()` (cargar, fallar o no responder nunca). */
let generateBehaviour: 'loads' | 'rejects' | 'hangs' = 'loads';
/** HTML que el survey pinta dentro de su div al cargar (para probar la espera por imágenes). */
let generatedHtml = '';
/** `formData` que el mock entrega en `onLoadedEvent` (el logo del survey viene aquí). */
let loadedFormData: Record<string, unknown> = {};
/** Callbacks que renderPopup pasa a `generate()`, para simular transiciones desde el test. */
let capturedOptions: { beforeSubmitEvent?: () => void } | null = null;

vi.mock('@magicfeedback/native', () => {
  const form = () => ({
    progress: 0,
    total: 3,
    generate: (divId: string, options: { onLoadedEvent?: (args: unknown) => void, beforeSubmitEvent?: () => void }) => {
      capturedOptions = options;
      if (generateBehaviour === 'rejects') return Promise.reject(new Error('boom'));
      if (generateBehaviour === 'hangs') return new Promise<void>(() => {});
      const host = document.getElementById(divId);
      if (host && generatedHtml) host.innerHTML = generatedHtml;
      options.onLoadedEvent?.({ loading: false, progress: 0, total: 3, formData: loadedFormData });
      return Promise.resolve();
    },
    back: () => {},
    startForm: () => {},
    send: () => {},
  });
  return { default: { init: () => {}, form } };
});

const { renderPopup, REVEAL_TIMEOUT_MS } = await import('./renderPopup');

/**
 * happy-dom no descarga imágenes y las da todas por completas, así que no habría nada que
 * esperar. Aquí `complete` pasa a depender de un atributo que el test controla, como en un
 * navegador de verdad: falsa hasta que la imagen llega.
 */
function stubImageLoading() {
  Object.defineProperty(window.HTMLImageElement.prototype, 'complete', {
    configurable: true,
    get(this: HTMLImageElement) { return this.dataset.ddLoaded === '1'; },
  });
}

/** Simula que una imagen termina de llegar (o falla, con `event: 'error'`). */
function settleImage(target: HTMLImageElement, event: 'load' | 'error' = 'load') {
  target.dataset.ddLoaded = '1';
  target.dispatchEvent(new Event(event));
}

function makeContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

async function render(container: HTMLElement) {
  await renderPopup(
    container,
    'test-survey',
    'test-product',
    undefined,
    () => {},
    () => { container.innerHTML = ''; },
    'production',
  );
  // `generate()` no se espera dentro de renderPopup: un tick para que corra onLoadedEvent.
  await Promise.resolve();
  await Promise.resolve();
}

const isHidden = (c: HTMLElement) => c.style.visibility === 'hidden';
const imageIn = (c: HTMLElement, selector: string) => c.querySelector(selector) as HTMLImageElement;

describe('renderPopup · apertura diferida', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    generateBehaviour = 'loads';
    generatedHtml = '';
    loadedFormData = {};
    stubImageLoading();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('monta el popup invisible y sin capturar clics mientras carga el survey', async () => {
    const container = makeContainer();
    generateBehaviour = 'hangs';

    await render(container);

    // El DOM está completo: lo único que falta es el survey.
    expect(container.querySelector('.deepdots-popup')).not.toBeNull();
    expect(isHidden(container)).toBe(true);
    expect(container.style.pointerEvents).toBe('none');
  });

  it('revela el popup en cuanto el survey ha cargado', async () => {
    const container = makeContainer();

    await render(container);

    expect(isHidden(container)).toBe(false);
    expect(container.style.pointerEvents).not.toBe('none');
  });

  it('espera a las imágenes del formulario antes de revelar', async () => {
    const container = makeContainer();
    // Los emojis del rating son SVG y llegan DESPUÉS del onLoadedEvent: sin esta espera el
    // popup aparece y se rellena delante del usuario.
    generatedHtml = '<img id="emoji" src="https://example.test/emoji.svg">';

    await render(container);
    expect(isHidden(container)).toBe(true);

    settleImage(imageIn(container, '#emoji'));

    expect(isHidden(container)).toBe(false);
  });

  it('espera al logo del survey, que va fuera del formulario', async () => {
    const container = makeContainer();
    // El logo se inserta sobre la barra de progreso, como hermano del header: es el que más
    // desplaza el contenido si entra con el popup ya abierto.
    loadedFormData = { style: { logo: 'https://example.test/logo.png' } };

    await render(container);
    expect(imageIn(container, '#deepdots-popup-logo')).not.toBeNull();
    expect(isHidden(container)).toBe(true);

    settleImage(imageIn(container, '#deepdots-popup-logo'));

    expect(isHidden(container)).toBe(false);
  });

  it('revela igualmente si una imagen del survey falla', async () => {
    const container = makeContainer();
    generatedHtml = '<img id="emoji" src="https://example.test/roto.svg">';

    await render(container);
    settleImage(imageIn(container, '#emoji'), 'error');

    expect(isHidden(container)).toBe(false);
  });

  it('abre con spinner si el survey tarda más que el techo de tiempo', async () => {
    vi.useFakeTimers();
    const container = makeContainer();
    generateBehaviour = 'hangs';

    await render(container);
    expect(isHidden(container)).toBe(true);

    vi.advanceTimersByTime(REVEAL_TIMEOUT_MS);

    expect(isHidden(container)).toBe(false);
    // El spinner sigue girando: el popup se abre igual, como antes de este cambio.
    const spinner = container.querySelector('.mf-spinner') as HTMLElement;
    expect(spinner.style.display).toBe('flex');
  });

  it('el techo también rescata una imagen que no llega nunca', async () => {
    vi.useFakeTimers();
    const container = makeContainer();
    generatedHtml = '<img id="emoji" src="https://example.test/colgada.svg">';

    await render(container);
    expect(isHidden(container)).toBe(true);

    vi.advanceTimersByTime(REVEAL_TIMEOUT_MS);

    expect(isHidden(container)).toBe(false);
  });

  it('revela el popup si el survey no llega a cargar', async () => {
    const container = makeContainer();
    generateBehaviour = 'rejects';

    await render(container);

    expect(isHidden(container)).toBe(false);
  });

  it('no vuelve a ocultar el popup al pasar de página dentro del survey', async () => {
    const container = makeContainer();

    await render(container);
    expect(isHidden(container)).toBe(false);

    // Enviar una página vuelve a poner el spinner: el popup ya está abierto y debe seguir a la
    // vista, el spinner entre páginas es información de progreso, no una espera de apertura.
    capturedOptions?.beforeSubmitEvent?.();

    expect(isHidden(container)).toBe(false);
  });
});
