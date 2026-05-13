---
title: API
description: Offentlige metoder og options eksponeret af @magicfeedback/native.
---

Pakkens default export er **SDK-singleton'en**. Brug den direkte — der er ingen `new`.

```ts
import magicfeedback from "@magicfeedback/native";
```

## `init(options?)`

Konfigurerer SDK'et. Kald én gang før alle andre metoder.

```ts
magicfeedback.init({
  env: "prod",
  debug: false,
  dryRun: false,
});
```

| Option   | Type                  | Default  | Beskrivelse                                                                  |
| -------- | --------------------- | -------- | ---------------------------------------------------------------------------- |
| `env`    | `"prod" \| "dev"`     | `"prod"` | Vælger produktions- eller dev-API-host.                                      |
| `debug`  | `boolean`             | `false`  | Slår SDK-log til i konsollen.                                                |
| `dryRun` | `boolean`             | `false`  | Indlæser og navigerer formularer uden at indsende feedback eller hente followups. |

`dryRun` er den sikreste måde at QA'e en undersøgelse på, før du giver den til en klient.

## `form(appId, publicKey, profile?, metadata?)`

Opretter en form-instans bundet til en integration.

```ts
const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
```

Valgfri `profile` og `metadata` prepende på hver indsendelse af denne form.

## `session(sessionId)`

Genoptager en eksisterende session.

```ts
const form = magicfeedback.session("SESSION_ID");
```

Returnerer samme `Form`-type som `form(...)` — render den med `form.generate(...)`.

## `send(appId, publicKey, feedback, completed?, id?, privateKey?)`

Indsender feedback direkte uden at rendere UI. Brug det når **du ejer UI'et** og bare vil have SDK'et til at levere svarene.

```ts
await magicfeedback.send(
  "APP_ID",
  "PUBLIC_KEY",
  {
    text: "",
    answers: [
      { key: "nps", value: ["9"] },
      { key: "favorite-feature", value: ["Conditional logic"] },
    ],
    metadata: [{ key: "source", value: ["pricing-page"] }],
    metrics:  [{ key: "plan",   value: ["pro"] }],
    profile:  [{ key: "email",  value: ["user@example.com"] }],
  },
  true, // completed
);
```

`completed: false` er tænkt til partielle gem af multi-step-flows.

## `previewPage(selector, input, options?)`

Renderer én side (med dens spørgsmål) fra creatoren **uden at ramme API'en** og uden at persistere svar. Bruges af MagicFeedback-dashboardet til live previews.

```ts
await magicfeedback.previewPage("preview-root", {
  page: { /* side-definition */ },
  language: "da",
});
```

`dryRun` er aktiveret internt — der sendes ingen `POST /feedback`.

---

## `Form`-metoder

Objektet returneret af `form(...)` og `session(...)`.

### `form.generate(containerId, options?)`

Renderer formularen ind i DOM-elementet med det givne **id** (ikke en CSS-selektor).

```ts
await form.generate("survey-root", {
  addButton: true,
  sendButtonText: "Send",
  backButtonText: "Tilbage",
  nextButtonText: "Næste",
  startButtonText: "Kør!",
  addSuccessScreen: true,
  successMessage: "Tak for din feedback!",
  questionFormat: "standard",
  getMetaData: true,
  customMetaData: [
    { key: "customer-id", value: ["acme-42"] },
    { key: "plan",        value: ["enterprise"] },
  ],
  onLoadedEvent:     ({ formData, progress, total, error }) => {},
  beforeSubmitEvent: ({ progress, total }) => {},
  afterSubmitEvent:  ({ response, progress, total, completed, followup, error }) => {},
  onBackEvent:       ({ progress, followup, error }) => {},
});
```

| Option              | Default                                | Beskrivelse                                                            |
| ------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| `addButton`         | `true`                                 | Renderer indbyggede action-knapper. Slå fra for selv at styre navigation. |
| `sendButtonText`    | `"Send"`                               | Label på den endelige submit-knap.                                     |
| `backButtonText`    | `"Back"`                               | Label på tilbage-knappen.                                              |
| `nextButtonText`    | `"Next"`                               | Label på næste-knappen i multi-step-flows.                             |
| `startButtonText`   | `"Go!"`                                | Label på start-knappen når formularen har en backend-startbesked.      |
| `addSuccessScreen`  | `true`                                 | Viser indbygget success-visning ved flow-afslutning.                   |
| `successMessage`    | `"Thank you for your feedback!"`       | Brugerdefineret success-tekst.                                         |
| `questionFormat`    | `"standard"`                           | `"standard"` eller `"slim"`. Se [Customization](/da/guides/customization/). |
| `getMetaData`       | `true`                                 | Appender browser- og side-metadata automatisk.                         |
| `customMetaData`    | `[]`                                   | Ekstra metadata fusioneret ind i `feedback.metadata`.                  |
| `onLoadedEvent`     | `undefined`                            | Kaldes efter formular eller start-skærm er klar.                       |
| `beforeSubmitEvent` | `undefined`                            | Kaldes før en side indsendes.                                          |
| `afterSubmitEvent`  | `undefined`                            | Kaldes efter side-indsendelse, followup-render eller endelig færdiggørelse. |
| `onBackEvent`       | `undefined`                            | Kaldes efter tilbage-navigation.                                       |

Når `getMetaData: true` tilføjer SDK'et: nuværende URL, origin, pathname, query string, user agent, browsersprog, platform, app-metadata, skærmstørrelse og session-id ved render fra `session()`. Query params udvides som `query-<param>`.

### `form.send(metadata?, metrics?, profile?)`

Indsender den **aktuelle side** med de svar, der ligger i UI'et lige nu. Brug det med `addButton: false`.

```ts
form.send(
  [{ key: "source", value: ["pricing-page"] }], // metadata
  [{ key: "score",  value: ["92"] }],           // metrics
  [{ key: "email",  value: ["user@example.com"] }], // profile
);
```

### `form.back()`

Navigerer til forrige side. Brug det med `addButton: false`.

```ts
form.back();
```

### `form.previewQuestion(containerId, question, options?)`

Renderer ét spørgsmål uden at ændre intern flow-tilstand. Nyttigt til QA, lokale demos og visuel regressionstest.

```ts
form.previewQuestion("preview-root", {
  id: "q_text",
  title: "Hvad hedder du?",
  type: "TEXT",
  questionType: { conf: [] },
  ref: "name",
  require: true,
  external_id: "",
  value: [],
  defaultValue: "",
  followup: false,
  position: 1,
  assets: { placeholder: "Skriv dit navn" },
  refMetric: "",
  integrationId: "demo",
  integrationPageId: "demo",
}, {
  format: "standard",
  language: "da",
  product: { customIcons: false },
  clearContainer: true,
  wrap: true,
});
```

---

## Understøttede spørgsmålstyper

Rendereren understøtter aktuelt disse spørgsmålstyper:

`TEXT`, `LONGTEXT`, `NUMBER`, `RADIO`, `MULTIPLECHOICE`, `SELECT`, `DATE`, `EMAIL`, `PASSWORD`, `BOOLEAN`, `CONSENT`, `RATING_STAR`, `RATING_EMOJI`, `RATING_NUMBER`, `MULTIPLECHOISE_IMAGE`, `MULTI_QUESTION_MATRIX`, `POINT_SYSTEM`, `PRIORITY_LIST`, `INFO_PAGE`, `UPLOAD_FILE`, `UPLOAD_IMAGE`.

### Payload-noter

- `EMAIL`-svar kopieres også ind i `feedback.profile` som `email`.
- `POINT_SYSTEM`-svar serialiseres som `"Label:60%"`.
- `MULTI_QUESTION_MATRIX`-svar samles til én JSON-streng-entry. Krævede matricer skal have en værdi i hver række før indsendelse tillades.
- `INFO_PAGE`, `UPLOAD_FILE` og `UPLOAD_IMAGE` renderes i UI'et, men opretter **ikke** svar-entries.

For det præcise JSON-output produceret af `Form.answer()`, se `docs/answer-format.md` i SDK-repository'et.

---

## TypeScript

Pakken leverer typer på `dist/types/src/index.d.ts`. Default export'et er fuldt typet — du behøver ingen ekstra imports for autocomplete og type-checking.

```ts
import magicfeedback from "@magicfeedback/native";

const form = magicfeedback.form("APP_ID", "PUBLIC_KEY"); // typet
await form.generate("survey-root", {
  addButton: true,
  afterSubmitEvent: (e) => console.log(e.completed),     // typet
});
```
