---
title: Popup Definition
description: Current PopupDefinition shape and runtime behavior notes.
---

## Current shape

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

## Actual runtime notes

- `segments.path` is the only segment evaluated today.
- `title`, `message`, and `style` are part of the contract, but the current web renderer does not render them as independent layout.
- `actions.decline` is accepted in the definition, but the current web renderer does not show a dedicated decline button or apply `decline.cooldownDays`.

## Full example

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
