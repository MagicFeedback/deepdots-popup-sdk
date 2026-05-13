---
title: Quickstart
description: Render your first MagicFeedback form in three steps.
---

You need two values from MagicFeedback:

- `APP_ID` — your integration id
- `PUBLIC_KEY` — your public key

## 1. Install

See [Installation](/getting-started/installation/) for the full install steps.

```bash
npm install @magicfeedback/native
```

## 2. Mount a container

Place an empty `<div>` with an **id** wherever you want the survey to appear. The SDK will render into that container.

```html
<div id="survey-root"></div>
```

The container can be anywhere — a full page, a modal, a drawer, a tab, a bottom sheet. See [Rendering surfaces](/guides/rendering-surfaces/) for patterns.

## 3. Initialize and render

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

### Plain HTML

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
`form.generate()` takes a **DOM id string** (e.g. `"survey-root"`) — not a CSS selector like `"#survey-root"`.
:::

## Try it before production

Use the `dev` environment plus `dryRun` to QA your survey without creating real feedback records.

```ts
magicfeedback.init({
  env: "dev",
  debug: true,
  dryRun: true,
});
```

`dryRun: true` loads and navigates the form normally, but **skips the final submission** to the API.

## Resume an existing session

If you already have a session id (e.g. from an email link), render it directly:

```ts
const form = magicfeedback.session("SESSION_ID");
await form.generate("survey-root", { addButton: true });
```

## Next steps

- [Customize the UI](/guides/customization/) (CSS variables, button labels, themes).
- [Render in any surface](/guides/rendering-surfaces/) (modal, drawer, page, bottom sheet).
- [Hook into lifecycle events](/guides/events/).
- [API reference](/reference/api/).
