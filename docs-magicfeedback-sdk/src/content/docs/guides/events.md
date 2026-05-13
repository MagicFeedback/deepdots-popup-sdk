---
title: Lifecycle events
description: Hook into the form's lifecycle to drive analytics, telemetry, and custom UX around each step.
---

`form.generate(...)` accepts four lifecycle callbacks. They cover every meaningful moment of the survey — from the first render to a back navigation, every page submit, and final completion.

```ts
await form.generate("survey-root", {
  onLoadedEvent: ({ formData, progress, total, error }) => {},
  beforeSubmitEvent: ({ progress, total }) => {},
  afterSubmitEvent: ({ response, progress, total, completed, followup, error }) => {},
  onBackEvent: ({ progress, followup, error }) => {},
});
```

## `onLoadedEvent`

Fires when the form (or its start screen) is mounted and ready to be interacted with.

```ts
onLoadedEvent: ({ formData, progress, total, error }) => {
  if (error) {
    console.error("MagicFeedback failed to load", error);
    return;
  }
  analytics.track("survey_loaded", { progress, total });
};
```

Use it to:

- Show a loader before, and hide it here.
- Send an analytics event when a survey appears.
- Reveal/animate your container once the form is in place.

## `beforeSubmitEvent`

Fires just before a page is submitted. Useful to disable buttons, capture timing, or inject extra metadata client-side before the request goes out.

```ts
beforeSubmitEvent: ({ progress, total }) => {
  analytics.track("survey_page_submitted", { page: progress, of: total });
};
```

## `afterSubmitEvent`

Fires after every page submission, including the final one. The payload tells you whether the survey is now `completed`, whether there is a `followup` page, and what the API responded with.

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

Use it to:

- Close your modal or bottom sheet on `completed`.
- Show a custom success screen (when `addSuccessScreen: false`).
- Trigger downstream actions (e.g., grant a coupon when a specific survey finishes).

## `onBackEvent`

Fires when the user navigates back to the previous page.

```ts
onBackEvent: ({ progress, followup }) => {
  analytics.track("survey_back", { progress, followup });
};
```

---

## Putting it together

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
