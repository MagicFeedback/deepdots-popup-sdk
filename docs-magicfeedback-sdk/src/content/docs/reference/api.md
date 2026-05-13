---
title: API
description: Public methods and options exposed by @magicfeedback/native.
---

The package's default export is the **SDK singleton**. Use it directly — there is no `new`.

```ts
import magicfeedback from "@magicfeedback/native";
```

## `init(options?)`

Configures the SDK. Call once before any other method.

```ts
magicfeedback.init({
  env: "prod",
  debug: false,
  dryRun: false,
});
```

| Option   | Type                  | Default  | Description                                                              |
| -------- | --------------------- | -------- | ------------------------------------------------------------------------ |
| `env`    | `"prod" \| "dev"`    | `"prod"` | Selects the production or development API host.                          |
| `debug`  | `boolean`             | `false`  | Enables console logging from the SDK.                                    |
| `dryRun` | `boolean`             | `false`  | Loads and navigates forms without submitting feedback or fetching followups. |

`dryRun` is the safest way to QA a survey before giving it to a client.

## `form(appId, publicKey, profile?, metadata?)`

Creates a form instance bound to an integration.

```ts
const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
```

Optional `profile` and `metadata` are prepended to every submission of this form.

## `session(sessionId)`

Resumes an existing survey session.

```ts
const form = magicfeedback.session("SESSION_ID");
```

Returns the same `Form` type as `form(...)` — render it with `form.generate(...)`.

## `send(appId, publicKey, feedback, completed?, id?, privateKey?)`

Submits feedback directly without rendering any UI. Use this when **you own the survey UI** and just want the SDK to deliver the answers.

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

`completed: false` is intended for partial saves of multi-step flows.

## `previewPage(selector, input, options?)`

Renders one page (with its questions) from the survey creator **without hitting the API** and without persisting answers. Used by the MagicFeedback dashboard for live previews.

```ts
await magicfeedback.previewPage("preview-root", {
  page: { /* page definition */ },
  language: "en",
});
```

`dryRun` is enabled internally — no `POST /feedback` is sent.

---

## `Form` methods

The object returned by `form(...)` and `session(...)`.

### `form.generate(containerId, options?)`

Renders the form into the DOM element with the given **id** (not a CSS selector).

```ts
await form.generate("survey-root", {
  addButton: true,
  sendButtonText: "Send",
  backButtonText: "Back",
  nextButtonText: "Next",
  startButtonText: "Go!",
  addSuccessScreen: true,
  successMessage: "Thank you for your feedback!",
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

| Option              | Default                                | Description                                                            |
| ------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| `addButton`         | `true`                                 | Renders built-in action buttons. Disable to control navigation yourself. |
| `sendButtonText`    | `"Send"`                               | Label for the final submit button.                                     |
| `backButtonText`    | `"Back"`                               | Label for the back button.                                             |
| `nextButtonText`    | `"Next"`                               | Label for the next button in multi-step flows.                         |
| `startButtonText`   | `"Go!"`                                | Label for the start button when the form has a backend start message.  |
| `addSuccessScreen`  | `true`                                 | Shows the built-in success view when the flow finishes.                |
| `successMessage`    | `"Thank you for your feedback!"`       | Custom success text.                                                   |
| `questionFormat`    | `"standard"`                           | `"standard"` or `"slim"`. See [Customization](/guides/customization/). |
| `getMetaData`       | `true`                                 | Appends browser and page metadata automatically.                       |
| `customMetaData`    | `[]`                                   | Extra metadata merged into `feedback.metadata`.                        |
| `onLoadedEvent`     | `undefined`                            | Called after the form or start screen is ready.                        |
| `beforeSubmitEvent` | `undefined`                            | Called before a page is submitted.                                     |
| `afterSubmitEvent`  | `undefined`                            | Called after a page submit, follow-up render, or final completion.     |
| `onBackEvent`       | `undefined`                            | Called after navigating back.                                          |

When `getMetaData: true`, the SDK adds: current URL, origin, pathname, query string, user agent, browser language, platform, app metadata, screen size, and the session id when rendering from `session()`. Query params are expanded as `query-<param>`.

### `form.send(metadata?, metrics?, profile?)`

Submits the **current page** with the answers currently in the UI. Use this when `addButton: false`.

```ts
form.send(
  [{ key: "source", value: ["pricing-page"] }], // metadata
  [{ key: "score",  value: ["92"] }],           // metrics
  [{ key: "email",  value: ["user@example.com"] }], // profile
);
```

### `form.back()`

Navigates to the previous page. Use this when `addButton: false`.

```ts
form.back();
```

### `form.previewQuestion(containerId, question, options?)`

Renders a single question without changing the internal flow state. Useful for QA, local demos, and visual regression checks.

```ts
form.previewQuestion("preview-root", {
  id: "q_text",
  title: "What is your name?",
  type: "TEXT",
  questionType: { conf: [] },
  ref: "name",
  require: true,
  external_id: "",
  value: [],
  defaultValue: "",
  followup: false,
  position: 1,
  assets: { placeholder: "Type your name" },
  refMetric: "",
  integrationId: "demo",
  integrationPageId: "demo",
}, {
  format: "standard",
  language: "en",
  product: { customIcons: false },
  clearContainer: true,
  wrap: true,
});
```

---

## Supported question types

The renderer currently supports these question types:

`TEXT`, `LONGTEXT`, `NUMBER`, `RADIO`, `MULTIPLECHOICE`, `SELECT`, `DATE`, `EMAIL`, `PASSWORD`, `BOOLEAN`, `CONSENT`, `RATING_STAR`, `RATING_EMOJI`, `RATING_NUMBER`, `MULTIPLECHOISE_IMAGE`, `MULTI_QUESTION_MATRIX`, `POINT_SYSTEM`, `PRIORITY_LIST`, `INFO_PAGE`, `UPLOAD_FILE`, `UPLOAD_IMAGE`.

### Payload notes

- `EMAIL` answers are also copied into `feedback.profile` as `email`.
- `POINT_SYSTEM` answers are serialized as `"Label:60%"`.
- `MULTI_QUESTION_MATRIX` answers are grouped into a single JSON string entry. Required matrices must have a value in every row before submission is allowed.
- `INFO_PAGE`, `UPLOAD_FILE`, and `UPLOAD_IMAGE` render in the UI but do **not** currently create answer entries.

For the exact JSON output produced by `Form.answer()`, see the source repository's `docs/answer-format.md`.

---

## TypeScript

The package ships types at `dist/types/src/index.d.ts`. The default export is fully typed — no extra imports are needed for autocomplete and type-checking.

```ts
import magicfeedback from "@magicfeedback/native";

const form = magicfeedback.form("APP_ID", "PUBLIC_KEY"); // typed
await form.generate("survey-root", {
  addButton: true,
  afterSubmitEvent: (e) => console.log(e.completed),     // typed
});
```
