---
title: Installation
description: Add @magicfeedback/native to your project.
---

The MagicFeedback SDK is published on npm as `@magicfeedback/native`.

## Install

```bash
npm install @magicfeedback/native
```

Or with yarn / pnpm:

```bash
yarn add @magicfeedback/native
pnpm add @magicfeedback/native
```

## Import the stylesheet

The SDK ships a default stylesheet. Import it once at the entry point of your app, or load it from your CDN of choice in plain HTML.

### Bundler (Vite, Webpack, Next.js, etc.)

```ts
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
```

### Plain HTML

```html
<link
  rel="stylesheet"
  href="./node_modules/@magicfeedback/native/dist/styles/magicfeedback-default.css"
/>
```

The stylesheet is required for the survey to render correctly. You can fully override its appearance via [CSS variables](/guides/customization/).

## Browser requirements

This SDK is **browser-only**. It relies on `window`, `document`, `navigator`, and `localStorage`. Do not call it during server-side rendering — wrap it in a client-only component or run it inside `useEffect` (React) or `onMount` (Svelte/Vue).

For React Native, see the [React Native reference](/reference/react-native/).

## Verify the install

```ts
import magicfeedback from "@magicfeedback/native";

magicfeedback.init({ env: "dev", debug: true });
console.log("MagicFeedback SDK initialized");
```

If you see the log line with no errors, you are ready to render a form — head to the [Quickstart](/getting-started/quickstart/).
