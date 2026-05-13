---
title: Livscyklus-events
description: Hægt dig på formularens livscyklus for analytics, telemetri og brugerdefineret UX omkring hvert trin.
---

`form.generate(...)` accepterer fire livscyklus-callbacks. De dækker hvert meningsfuldt øjeblik af undersøgelsen — fra første render til en tilbage-navigation, hver sideindsendelse og endelig færdiggørelse.

```ts
await form.generate("survey-root", {
  onLoadedEvent: ({ formData, progress, total, error }) => {},
  beforeSubmitEvent: ({ progress, total }) => {},
  afterSubmitEvent: ({ response, progress, total, completed, followup, error }) => {},
  onBackEvent: ({ progress, followup, error }) => {},
});
```

## `onLoadedEvent`

Fyrer når formularen (eller dens start-skærm) er monteret og klar til interaktion.

```ts
onLoadedEvent: ({ formData, progress, total, error }) => {
  if (error) {
    console.error("MagicFeedback failed to load", error);
    return;
  }
  analytics.track("survey_loaded", { progress, total });
};
```

Brug det til:

- Vise en loader før, og skjule den her.
- Sende et analytics-event når en undersøgelse vises.
- Afsløre/animere din container, når formularen er på plads.

## `beforeSubmitEvent`

Fyrer lige før en side bliver indsendt. Nyttigt til at deaktivere knapper, måle timing eller injicere ekstra metadata på klient-siden, inden anmodningen sendes.

```ts
beforeSubmitEvent: ({ progress, total }) => {
  analytics.track("survey_page_submitted", { page: progress, of: total });
};
```

## `afterSubmitEvent`

Fyrer efter hver side-indsendelse, inkl. den sidste. Payloadet fortæller dig om undersøgelsen nu er `completed`, om der er en `followup`-side og hvad API'en svarede.

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

Brug det til:

- Luk din modal eller bottom sheet på `completed`.
- Vis en brugerdefineret success-skærm (når `addSuccessScreen: false`).
- Trigge downstream-handlinger (fx give en kupon når en bestemt undersøgelse slutter).

## `onBackEvent`

Fyrer når brugeren navigerer tilbage til forrige side.

```ts
onBackEvent: ({ progress, followup }) => {
  analytics.track("survey_back", { progress, followup });
};
```

---

## Det hele samlet

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
