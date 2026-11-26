import type { PopupStyle } from '../types';

/**
 * Colocación del popup (DD-334): posición, tamaño de la tarjeta y si bloquea la página.
 * Una sola fuente para las dos rutas web (popup DOM y HTML del WebView de RN), para que no
 * puedan divergir.
 */

export type PopupPosition = PopupStyle['position'];
export type PopupSize = 'small' | 'regular';

/** Ancho máximo de la tarjeta por tamaño. `regular` es el de siempre. */
export const CARD_MAX_WIDTH_PX: Record<PopupSize, number> = {
  small: 360,
  regular: 600,
};

/** Ancho máximo de la tarjeta `small` en pantallas estrechas (móvil). */
export const SMALL_CARD_MOBILE_MAX_PX = 300;

/** Velo de la página cuando el popup la bloquea. */
export const BACKDROP_COLOR = 'rgba(0,0,0,0.5)';

export interface Placement {
  position: PopupPosition;
  size: PopupSize;
  /** El popup tapa la página con un velo y se queda con los clics. */
  blocksPage: boolean;
  justifyContent: string;
  alignItems: string;
  /** Separación de los bordes de la ventana. */
  padding: string;
  /** Fondo del contenedor a pantalla completa: el velo, o transparente. */
  background: string;
  cardMaxWidthPx: number;
}

const ALIGN: Record<PopupPosition, { justifyContent: string; alignItems: string }> = {
  center: { justifyContent: 'center', alignItems: 'center' },
  bottom: { justifyContent: 'center', alignItems: 'flex-end' },
  'bottom-right': { justifyContent: 'flex-end', alignItems: 'flex-end' },
  'bottom-left': { justifyContent: 'flex-start', alignItems: 'flex-end' },
  top: { justifyContent: 'center', alignItems: 'flex-start' },
  'top-right': { justifyContent: 'flex-end', alignItems: 'flex-start' },
  'top-left': { justifyContent: 'flex-start', alignItems: 'flex-start' },
};

function isPosition(value: unknown): value is PopupPosition {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ALIGN, value);
}

/**
 * Resuelve la colocación a partir del `style` de la API. Valores desconocidos o ausentes caen
 * al comportamiento de siempre: `center` modal, tamaño `regular`, y el resto sin bloquear.
 * `center` bloquea siempre: es un modal, no tiene sentido sin velo.
 */
export function resolvePlacement(style?: Partial<Pick<PopupStyle, 'position' | 'size' | 'blockPage'>> | null): Placement {
  const position: PopupPosition = isPosition(style?.position) ? style!.position! : 'center';
  const size: PopupSize = style?.size === 'small' ? 'small' : 'regular';
  const blocksPage = position === 'center' || style?.blockPage === true;
  const align = ALIGN[position];
  return {
    position,
    size,
    blocksPage,
    justifyContent: align.justifyContent,
    alignItems: align.alignItems,
    padding: position === 'center' ? '0' : '16px',
    background: blocksPage ? BACKDROP_COLOR : 'transparent',
    cardMaxWidthPx: CARD_MAX_WIDTH_PX[size],
  };
}
