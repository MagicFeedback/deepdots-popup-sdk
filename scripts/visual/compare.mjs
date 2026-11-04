/**
 * Comparación píxel a píxel de una captura con su referencia aprobada (DD-28).
 *
 * Portado de MagicSurvey `monitoring/visual/compare.ts` (MF-3180), con una diferencia: aquí el
 * límite es un NÚMERO de píxeles, no una proporción. Las capturas son del viewport entero y el
 * popup ocupa una parte; con un 0,2 % de 1280×860 (2.200 px) un botón que se mueve unos píxeles
 * pasaría. El umbral sale de medir el ruido real entre ejecuciones (ver visual/README.md).
 *
 * - `threshold`: distancia de color por píxel (YIQ de pixelmatch, 0-1). 0,01 = cualquier cambio
 *   visible de color cuenta; los píxeles de antialiasing no (como en Playwright).
 * - Un cambio de tamaño de la imagen es siempre diferencia: las dos se ponen sobre un lienzo del
 *   tamaño de la mayor y lo que solo cubre una se pinta en magenta.
 *
 * ⚠️ Este fichero es el MISMO en deepdots-popup-sdk y en deepdots-popup-mobile-native-sdk.
 */
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export const DEFAULT_COMPARE = { maxDiffPixels: 0, threshold: 0.01 };

function pad(png, width, height) {
  if (png.width === width && png.height === height) return png.data;
  const out = Buffer.alloc(width * height * 4); // negro transparente fuera de la imagen
  for (let y = 0; y < png.height; y++) png.data.copy(out, y * width * 4, y * png.width * 4, (y + 1) * png.width * 4);
  return out;
}

/**
 * @param {Buffer} expected PNG de referencia
 * @param {Buffer} actual   PNG de esta ejecución
 * @param {{maxDiffPixels:number, threshold:number}} [options]
 */
export function comparePng(expected, actual, options = DEFAULT_COMPARE) {
  const a = PNG.sync.read(expected);
  const b = PNG.sync.read(actual);
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const output = new PNG({ width, height });

  pixelmatch(pad(a, width, height), pad(b, width, height), output.data, width, height, {
    threshold: options.threshold,
    includeAA: false,
    alpha: 0.2,
    diffMask: false,
  });

  // Se cuentan aquí y no con lo que devuelve pixelmatch: el área que solo cubre una captura se
  // cuenta una vez, y los píxeles de antialiasing (amarillos) no cuentan.
  let diffPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inA = x < a.width && y < a.height;
      const inB = x < b.width && y < b.height;
      const i = (y * width + x) * 4;
      let differs;
      if (inA !== inB) {
        differs = true;
        output.data[i] = 255;
        output.data[i + 1] = 0;
        output.data[i + 2] = 255;
        output.data[i + 3] = 255;
      } else {
        // pixelmatch pinta en rojo puro (255, 0, 0) los píxeles distintos.
        differs = output.data[i] === 255 && output.data[i + 1] === 0 && output.data[i + 2] === 0;
      }
      if (differs) {
        diffPixels++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const sizeChanged = a.width !== b.width || a.height !== b.height;
  return {
    match: !sizeChanged && diffPixels <= options.maxDiffPixels,
    sizeChanged,
    diffPixels,
    totalPixels: width * height,
    expectedSize: { width: a.width, height: a.height },
    actualSize: { width: b.width, height: b.height },
    /** Caja que engloba todos los píxeles distintos (px de la captura); null si no hay. */
    region: maxX >= 0 ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
    /** Rojo donde difieren, sobre una copia desvaída de la referencia. */
    diff: diffPixels ? PNG.sync.write(output) : null,
  };
}

/**
 * Pinta rectángulos opacos (máscara de partes dinámicas) sobre un PNG. Mismo color que el
 * monitor de MagicSurvey (#FF00FF) para que en la evidencia se vea qué se ha tapado.
 * @param {Buffer} png
 * @param {{x:number,y:number,width:number,height:number}[]} rects en píxeles de la imagen
 */
export function maskPng(png, rects) {
  if (!rects?.length) return png;
  const img = PNG.sync.read(png);
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x));
    const y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(img.width, Math.ceil(r.x + r.width));
    const y1 = Math.min(img.height, Math.ceil(r.y + r.height));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * img.width + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 0;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
  }
  return PNG.sync.write(img);
}
