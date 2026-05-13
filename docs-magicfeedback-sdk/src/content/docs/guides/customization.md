---
title: Customization
description: How the survey is rendered, and every layer of UI customization the SDK exposes.
---

## How the survey is rendered

> **Is the survey rendered inside a WebView? Can we customize the UI?**

On the web, the survey is **not** rendered inside a WebView. The SDK injects the survey directly into the DOM of your page, inside the container element you pass to `form.generate(...)`. That means:

- It is part of the **same DOM tree as your app**.
- It can be styled with your own CSS, and inspected with your browser DevTools.
- It inherits your page's font stack, accessibility settings, and reduced-motion preferences.
- There is **no iframe** and **no sandbox**.

On **React Native**, the recommended path is different — see [React Native](/reference/react-native/) — and there the survey runs inside a `WebView` because RN does not have a DOM. That is a host requirement, not a constraint of the SDK.

You have **three independent customization layers** on the web: CSS variables, action button labels, and overrides of the generated CSS classes for full visual control.

---

## Loading the default stylesheet

The SDK ships its full default look as a single stylesheet at `@magicfeedback/native/dist/styles/magicfeedback-default.css`. The form **requires** this stylesheet to render correctly — load it once at the entry point of your app, then add your overrides below.

Pick the snippet that matches your integration.

### Bundler (Vite / Webpack / Rollup / esbuild)

```ts
// main.ts / index.ts / app.tsx — your entry file
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";

// Your own overrides come AFTER the SDK import so they win specificity ties.
import "./styles/magicfeedback-overrides.css";
```

### Next.js (App Router)

Import the stylesheet from a `'use client'` component or directly from your root layout. Pages Router users can import it from `_app.tsx`.

```tsx
// app/layout.tsx
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
import "./globals.css"; // your overrides

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

### Next.js (Pages Router)

```tsx
// pages/_app.tsx
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
import "../styles/magicfeedback-overrides.css";

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
```

### Plain HTML — local `node_modules`

```html
<link
  rel="stylesheet"
  href="./node_modules/@magicfeedback/native/dist/styles/magicfeedback-default.css"
/>
<link rel="stylesheet" href="./assets/magicfeedback-overrides.css" />
```

### Plain HTML — CDN

If you load the SDK from a CDN (e.g. unpkg or jsDelivr), load the matching stylesheet from the same CDN.

```html
<link
  rel="stylesheet"
  href="https://unpkg.com/@magicfeedback/native/dist/styles/magicfeedback-default.css"
/>
<link rel="stylesheet" href="/styles/magicfeedback-overrides.css" />
```

### React Native (inside the WebView HTML)

In React Native the SDK runs **inside a `WebView`** that loads a small HTML page you host. Add the default stylesheet (and any overrides) to that page's `<head>`. Loading from a CDN is the simplest setup — there is no bundler in the WebView.

```html
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link
      rel="stylesheet"
      href="https://unpkg.com/@magicfeedback/native/dist/styles/magicfeedback-default.css"
    />
    <style>
      /* Inline overrides — keep the WebView a single self-contained file */
      :root {
        --mf-primary: #0f766e;
        --mf-radius-md: 0.75rem;
      }
    </style>
  </head>
  <body>
    <div id="survey-root"></div>
    <script src="https://unpkg.com/@magicfeedback/native/dist/magicfeedback-sdk.browser.js"></script>
    <!-- init + form.generate("survey-root", { ... }) here -->
  </body>
</html>
```

See [React Native](/reference/react-native/) for the full WebView wiring.

### Loading order matters

In every integration, ensure the SDK stylesheet is loaded **before** your overrides — otherwise your rules may lose specificity ties to the SDK's defaults.

```ts
// ✅ correct order
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
import "./my-overrides.css";

// ❌ wrong — overrides loaded first
import "./my-overrides.css";
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
```

### Loading only when needed

For multi-page apps where the survey appears on only a few routes, you can defer the stylesheet — but make sure it is present in the DOM **before** `form.generate(...)` runs, or the first paint will be unstyled.

```ts
async function showFeedback() {
  if (!document.getElementById("mf-styles")) {
    const link = document.createElement("link");
    link.id = "mf-styles";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/@magicfeedback/native/dist/styles/magicfeedback-default.css";
    document.head.appendChild(link);
    await new Promise((resolve) => (link.onload = resolve));
  }

  const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
  await form.generate("survey-root", { addButton: true });
}
```

---

## Layer 1 — CSS variables (recommended)

The fastest way to brand the survey. Override the variables exposed by the default stylesheet anywhere in your own CSS — after importing the SDK styles.

```css
:root {
  --mf-primary: #0f766e;
  --mf-primary-hover: #115e59;
  --mf-primary-light: #ccfbf1;

  --mf-text-primary: #0f172a;
  --mf-text-secondary: #475569;

  --mf-bg-primary: #ffffff;
  --mf-bg-secondary: #f8fafc;

  --mf-border: #cbd5e1;
  --mf-border-focus: #0f766e;

  --mf-radius-md: 0.5rem;
  --mf-shadow-md: 0 10px 20px rgba(15, 23, 42, 0.08);
}
```

### Default values shipped with the SDK

These are the exact defaults defined in `magicfeedback-default.css`. Copy this block into your own stylesheet, change only the variables you care about, and you have a fully branded survey.

```css
:root {
  /* Colors — minimal pastel */
  --mf-primary: #1E293B;
  --mf-primary-hover: #0F172A;
  --mf-primary-light: #E2E8F0;

  --mf-text-primary: #1E293B;
  --mf-text-secondary: #475569;
  --mf-text-muted: #94A3B8;

  --mf-bg-primary: #F8FAFC;
  --mf-bg-secondary: #FFFFFF;
  --mf-bg-hover: #EEF2F6;

  --mf-border: #E2E8F0;
  --mf-border-focus: #1E293B;

  --mf-success: #16A34A;
  --mf-error:   #EF4444;
  --mf-warning: #F59E0B;

  --mf-surface:     #FFFFFF;
  --mf-surface-alt: #F1F5F9;
  --mf-accent:      #38BDF8;

  /* Spacing */
  --mf-space-xs: 0.25rem;
  --mf-space-sm: 0.5rem;
  --mf-space-md: 0.75rem;
  --mf-space-lg: 1rem;
  --mf-space-xl: 1.5rem;

  /* Border radius */
  --mf-radius-sm:   0.5rem;
  --mf-radius-md:   0.75rem;
  --mf-radius-lg:   1.25rem;
  --mf-radius-full: 9999px;

  /* Shadows */
  --mf-shadow-sm:    0 1px 2px 0 rgba(15, 23, 42, 0.06);
  --mf-shadow-md:    0 8px 20px  rgba(15, 23, 42, 0.08);
  --mf-shadow-lg:    0 16px 30px rgba(15, 23, 42, 0.12);
  --mf-shadow-focus: 0 0 0 3px   rgba(30, 41, 59, 0.15);
  --mf-shadow-card:  0 18px 40px rgba(15, 23, 42, 0.08);

  /* Typography */
  --mf-font-sans: "Nunito", "Quicksand", "Avenir Next", "Trebuchet MS", sans-serif;
  --mf-font-size-sm:   0.875rem;
  --mf-font-size-base: 1rem;
  --mf-font-size-lg:   1.125rem;
  --mf-font-size-xl:   1.25rem;
  --mf-line-height:    1.6;

  --mf-font-weight-normal:     400;
  --mf-font-weight-medium:     500;
  --mf-font-weight-semibold:   600;
  --mf-font-weight-bold:       700;
  --mf-font-weight-extrabold:  800;

  /* Transitions */
  --mf-transition:      all 0.2s ease;
  --mf-transition-fast: all 0.15s ease;
}
```

:::tip
The default stylesheet imports the **Nunito** font from Google Fonts. If you want to avoid the external request (offline, CSP, performance), override `--mf-font-sans` with your own system stack and host the font yourself if needed.
:::

Match your dark mode by scoping a second block:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --mf-bg-primary: #0f172a;
    --mf-bg-secondary: #111827;
    --mf-text-primary: #f8fafc;
    --mf-text-secondary: #94a3b8;
    --mf-border: #334155;
  }
}
```

No JavaScript involved. The next render of any form will pick up the new variables.

---

## Layer 2 — Built-in button labels

Pass the action button labels to `generate()`. Use this for localization or to match your product's voice without touching CSS.

```ts
await form.generate("survey-root", {
  addButton: true,
  sendButtonText: "Send my feedback",
  backButtonText: "Back",
  nextButtonText: "Continue",
  startButtonText: "Let's go",
  addSuccessScreen: true,
  successMessage: "Thanks! We just got your feedback.",
});
```

If you want **full control of navigation** (your own buttons in your own layout), disable the built-in actions:

```ts
await form.generate("survey-root", { addButton: false });

document.getElementById("next")?.addEventListener("click", () => form.send());
document.getElementById("back")?.addEventListener("click", () => form.back());
```

---

## Layer 3 — Override the generated classes

For deeper visual tweaks beyond the variables, override the classes directly from your own CSS file. The SDK uses **stable class names** (all prefixed with `magicfeedback-`) so this is safe to do.

:::tip
Always import the SDK stylesheet **before** your overrides so your rules win specificity ties.
:::

### Class reference

Below is the full map of public classes shipped by `magicfeedback-default.css`, grouped by what they render. Every class is prefixed with `magicfeedback-`.

#### Layout

| Class                          | What it styles                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `.magicfeedback-container`     | Outermost wrapper of the rendered form.                                             |
| `.magicfeedback-form`          | The `<form>` element holding the questions and actions.                             |
| `.magicfeedback-questions`     | Wrapper around the question list of the current page.                               |
| `.magicfeedback-div`           | A single question block — the unit you usually target for spacing or borders.       |
| `.magicfeedback-label`         | A question's main title.                                                            |
| `.magicfeedback-sublabel`      | A question's secondary text / hint.                                                 |
| `.magicfeedback-error`         | Inline validation error message.                                                    |
| `.magicfeedback-counter`       | Progress indicator (e.g. "2 of 5").                                                 |
| `.magicfeedback-image`         | An image rendered inside a question or page.                                        |
| `.magicfeedback-warning`       | Non-blocking warning text.                                                          |

#### Start / success / info screens

| Class                                 | What it styles                                      |
| ------------------------------------- | --------------------------------------------------- |
| `.magicfeedback-start-message`        | The optional intro screen container.                |
| `.magicfeedback-start-message-button` | The CTA button on the intro screen.                 |
| `.magicfeedback-info-message`         | Standalone info pages.                              |
| `.magicfeedback-success-message`      | The built-in "thank you" screen.                    |

#### Action bar

| Class                              | What it styles                              |
| ---------------------------------- | ------------------------------------------- |
| `.magicfeedback-action-container`  | The action bar wrapping back / next / submit. |
| `.magicfeedback-submit`            | The primary submit / next button.           |
| `.magicfeedback-back`              | The secondary back button.                  |
| `.magicfeedback-button`            | Generic SDK button (used in modals).        |
| `.magicfeedback-button-primary`    | Primary variant of the generic button.      |
| `.magicfeedback-skip-container`    | The "skip" checkbox wrapper.                |

#### Choice questions (`RADIO`, `MULTIPLECHOICE`, `BOOLEAN`, `CONSENT`)

| Class                                    | What it styles                          |
| ---------------------------------------- | --------------------------------------- |
| `.magicfeedback-radio`                   | Container for a `RADIO` question.       |
| `.magicfeedback-radio-container`         | Each individual radio option (label + input). |
| `.magicfeedback-checkbox`                | Container for a `MULTIPLECHOICE` question. |
| `.magicfeedback-checkbox-container`      | Each checkbox option.                   |
| `.magicfeedback-boolean-container`       | Container for a `BOOLEAN` question.     |
| `.magicfeedback-boolean-option`          | Each yes/no option.                     |
| `.magicfeedback-consent-container`       | A `CONSENT` checkbox + label.           |

#### Rating questions (`RATING_STAR`, `RATING_EMOJI`, `RATING_NUMBER`)

| Class                                                | What it styles                                          |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `.magicfeedback-rating`                              | Generic rating wrapper.                                 |
| `.magicfeedback-rating-container`                    | Row of rating options.                                  |
| `.magicfeedback-rating-placeholder`                  | Helper text under a rating (e.g. "Not at all likely").  |
| `.magicfeedback-rating-placeholder-value`            | The numeric placeholder under a rating.                 |
| `.magicfeedback-rating-option-label-container`       | A single emoji rating option.                           |
| `.magicfeedback-rating-number`                       | Wrapper for a `RATING_NUMBER` question.                 |
| `.magicfeedback-rating-number-container`             | Row of numeric rating options.                          |
| `.magicfeedback-rating-number-option`                | A single numeric option.                                |
| `.magicfeedback-rating-number-option-label-container` | The label/input pair inside a numeric option.          |
| `.magicfeedback-rating-number-top-placeholder`       | Top label of the numeric rating scale.                  |
| `.magicfeedback-rating-number-bottom-placeholder`    | Bottom label of the numeric rating scale.               |
| `.magicfeedback-rating-star`                         | Wrapper for a `RATING_STAR` question.                   |
| `.magicfeedback-rating-star-container`               | Row of star options.                                    |
| `.magicfeedback-rating-star-option`                  | A single star option.                                   |
| `.magicfeedback-rating-star-selected`                | Visual state for the selected star.                     |
| `.rating__star`                                      | The star glyph itself.                                  |

#### Image-choice questions (`MULTIPLECHOISE_IMAGE`)

| Class                                              | What it styles                          |
| -------------------------------------------------- | --------------------------------------- |
| `.magicfeedback-multiple-choice-image-option`      | A single image option.                  |
| `.magicfeedback-image-option-label-container`      | The label/input/image grouping.         |

#### Matrix questions (`MULTI_QUESTION_MATRIX`)

| Class                                                  | What it styles                  |
| ------------------------------------------------------ | ------------------------------- |
| `.magicfeedback-multi-question-matrix-container`       | Wrapper around the matrix.      |
| `.magicfeedback-multi-question-matrix-table`           | The `<table>` itself.           |
| `.magicfeedback-multi-question-matrix-row-tr`          | A single row.                   |
| `.magicfeedback-multi-question-matrix-row-label`       | The row's left-hand label.      |

#### Priority list (`PRIORITY_LIST`)

| Class                                       | What it styles                          |
| ------------------------------------------- | --------------------------------------- |
| `.magicfeedback-priority-list-header`       | The header row.                         |
| `.magicfeedback-priority-list-list`         | The ordered list.                       |
| `.magicfeedback-priority-list-item`         | A single reorderable item.              |
| `.magicfeedback-priority-list-item-label`   | The item's label text.                  |
| `.magicfeedback-priority-list-arrows`       | The up/down arrow group.                |
| `.magicfeedback-priority-list-arrow-up`     | Up arrow button.                        |
| `.magicfeedback-priority-list-arrow-down`   | Down arrow button.                      |
| `.magicfeedback-priority-list-reorder`      | The reorder affordance area.            |

#### Point system (`POINT_SYSTEM`)

| Class                                            | What it styles                                  |
| ------------------------------------------------ | ----------------------------------------------- |
| `.magicfeedback-point-system-item`               | A single point-allocation row.                  |
| `.magicfeedback-point-system-input-container`    | Wrapper around the points input.                |
| `.magicfeedback-point-system-total`              | The "total points used" indicator.              |

#### Modal (used by some compound widgets)

| Class                                | What it styles                              |
| ------------------------------------ | ------------------------------------------- |
| `.magicfeedback-modal-backdrop`      | The dimmed backdrop behind the modal.       |
| `.magicfeedback-modal`               | The modal panel itself.                     |
| `.magicfeedback-modal-actions`       | The action area inside the modal.           |
| `.magicfeedback-modal-counter`       | Progress counter inside the modal.          |
| `.magicfeedback-modal-list`          | A list rendered inside the modal.           |
| `.magicfeedback-modal-row`           | A single row inside the modal list.         |
| `.magicfeedback-modal-close`         | The modal close button.                     |

#### Accessibility

| Class                              | What it styles                                |
| ---------------------------------- | --------------------------------------------- |
| `.magicfeedback-visually-hidden`   | Screen-reader-only text (visually hidden).    |

### Example overrides

```css
/* Tighten question spacing inside slim modals */
.magicfeedback-div {
  margin-bottom: 1rem;
}

/* Bolder question titles */
.magicfeedback-label {
  font-weight: 700;
  letter-spacing: -0.01em;
}

/* Pill-shaped submit button */
.magicfeedback-submit {
  border-radius: 9999px;
  padding-inline: 1.5rem;
}

/* Square emoji ratings with a soft hover lift */
.magicfeedback-rating-option-label-container img {
  border-radius: 12px;
  transition: transform 0.15s ease;
}
.magicfeedback-rating-option-label-container img:hover {
  transform: translateY(-2px) scale(1.05);
}

/* Replace the matrix striping with a subtle border-only style */
.magicfeedback-multi-question-matrix-row-tr:nth-child(even) {
  background: transparent;
}
.magicfeedback-multi-question-matrix-table td,
.magicfeedback-multi-question-matrix-table th {
  border-bottom: 1px solid var(--mf-border);
}
```

:::tip
For deeper customization, the full stylesheet is available at `node_modules/@magicfeedback/native/dist/styles/magicfeedback-default.css`. Open it once to see the full set of selectors, then override only what you need.
:::

---

## Question format: standard vs. slim

`questionFormat` switches between the two built-in visual densities.

```ts
await form.generate("survey-root", {
  questionFormat: "slim", // or "standard" (default)
});
```

- `"standard"` — generous spacing, larger inputs. Good for full-page surveys.
- `"slim"` — compact, fits well inside modals, drawers, or sidebars.

---

## Localizing the success screen

`addSuccessScreen` toggles the built-in "thank you" view. Combine with `successMessage` to localize, or disable it and render your own:

```ts
await form.generate("survey-root", {
  addSuccessScreen: false,
  afterSubmitEvent: ({ completed }) => {
    if (completed) {
      renderMyOwnThankYouView();
    }
  },
});
```

See [Lifecycle events](/guides/events/) for the full callback surface.

---

## What you cannot change from the SDK

- The **order and content of questions** — those live in the MagicFeedback dashboard.
- The **API endpoints** — selected by `init({ env })` between `prod` and `dev`.
- The list of **supported question types** — see [API reference → Supported question types](/reference/api/#supported-question-types).

If you need a question type, layout, or behavior the SDK does not expose, talk to your MagicFeedback contact rather than patching the SDK in user-land.
