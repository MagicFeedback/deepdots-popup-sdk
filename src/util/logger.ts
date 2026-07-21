import type { DeepdotsLogger } from '../types';

/**
 * Logger de módulo compartido: el core lo fija en init() con el logger inyectado
 * por el host (o `console` por defecto), y los módulos que no reciben `this`
 * (renderPopup, renderers) enrutan por aquí. `warn`/`error` caen a `log` si el
 * logger del host no los provee (solo `log` es obligatorio en DeepdotsLogger).
 */
let active: DeepdotsLogger = console;

export function setLogger(logger: DeepdotsLogger | undefined): void {
  active = logger ?? console;
}

export function sdkLog(...args: unknown[]): void {
  active.log(...args);
}

export function sdkWarn(...args: unknown[]): void {
  (active.warn ?? active.log)(...args);
}

export function sdkError(...args: unknown[]): void {
  (active.error ?? active.log)(...args);
}
