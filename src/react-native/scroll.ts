/**
 * Scroll en React Native (contrato de detección automática, paso 2): el `onScroll` de un
 * `ScrollView`/`FlatList` trae las medidas, no un porcentaje. Sin imports de React Native para
 * poder probarlo sin runtime (el componente vive en `./index.tsx`).
 */

/** Lo que el SDK lee de `NativeSyntheticEvent<NativeScrollEvent>`. */
export interface ScrollEventLike {
  nativeEvent?: {
    contentOffset?: { y?: number };
    contentSize?: { height?: number };
    layoutMeasurement?: { height?: number };
  };
}

/**
 * % del contenido recorrido (0–100), como el trigger `scroll` de web. Un contenido que cabe
 * entero en pantalla cuenta como 100 %. Null si el evento no trae las medidas.
 */
export function scrollPercentFromEvent(event: ScrollEventLike | null | undefined): number | null {
  const e = event?.nativeEvent;
  const y = e?.contentOffset?.y;
  const content = e?.contentSize?.height;
  const layout = e?.layoutMeasurement?.height;
  if (typeof y !== 'number' || typeof content !== 'number' || typeof layout !== 'number') return null;
  const scrollable = content - layout;
  if (scrollable <= 0) return 100;
  return Math.min(100, Math.max(0, (y / scrollable) * 100));
}
