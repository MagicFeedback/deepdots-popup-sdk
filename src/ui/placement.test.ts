import { describe, it, expect, vi } from 'vitest';
import { resolvePlacement, BACKDROP_COLOR, CARD_MAX_WIDTH_PX } from './placement';
import { buildSurveyHtml } from './surveyHtml';

/**
 * DD-334: posición, tamaño y bloqueo de la página. Sin los campos nuevos todo se comporta como
 * siempre: `center` es modal con velo, el resto deja usar la página, y la tarjeta mide hasta 600px.
 */
describe('resolvePlacement', () => {
  it('keeps today’s behaviour without the new fields', () => {
    expect(resolvePlacement({ position: 'center' })).toMatchObject({ blocksPage: true, background: BACKDROP_COLOR, size: 'regular', cardMaxWidthPx: 600 });
    expect(resolvePlacement({ position: 'bottom-right' })).toMatchObject({ blocksPage: false, background: 'transparent', justifyContent: 'flex-end', alignItems: 'flex-end', padding: '16px' });
    expect(resolvePlacement(undefined).position).toBe('center');
  });

  it('falls back to center for an unknown position', () => {
    expect(resolvePlacement({ position: 'left' as never }).position).toBe('center');
  });

  it('small size narrows the card', () => {
    expect(resolvePlacement({ position: 'top-left', size: 'small' }).cardMaxWidthPx).toBe(CARD_MAX_WIDTH_PX.small);
    expect(resolvePlacement({ position: 'top-left', size: 'huge' as never }).size).toBe('regular');
  });

  it('blockPage adds the backdrop to a corner', () => {
    expect(resolvePlacement({ position: 'bottom-left', blockPage: true })).toMatchObject({ blocksPage: true, background: BACKDROP_COLOR });
  });

  it('center always blocks the page, even with blockPage false', () => {
    expect(resolvePlacement({ position: 'center', blockPage: false }).blocksPage).toBe(true);
  });
});

describe('buildSurveyHtml placement (RN WebView)', () => {
  const base = { surveyId: 's', productId: 'p', env: 'production' as const };

  it('uses the small card width', () => {
    const html = buildSurveyHtml({ ...base, position: 'bottom-right', size: 'small' });
    expect(html).toContain('max-width:360px');
    expect(html).toContain('min(300px, calc(100% - 24px))');
  });

  it('keeps 600px for regular', () => {
    expect(buildSurveyHtml({ ...base, position: 'bottom-right' })).toContain('max-width:600px');
  });

  it('paints the backdrop only when the page is blocked', () => {
    expect(buildSurveyHtml({ ...base, position: 'top', blockPage: true })).toContain(`body.dd-ready{background:${BACKDROP_COLOR}}`);
    expect(buildSurveyHtml({ ...base, position: 'top' })).toContain('body.dd-ready{background:transparent}');
  });
});

vi.mock('@magicfeedback/native', () => ({
  default: {
    init: () => {},
    form: () => ({
      progress: 0, total: 1,
      generate: (_id: string, o: { onLoadedEvent?: (a: unknown) => void }) => { o.onLoadedEvent?.({ loading: false, progress: 0, total: 1, formData: {} }); return Promise.resolve(); },
      back: () => {}, startForm: () => {}, send: () => {},
    }),
  },
}));

describe('renderPopup placement (DOM)', () => {
  async function render(style: Record<string, unknown>) {
    const { renderPopup } = await import('./renderPopup');
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderPopup(container, 's', 'p', undefined, () => {}, () => { container.innerHTML = ''; }, 'production', undefined, style as never);
    await Promise.resolve(); await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    return { container, card: container.querySelector('.deepdots-popup') as HTMLElement };
  }

  it('small card is 360px max', async () => {
    const { card } = await render({ theme: 'light', position: 'bottom-right', size: 'small' });
    expect(card.style.maxWidth).toBe('360px');
  });

  it('corner without blockPage lets clicks reach the page', async () => {
    const { container } = await render({ theme: 'light', position: 'bottom-right' });
    expect(container.style.background).toBe('transparent');
    expect(container.style.pointerEvents).toBe('none');
  });

  it('corner with blockPage keeps the clicks and shows the backdrop', async () => {
    const { container } = await render({ theme: 'light', position: 'bottom-right', blockPage: true });
    expect(container.style.background.replace(/\s/g, '')).toBe(BACKDROP_COLOR);
    expect(container.style.pointerEvents).toBe('');
  });
});
