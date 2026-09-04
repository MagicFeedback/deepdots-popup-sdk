/**
 * Logo del popup (viene en `formData.style` del survey, no del `init`).
 *
 * Vive encima de la barra de progreso, como hermano del header: la marca abre la tarjeta y el
 * progreso queda pegado a la pregunta. Antes se insertaba DENTRO del contenido (web) o del área
 * scrollable (WebView de RN), así que la barra quedaba por encima del logo y en RN el logo se
 * iba con el scroll.
 *
 * El hueco inferior lo pone el bloque siguiente (`.deepdots-progress` cuando se ve, o el
 * `padding-top` del contenido cuando no), así que aquí solo se separa del header.
 */
export interface PopupLogoStyle {
    logo?: string;
    logoSize?: string;
    logoPosition?: string;
}

const BASE_CSS = 'max-height:40px; max-width:100%; object-fit:contain; display:block; margin:12px 0 0 0;';

const MAX_HEIGHT: Record<string, string> = {
    small: '30px',
    medium: '50px',
    large: '70px',
};

/**
 * Inserta el logo en `parent`, justo antes de `anchor` (la barra de progreso).
 * No-op si el estilo no trae logo o si ya existe uno con ese `id`.
 */
export function insertPopupLogo(
    parent: HTMLElement,
    anchor: HTMLElement | null,
    style: PopupLogoStyle | undefined,
    id: string,
): HTMLImageElement | null {
    if (!style?.logo) return null;
    if (parent.ownerDocument.getElementById(id)) return null;

    const img = parent.ownerDocument.createElement('img');
    img.id = id;
    img.src = style.logo;
    img.alt = 'Logo';
    img.style.cssText = BASE_CSS;

    if (style.logoSize && MAX_HEIGHT[style.logoSize]) {
        img.style.maxHeight = MAX_HEIGHT[style.logoSize];
    }
    switch (style.logoPosition) {
        case 'left':
            img.style.margin = '12px 16px 0 0';
            img.style.marginLeft = '0';
            break;
        case 'right':
            img.style.margin = '12px 0 0 16px';
            img.style.marginLeft = 'auto';
            break;
        case 'center':
            img.style.margin = '12px auto 0 auto';
            break;
    }

    parent.insertBefore(img, anchor);
    return img;
}
