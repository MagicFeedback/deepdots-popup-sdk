---
title: Quickstart
description: Render din første MagicFeedback-formular i tre trin.
---

Du skal bruge to værdier fra MagicFeedback:

- `APP_ID` — dit integrations-id
- `PUBLIC_KEY` — din public key

## 1. Installation

Se [Installation](/da/getting-started/installation/) for de fulde trin.

```bash
npm install @magicfeedback/native
```

## 2. Montér en container

Placér en tom `<div>` med et **id** hvor som helst du vil have undersøgelsen vist. SDK'et renderer ind i den container.

```html
<div id="survey-root"></div>
```

Containeren kan stå hvor som helst — en hel side, en modal, en drawer, et tab, en bottom sheet. Se [Rendering surfaces](/da/guides/rendering-surfaces/) for mønstre.

## 3. Initialisér og render

### Bundler (Vite / Webpack / SPA)

```ts
import magicfeedback from "@magicfeedback/native";
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";

magicfeedback.init({ env: "prod" });

const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");

await form.generate("survey-root", {
  addButton: true,
  addSuccessScreen: true,
});
```

### Alm. HTML

```html
<link rel="stylesheet" href="./node_modules/@magicfeedback/native/dist/styles/magicfeedback-default.css" />
<div id="survey-root"></div>
<script src="./node_modules/@magicfeedback/native/dist/magicfeedback-sdk.browser.js"></script>
<script>
  window.magicfeedback.init({ env: "prod" });
  const form = window.magicfeedback.form("APP_ID", "PUBLIC_KEY");
  form.generate("survey-root", { addButton: true, addSuccessScreen: true });
</script>
```

:::caution
`form.generate()` tager et **DOM-id-string** (fx `"survey-root"`) — ikke en CSS-selektor som `"#survey-root"`.
:::

## Prøv den før produktion

Brug `dev`-miljøet og `dryRun` til QA uden at oprette rigtige feedback-registreringer.

```ts
magicfeedback.init({
  env: "dev",
  debug: true,
  dryRun: true,
});
```

`dryRun: true` indlæser og navigerer formularen normalt, men **springer den endelige indsendelse** til API'en over.

## Genoptag en eksisterende session

Har du allerede et session-id (fx fra et email-link), kan du rendere det direkte:

```ts
const form = magicfeedback.session("SESSION_ID");
await form.generate("survey-root", { addButton: true });
```

## Næste skridt

- [Tilpas UI'et](/da/guides/customization/) (CSS-variabler, knaplabels, temaer).
- [Render i enhver overflade](/da/guides/rendering-surfaces/) (modal, drawer, side, bottom sheet).
- [Hægt dig på livscyklus-events](/da/guides/events/).
- [API-reference](/da/reference/api/).
