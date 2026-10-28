// Entrada del generador de release/config.schema.json (`npm run release:schema`).
// Solo lo que viaja como datos: la configuracion de init() y las definiciones de popup
// que devuelve GET /sdk/{publicKey}/popups. Las funciones (logger, onFeedbackSession,
// storage) no tienen forma JSON y el generador las omite.
import type { DeepdotsInitParams, PopupDefinition } from '../src/types';

export interface PopupSdkConfig {
  init: DeepdotsInitParams;
  popups: PopupDefinition[];
}
