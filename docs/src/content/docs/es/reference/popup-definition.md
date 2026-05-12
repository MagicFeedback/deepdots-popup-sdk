---
title: Popup Definition
description: Estructura de un popup tal y como la entrega la API de Deepdots. Informativa — no la construyes tú.
---

Esta página documenta la estructura de un popup **tal y como la entrega la API de Deepdots**. No necesitas construir estos objetos en tu código — Deepdots los almacena y el SDK los carga en tiempo de ejecución en modo server.

Se publica aquí para que los integradores puedan entender qué llega al SDK y qué campos determinan el comportamiento.

## Estructura

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

## Campos que afectan al comportamiento

- **`triggers`** — cuándo se muestra el popup. Consulta [Triggers](/es/guides/triggers/) para la semántica de `value` por tipo.
- **`cooldown`** — cuánto esperar antes de mostrarlo de nuevo, según el progreso del usuario (`SHOWED`, `PARTIAL`, `COMPLETED`).
- **`segments.path`** — lista de rutas donde el popup puede aparecer.
- **`style.theme` / `style.position`** — variante visual.

## Dónde se configura esto

Las definiciones de popup se crean y editan en **Deepdots**, no en tu código. Los campos de arriba se listan para que tu equipo entienda exactamente qué palancas hay disponibles al configurar un popup.
