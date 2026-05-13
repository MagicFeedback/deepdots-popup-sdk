---
title: Eventos de ciclo de vida
description: Engancha el ciclo de vida del formulario para llevar analítica, telemetría y UX personalizada en cada paso.
---

`form.generate(...)` acepta cuatro callbacks de ciclo de vida. Cubren cada momento relevante de la encuesta — desde el primer render hasta una navegación atrás, cada envío de página y la finalización.

```ts
await form.generate("survey-root", {
  onLoadedEvent: ({ formData, progress, total, error }) => {},
  beforeSubmitEvent: ({ progress, total }) => {},
  afterSubmitEvent: ({ response, progress, total, completed, followup, error }) => {},
  onBackEvent: ({ progress, followup, error }) => {},
});
```

## `onLoadedEvent`

Se dispara cuando el formulario (o su pantalla de inicio) está montado y listo para interactuar.

```ts
onLoadedEvent: ({ formData, progress, total, error }) => {
  if (error) {
    console.error("MagicFeedback failed to load", error);
    return;
  }
  analytics.track("survey_loaded", { progress, total });
};
```

Útil para:

- Mostrar un loader antes y ocultarlo aquí.
- Enviar un evento de analítica cuando aparece una encuesta.
- Revelar/animar tu contenedor una vez que el formulario está colocado.

## `beforeSubmitEvent`

Se dispara justo antes de enviar una página. Útil para deshabilitar botones, capturar timings o inyectar metadata extra en cliente antes de que salga la petición.

```ts
beforeSubmitEvent: ({ progress, total }) => {
  analytics.track("survey_page_submitted", { page: progress, of: total });
};
```

## `afterSubmitEvent`

Se dispara tras cada envío de página, incluido el final. El payload te dice si la encuesta ahora está `completed`, si hay una `followup` y qué respondió la API.

```ts
afterSubmitEvent: ({ response, progress, total, completed, followup, error }) => {
  if (error) {
    analytics.track("survey_submit_failed", { error });
    return;
  }
  if (completed) {
    analytics.track("survey_completed", { total });
    return;
  }
  if (followup) {
    analytics.track("survey_followup_shown", { progress });
  }
};
```

Útil para:

- Cerrar tu modal o bottom sheet cuando `completed`.
- Mostrar una pantalla de éxito propia (con `addSuccessScreen: false`).
- Disparar acciones siguientes (p. ej. conceder un cupón al terminar una encuesta concreta).

## `onBackEvent`

Se dispara cuando el usuario navega a la página anterior.

```ts
onBackEvent: ({ progress, followup }) => {
  analytics.track("survey_back", { progress, followup });
};
```

---

## Todo junto

```ts
const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");

await form.generate("survey-root", {
  addButton: true,
  addSuccessScreen: true,
  onLoadedEvent: () => analytics.track("survey_loaded"),
  beforeSubmitEvent: ({ progress }) => analytics.track("survey_step", { progress }),
  afterSubmitEvent: ({ completed }) => {
    if (completed) {
      analytics.track("survey_completed");
      closeFeedbackModal();
    }
  },
  onBackEvent: ({ progress }) => analytics.track("survey_back", { progress }),
});
```
