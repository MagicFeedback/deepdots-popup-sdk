---
title: Popup Definition
description: The shape of a popup as delivered by the Deepdots API. Informational — you don't build this yourself.
---

This page documents the shape of a popup as **delivered by the Deepdots API**. You do not need to build these objects in your application code — Deepdots stores them and the SDK loads them at runtime in server mode.

It is published here so that integrators can understand what arrives at the SDK and what fields drive behavior.

## Shape

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

## Fields that affect behavior

- **`triggers`** — when the popup is shown. See [Triggers](/guides/triggers/) for value semantics per trigger type.
- **`cooldown`** — how long to wait before showing again, depending on the user's progress (`SHOWED`, `PARTIAL`, `COMPLETED`).
- **`segments.path`** — list of routes where the popup is allowed to appear.
- **`style.theme` / `style.position`** — visual variant.

## Where to configure this

Popup definitions are created and edited in **Deepdots**, not in your code. The fields above are listed so that your team can understand exactly which knobs are available when configuring a popup.
