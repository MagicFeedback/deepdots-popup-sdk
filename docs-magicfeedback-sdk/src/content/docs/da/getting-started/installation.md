---
title: Installation
description: Tilføj @magicfeedback/native til dit projekt.
---

MagicFeedback SDK'et er publiceret på npm som `@magicfeedback/native`.

## Installation

```bash
npm install @magicfeedback/native
```

Eller med yarn / pnpm:

```bash
yarn add @magicfeedback/native
pnpm add @magicfeedback/native
```

## Importér stylesheettet

SDK'et leveres med et standard-stylesheet. Importér det én gang i din apps entry, eller indlæs det fra dit foretrukne CDN i alm. HTML.

### Bundler (Vite, Webpack, Next.js, m.fl.)

```ts
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
```

### Alm. HTML

```html
<link
  rel="stylesheet"
  href="./node_modules/@magicfeedback/native/dist/styles/magicfeedback-default.css"
/>
```

Stylesheettet er påkrævet for at undersøgelsen renderes korrekt. Du kan tilsidesætte udseendet fuldt ud via [CSS-variabler](/da/guides/customization/).

## Browserkrav

Dette SDK er **kun til browser**. Det afhænger af `window`, `document`, `navigator` og `localStorage`. Kald det ikke under SSR — pak det ind i en client-only-komponent eller kør det inde i `useEffect` (React) eller `onMount` (Svelte/Vue).

Til React Native, se [React Native-referencen](/da/reference/react-native/).

## Bekræft installationen

```ts
import magicfeedback from "@magicfeedback/native";

magicfeedback.init({ env: "dev", debug: true });
console.log("MagicFeedback SDK initialized");
```

Hvis log-linjen vises uden fejl, er du klar til at rendere en formular — videre til [Quickstart](/da/getting-started/quickstart/).
