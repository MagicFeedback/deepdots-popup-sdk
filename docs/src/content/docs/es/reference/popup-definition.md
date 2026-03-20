---
title: Popup Definition
description: Esquema actual de PopupDefinition y notas de comportamiento.
---

## Forma actual

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
    accept?: {
      label: string;
      surveyId: string;
    };
    start?: {
      label: string;
    };
    back?: {
      label: string;
      cooldownDays?: number;
    };
    complete?: {
      label: string;
      surveyId: string;
      autoCompleteParams: Record<string, unknown>;
      cooldownDays?: number;
    };
    decline?: {
      label: string;
      cooldownDays?: number;
    };
  };
  surveyId: string;
  productId: string;
  style?: {
    theme: 'light' | 'dark';
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
    imageUrl: string | null;
  };
  segments?: {
    path?: string[];
    [key: string]: unknown;
  };
}
```

## Notas reales de runtime

- `segments.path` es el unico segmento que se evalua hoy.
- `title`, `message` y `style` forman parte del contrato, pero el renderer web actual no los pinta como layout independiente.
- `actions.decline` se acepta en la definicion, pero el renderer web actual no muestra un boton dedicado de decline ni aplica `decline.cooldownDays`.

## Ejemplo completo

```ts
const popupDefinition = {
  id: 'popup-home-5s',
  title: 'Help us improve',
  message: '<p>Thanks for visiting our homepage.</p>',
  triggers: [{ type: 'time_on_page', value: 5 }],
  cooldown: [
    { answered: 'SHOWED', cooldownDays: 7 },
    { answered: 'COMPLETED', cooldownDays: 30 },
  ],
  actions: {
    accept: {
      label: 'Open survey',
      surveyId: 'survey-home-001',
    },
  },
  surveyId: 'survey-home-001',
  productId: 'product-main',
  segments: {
    path: ['/', '/pricing', '/#/home'],
  },
};
```
