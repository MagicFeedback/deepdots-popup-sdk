---
title: Customization
description: Hvordan undersøgelsen renderes, og alle de UI-tilpasningslag SDK'et stiller til rådighed.
---

## Hvordan undersøgelsen renderes

> **Renderes undersøgelsen inde i en WebView? Kan vi tilpasse UI'et?**

På webben renderes undersøgelsen **ikke** inde i en WebView. SDK'et injicerer undersøgelsen direkte i DOM'en på din side, inde i det containerelement, du sender til `form.generate(...)`. Det betyder, at:

- Den er en del af **samme DOM-træ som din app**.
- Den kan styles med dit eget CSS og inspiceres med browserens DevTools.
- Den arver din sides font-stack, tilgængelighedsindstillinger og `prefers-reduced-motion`.
- Der er **ingen iframe** og **ingen sandbox**.

På **React Native** er vejen anderledes — se [React Native](/da/reference/react-native/) — og dér kører undersøgelsen inde i en `WebView`, fordi RN ikke har en DOM. Det er et hostkrav, ikke en begrænsning i SDK'et.

Du har **tre uafhængige tilpasningslag** på webben: CSS-variabler, knaplabels og overrides af de genererede CSS-klasser for fuld visuel kontrol.

---

## Indlæsning af standard-stylesheettet

SDK'et leverer hele sit standardudseende som ét stylesheet på `@magicfeedback/native/dist/styles/magicfeedback-default.css`. Formularen **kræver** dette stylesheet for at renderes korrekt — indlæs det én gang i din apps entry og læg dine overrides nedenfor.

Vælg snippet'et der matcher din integration.

### Bundler (Vite / Webpack / Rollup / esbuild)

```ts
// main.ts / index.ts / app.tsx — din entry-fil
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";

// Dine egne overrides EFTER SDK-importet, så de vinder specificity-bindinger.
import "./styles/magicfeedback-overrides.css";
```

### Next.js (App Router)

Importér stylesheettet fra en `'use client'`-komponent eller direkte fra root-layoutet. Pages Router-brugere importerer fra `_app.tsx`.

```tsx
// app/layout.tsx
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
import "./globals.css"; // dine overrides

export default function RootLayout({ children }) {
  return (
    <html lang="da">
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

### Alm. HTML — lokale `node_modules`

```html
<link
  rel="stylesheet"
  href="./node_modules/@magicfeedback/native/dist/styles/magicfeedback-default.css"
/>
<link rel="stylesheet" href="./assets/magicfeedback-overrides.css" />
```

### Alm. HTML — CDN

Indlæser du SDK'et fra et CDN (fx unpkg eller jsDelivr), så indlæs det matchende stylesheet fra samme CDN.

```html
<link
  rel="stylesheet"
  href="https://unpkg.com/@magicfeedback/native/dist/styles/magicfeedback-default.css"
/>
<link rel="stylesheet" href="/styles/magicfeedback-overrides.css" />
```

### React Native (inde i WebView-HTML'en)

I React Native kører SDK'et **inde i en `WebView`**, som indlæser en lille HTML-side, du hoster. Tilføj standard-stylesheettet (og eventuelle overrides) til den sides `<head>`. CDN-indlæsning er den enkleste opsætning — der er ingen bundler i WebView'et.

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
      /* Inline overrides — hold WebView'et som én selvstændig fil */
      :root {
        --mf-primary: #0f766e;
        --mf-radius-md: 0.75rem;
      }
    </style>
  </head>
  <body>
    <div id="survey-root"></div>
    <script src="https://unpkg.com/@magicfeedback/native/dist/magicfeedback-sdk.browser.js"></script>
    <!-- init + form.generate("survey-root", { ... }) her -->
  </body>
</html>
```

Se [React Native](/da/reference/react-native/) for hele WebView-kablingen.

### Rækkefølge er vigtig

I enhver integration skal SDK-stylesheettet indlæses **før** dine overrides — ellers kan dine regler tabe specificity-bindinger til SDK'ets standarder.

```ts
// ✅ korrekt rækkefølge
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
import "./my-overrides.css";

// ❌ forkert — overrides indlæst først
import "./my-overrides.css";
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";
```

### Indlæs kun ved behov

I multi-side-apps hvor undersøgelsen kun vises på få ruter, kan du udsætte stylesheettet — men sørg for at det er i DOM'en **inden** `form.generate(...)` køres, ellers bliver første rendering uden styles.

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

## Lag 1 — CSS-variabler (anbefalet)

Den hurtigste måde at sætte dit brand på. Tilsidesæt variablerne fra standard-stylesheettet i dit eget CSS — efter SDK-importet.

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

### Standardværdier leveret med SDK'et

Det er de præcise defaults defineret i `magicfeedback-default.css`. Kopier blokken ind i dit eget stylesheet, ændr kun det du har brug for, og du har en fuldt brandet undersøgelse.

```css
:root {
  /* Farver — minimal pastel */
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

  /* Skygger */
  --mf-shadow-sm:    0 1px 2px 0 rgba(15, 23, 42, 0.06);
  --mf-shadow-md:    0 8px 20px  rgba(15, 23, 42, 0.08);
  --mf-shadow-lg:    0 16px 30px rgba(15, 23, 42, 0.12);
  --mf-shadow-focus: 0 0 0 3px   rgba(30, 41, 59, 0.15);
  --mf-shadow-card:  0 18px 40px rgba(15, 23, 42, 0.08);

  /* Typografi */
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
Standard-stylesheettet importerer **Nunito**-fonten fra Google Fonts. Vil du undgå den eksterne forespørgsel (offline, CSP, performance), så tilsidesæt `--mf-font-sans` med din egen system-stack og host evt. fonten selv.
:::

Match dit dark mode med en anden blok:

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

Ingen JavaScript involveret. Næste rendering henter de nye variabler.

---

## Lag 2 — Indbyggede knaplabels

Send labels til `generate()`. Brug det til lokalisering eller for at matche dit produkts tone uden at røre CSS.

```ts
await form.generate("survey-root", {
  addButton: true,
  sendButtonText: "Send min feedback",
  backButtonText: "Tilbage",
  nextButtonText: "Næste",
  startButtonText: "Lad os starte",
  addSuccessScreen: true,
  successMessage: "Tak! Vi har lige modtaget din feedback.",
});
```

Vil du have **fuld kontrol over navigation** (egne knapper i eget layout), så deaktivér de indbyggede:

```ts
await form.generate("survey-root", { addButton: false });

document.getElementById("next")?.addEventListener("click", () => form.send());
document.getElementById("back")?.addEventListener("click", () => form.back());
```

### Styr hele surveyen fra dine egne widgets

Vil du gå videre og rendere selve **spørgsmålene** med dine egne komponenter — ikke kun knapperne — så send svarene programmatisk til `form.send()`. SDK'et springer DOM-scanningen og valideringen over og indsender direkte.

```ts
// Render dit UI som du vil. Når brugeren er færdig med en side, så send
// svarene direkte til SDK'et. Tilgængelig fra 2.2.4.
await form.send(
  [{ key: "source", value: ["custom-ui"] }], // metadata
  [],                                        // metrics
  [],                                        // profile
  [
    { key: "nps",              value: ["9"] },
    { key: "favorite-feature", value: ["Conditional logic"] },
  ],
);
```

Livscyklus-hooks udløses stadig, så analytics og UX-kobling fortsætter med at virke. Se [`form.send(metadata?, metrics?, profile?, answers?)`](/da/reference/api/#formsendmetadata-metrics-profile-answers) for den fulde kontrakt.

---

## Lag 3 — Tilsidesæt de genererede klasser

For dybere visuelle ændringer end variabler kan du tilsidesætte klasserne direkte fra dit eget CSS. SDK'et bruger **stabile klassenavne** (alle med præfikset `magicfeedback-`), så det er sikkert at gøre.

:::tip
Indlæs altid SDK-stylesheettet **før** dine overrides, så dine regler vinder specificity-bindinger.
:::

### Klassereference

Herunder det fulde kort over offentlige klasser leveret af `magicfeedback-default.css`, grupperet efter hvad de renderer. Alle klasser har præfikset `magicfeedback-`.

#### Layout

| Klasse                         | Hvad den styler                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `.magicfeedback-container`     | Yderste wrapper omkring formularen.                                                 |
| `.magicfeedback-form`          | `<form>`-elementet med spørgsmål og actions.                                        |
| `.magicfeedback-questions`     | Wrapper omkring spørgsmålslisten på den aktuelle side.                              |
| `.magicfeedback-div`           | Et enkelt spørgsmål — enheden du normalt rammer for spacing eller borders.          |
| `.magicfeedback-label`         | Et spørgsmåls primære titel.                                                        |
| `.magicfeedback-sublabel`      | Et spørgsmåls sekundære tekst / hint.                                               |
| `.magicfeedback-error`         | Inline valideringsfejlbesked.                                                       |
| `.magicfeedback-counter`       | Progress-indikator (fx "2 af 5").                                                   |
| `.magicfeedback-image`         | Et billede renderet i et spørgsmål eller en side.                                   |
| `.magicfeedback-warning`       | Ikke-blokerende advarselstekst.                                                     |

#### Start- / success- / info-skærme

| Klasse                                | Hvad den styler                                     |
| ------------------------------------- | --------------------------------------------------- |
| `.magicfeedback-start-message`        | Den valgfri intro-skærms container.                 |
| `.magicfeedback-start-message-button` | CTA-knappen på intro-skærmen.                       |
| `.magicfeedback-info-message`         | Standalone info-sider.                              |
| `.magicfeedback-success-message`      | Den indbyggede "tak"-skærm.                         |

#### Action-bar

| Klasse                             | Hvad den styler                             |
| ---------------------------------- | ------------------------------------------- |
| `.magicfeedback-action-container`  | Action-baren omkring back / next / submit.  |
| `.magicfeedback-submit`            | Primær submit / next-knap.                  |
| `.magicfeedback-back`              | Sekundær tilbage-knap.                      |
| `.magicfeedback-button`            | Generisk SDK-knap (brugt i modaler).        |
| `.magicfeedback-button-primary`    | Primary-variant af den generiske knap.      |
| `.magicfeedback-skip-container`    | Wrapper omkring "skip"-checkboxen.          |

#### Valg-spørgsmål (`RADIO`, `MULTIPLECHOICE`, `BOOLEAN`, `CONSENT`)

| Klasse                                   | Hvad den styler                              |
| ---------------------------------------- | -------------------------------------------- |
| `.magicfeedback-radio`                   | Container til et `RADIO`-spørgsmål.          |
| `.magicfeedback-radio-container`         | Hver radio-option (label + input).           |
| `.magicfeedback-checkbox`                | Container til et `MULTIPLECHOICE`-spørgsmål. |
| `.magicfeedback-checkbox-container`      | Hver checkbox-option.                        |
| `.magicfeedback-boolean-container`       | Container til et `BOOLEAN`-spørgsmål.        |
| `.magicfeedback-boolean-option`          | Hver yes/no-option.                          |
| `.magicfeedback-consent-container`       | En `CONSENT`-checkbox + label.               |

#### Rating-spørgsmål (`RATING_STAR`, `RATING_EMOJI`, `RATING_NUMBER`)

| Klasse                                                | Hvad den styler                                          |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `.magicfeedback-rating`                               | Generisk rating-wrapper.                                 |
| `.magicfeedback-rating-container`                     | Række af rating-options.                                 |
| `.magicfeedback-rating-placeholder`                   | Hjælpetekst under et rating (fx "Slet ikke sandsynligt"). |
| `.magicfeedback-rating-placeholder-value`             | Numerisk placeholder under et rating.                    |
| `.magicfeedback-rating-option-label-container`        | En enkelt emoji-rating-option.                           |
| `.magicfeedback-rating-number`                        | Wrapper til et `RATING_NUMBER`-spørgsmål.                |
| `.magicfeedback-rating-number-container`              | Række af numeriske options.                              |
| `.magicfeedback-rating-number-option`                 | En enkelt numerisk option.                               |
| `.magicfeedback-rating-number-option-label-container` | Label/input-parret inde i en numerisk option.            |
| `.magicfeedback-rating-number-top-placeholder`        | Top-label på den numeriske skala.                        |
| `.magicfeedback-rating-number-bottom-placeholder`     | Bund-label på den numeriske skala.                       |
| `.magicfeedback-rating-star`                          | Wrapper til et `RATING_STAR`-spørgsmål.                  |
| `.magicfeedback-rating-star-container`                | Række af stjerner.                                       |
| `.magicfeedback-rating-star-option`                   | En enkelt stjerne.                                       |
| `.magicfeedback-rating-star-selected`                 | Visuel state for valgt stjerne.                          |
| `.rating__star`                                       | Selve stjerne-glyffen.                                   |

#### Billed-valg-spørgsmål (`MULTIPLECHOISE_IMAGE`)

| Klasse                                             | Hvad den styler                          |
| -------------------------------------------------- | ---------------------------------------- |
| `.magicfeedback-multiple-choice-image-option`      | En enkelt billed-option.                 |
| `.magicfeedback-image-option-label-container`      | Label/input/billede-gruppering.          |

#### Matrix-spørgsmål (`MULTI_QUESTION_MATRIX`)

| Klasse                                                  | Hvad den styler                  |
| ------------------------------------------------------- | -------------------------------- |
| `.magicfeedback-multi-question-matrix-container`        | Wrapper omkring matrixen.        |
| `.magicfeedback-multi-question-matrix-table`            | Selve `<table>`'en.              |
| `.magicfeedback-multi-question-matrix-row-tr`           | En enkelt række.                 |
| `.magicfeedback-multi-question-matrix-row-label`        | Rækkens venstre-label.           |

#### Prioritetsliste (`PRIORITY_LIST`)

| Klasse                                      | Hvad den styler                          |
| ------------------------------------------- | ---------------------------------------- |
| `.magicfeedback-priority-list-header`       | Header-rækken.                           |
| `.magicfeedback-priority-list-list`         | Den ordnede liste.                       |
| `.magicfeedback-priority-list-item`         | En enkelt flytbar item.                  |
| `.magicfeedback-priority-list-item-label`   | Itemets label-tekst.                     |
| `.magicfeedback-priority-list-arrows`       | Op/ned-pilegruppen.                      |
| `.magicfeedback-priority-list-arrow-up`     | Op-pil-knap.                             |
| `.magicfeedback-priority-list-arrow-down`   | Ned-pil-knap.                            |
| `.magicfeedback-priority-list-reorder`     | Reorder-affordance-område.               |

#### Point-system (`POINT_SYSTEM`)

| Klasse                                           | Hvad den styler                                 |
| ------------------------------------------------ | ----------------------------------------------- |
| `.magicfeedback-point-system-item`               | En enkelt point-allokerings-række.              |
| `.magicfeedback-point-system-input-container`    | Wrapper omkring points-input'et.                |
| `.magicfeedback-point-system-total`              | "Brugte points / total"-indikator.              |

#### Modal (brugt af nogle sammensatte widgets)

| Klasse                               | Hvad den styler                             |
| ------------------------------------ | ------------------------------------------- |
| `.magicfeedback-modal-backdrop`      | Den nedtonede baggrund bag modalen.         |
| `.magicfeedback-modal`               | Selve modal-panelet.                        |
| `.magicfeedback-modal-actions`       | Action-området inde i modalen.              |
| `.magicfeedback-modal-counter`       | Progress-counter inde i modalen.            |
| `.magicfeedback-modal-list`          | Liste renderet inde i modalen.              |
| `.magicfeedback-modal-row`           | En enkelt række inde i modal-listen.        |
| `.magicfeedback-modal-close`         | Modal close-knap.                           |

#### Tilgængelighed

| Klasse                             | Hvad den styler                               |
| ---------------------------------- | --------------------------------------------- |
| `.magicfeedback-visually-hidden`   | Tekst kun synlig for skærmlæsere.             |

### Eksempler på overrides

```css
/* Kompakt spørgsmåls-spacing inde i slim-modaler */
.magicfeedback-div {
  margin-bottom: 1rem;
}

/* Fede spørgsmålstitler */
.magicfeedback-label {
  font-weight: 700;
  letter-spacing: -0.01em;
}

/* Pille-formet submit-knap */
.magicfeedback-submit {
  border-radius: 9999px;
  padding-inline: 1.5rem;
}

/* Kvadratiske emoji-ratings med blødt hover-lift */
.magicfeedback-rating-option-label-container img {
  border-radius: 12px;
  transition: transform 0.15s ease;
}
.magicfeedback-rating-option-label-container img:hover {
  transform: translateY(-2px) scale(1.05);
}

/* Erstat matrix-striberne med kun border */
.magicfeedback-multi-question-matrix-row-tr:nth-child(even) {
  background: transparent;
}
.magicfeedback-multi-question-matrix-table td,
.magicfeedback-multi-question-matrix-table th {
  border-bottom: 1px solid var(--mf-border);
}
```

:::tip
For dybere tilpasning er det fulde stylesheet på `node_modules/@magicfeedback/native/dist/styles/magicfeedback-default.css`. Åbn det én gang for at se hele selektor-listen, og override kun det du har brug for.
:::

---

## Spørgsmålsformat: standard vs. slim

`questionFormat` skifter mellem de to indbyggede visuelle densiteter.

```ts
await form.generate("survey-root", {
  questionFormat: "slim", // eller "standard" (default)
});
```

- `"standard"` — generøs spacing, store inputs. Velegnet til full-page-undersøgelser.
- `"slim"` — kompakt, passer i modaler, drawers eller sidebars.

---

## Lokalisering af success-skærmen

`addSuccessScreen` tænder/slukker den indbyggede "tak"-visning. Kombiner med `successMessage` for at lokalisere, eller deaktivér den og render din egen:

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

Se [Livscyklus-events](/da/guides/events/) for hele callback-overfladen.

---

## Hvad du ikke kan ændre fra SDK'et

- **Rækkefølge og indhold af spørgsmål** — de lever i MagicFeedback-dashboardet.
- **API-endpoints** — vælges af `init({ env })` mellem `prod` og `dev`.
- Listen af **understøttede spørgsmålstyper** — se [API-reference → Understøttede spørgsmålstyper](/da/reference/api/#supported-question-types).

Har du brug for en spørgsmålstype, et layout eller en adfærd SDK'et ikke eksponerer, så tal med din MagicFeedback-kontakt frem for at patche SDK'et i userland.
