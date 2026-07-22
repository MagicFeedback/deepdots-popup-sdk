/**
 * Resolución del idioma para el context de analytics.
 *
 * Prioridad: idioma explícito del host > `navigator.language` (web) > locale de `Intl`
 * (fallback automático que funciona en React Native con Hermes, donde `navigator.language`
 * no existe). Si nada resuelve, devuelve `undefined` y el campo se omite del metadata.
 */

/** Forma mínima de `Intl` que necesitamos (inyectable para tests / entornos sin Intl). */
export interface IntlLike {
  DateTimeFormat: () => { resolvedOptions: () => { locale?: string } };
}

export interface LanguageSources {
  /** Idioma forzado por el host (init.language). Máxima prioridad. */
  explicit?: string;
  /** `navigator` global (web). En RN suele no tener `language`. */
  navigator?: { language?: string };
  /** `Intl` global. Fallback cross-platform (web + RN/Hermes). */
  intl?: IntlLike;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveLanguage(sources: LanguageSources): string | undefined {
  const explicit = clean(sources.explicit);
  if (explicit) return explicit;

  const navLang = clean(sources.navigator?.language);
  if (navLang) return navLang;

  try {
    const locale = clean(sources.intl?.DateTimeFormat().resolvedOptions().locale);
    if (locale) return locale;
  } catch {
    /* Intl no disponible o falló: se ignora */
  }

  return undefined;
}
