---
title: Popup Definition
description: Strukturen for en popup, som den leveres af Deepdots-API'en. Informativ — du bygger den ikke selv.
---

Denne side dokumenterer strukturen for en popup, **som den leveres af Deepdots-API'en**. Du behøver ikke at bygge disse objekter i din applikationskode — Deepdots opbevarer dem, og SDK'et indlæser dem i runtime i server mode.

Den er offentliggjort her, så integratorer kan forstå, hvad der ankommer til SDK'et, og hvilke felter der styrer adfærden.

## Struktur

```ts
interface PopupDefinition {
  id: string;
  title: string;
  message: string;
  triggers: Array<{
    type: 'time_on_page' | 'scroll' | 'exit' | 'click' | 'event';
    value: number | string;
  }>;
  cooldown?: Array<{
    answered: 'SHOWED' | 'PARTIAL' | 'COMPLETED';
    cooldownDays: number;
  }>;
  actions?: {
    accept?:   { label: string; surveyId: string };
    start?:    { label: string };
    back?:     { label: string; cooldownDays?: number };
    complete?: { label: string; surveyId: string; autoCompleteParams: Record<string, unknown>; cooldownDays?: number };
    decline?:  { label: string; cooldownDays?: number };
  };
  surveyId: string;
  productId: string;
  style?: {
    theme: 'light' | 'dark';
    position: 'bottom' | 'bottom-right' | 'bottom-left' | 'top' | 'top-right' | 'top-left' | 'center';
  };
  segments?: {
    path?: string[];
  };
}
```

## Felter der påvirker adfærd

- **`triggers`** — hvornår popup'en vises. Se [Triggers](/da/guides/triggers/) for `value`-semantik pr. trigger-type.
- **`cooldown`** — hvor længe der skal ventes, før popup'en vises igen, afhængigt af brugerens fremskridt (`SHOWED`, `PARTIAL`, `COMPLETED`).
- **`segments.path`** — liste over ruter, hvor popup'en må vises.
- **`style.theme` / `style.position`** — visuel variant.

## Hvor konfigureres dette

Popup-definitioner oprettes og redigeres i **Deepdots**, ikke i din kode. Felterne ovenfor er listet, så dit team kan forstå præcis, hvilke knapper der er tilgængelige, når en popup konfigureres.
