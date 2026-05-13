---
title: MagicFeedback SDK
description: Render MagicFeedback-undersøgelser og formularer direkte inde i dit produkt, hvor du har brug for dem — fra en dedikeret side til en modal, drawer eller bottom sheet.
---

# MagicFeedback SDK

**MagicFeedback SDK** (`@magicfeedback/native`) er et browser-SDK, der renderer MagicFeedback-undersøgelser og formularer direkte ind i en DOM-container, du selv vælger. Du har fuld kontrol over hvor undersøgelsen vises, hvordan den ser ud, og hvad der sker før og efter hver indsendelse.

## Hvad det gør

- **Renderer** en hostet MagicFeedback-formular ind i et DOM-element, du peger på.
- **Genoptager** en eksisterende undersøgelses-session via `sessionId`.
- **Indsender** feedback direkte via API'en, når du selv ejer UI'et.
- **Forhåndsviser** et enkelt spørgsmål eller en side lokalt til QA.
- **Eksponerer livscyklus-events** — `onLoadedEvent`, `beforeSubmitEvent`, `afterSubmitEvent`, `onBackEvent`.

## Hvad det *ikke* er

- Det er **ikke** et modal- eller popup-framework. SDK'et tegner ingen modal, drawer eller bottom sheet — det renderer ind i den container, du giver det. Placér containeren hvor end dit produkt har brug for at vise undersøgelsen.
- Det er **ikke** en WebView-wrapper. På webben renderes undersøgelsen som **alm. DOM inde i din side**, fuldt styleable med CSS.
- Det er **ikke** en native renderer til React Native. Til React Native er den anbefalede vej at indlæse den hostede MagicFeedback-survey-URL i en `WebView` — se [React Native-referencen](/da/reference/react-native/).

## Typiske spørgsmål dette SDK besvarer

- *"Renderes undersøgelsen i en WebView? Kan vi tilpasse UI'et?"* → Nej, det er alm. DOM på webben; fuld CSS-tilpasning via variabler. Se [Customization](/da/guides/customization/).
- *"Kan vi vise den i en BottomSheet eller en dedikeret side i stedet for en modal?"* → Ja. SDK'et tvinger ingen overflade — du vælger hvor det renderes. Se [Rendering surfaces](/da/guides/rendering-surfaces/).

## Hvor skal du hen herfra

- [Installation](/da/getting-started/installation/)
- [Quickstart](/da/getting-started/quickstart/)
- [Customization](/da/guides/customization/)
- [Rendering surfaces](/da/guides/rendering-surfaces/)
- [Livscyklus-events](/da/guides/events/)
- [API-reference](/da/reference/api/)
- [React](/da/reference/react/) · [React Native](/da/reference/react-native/)
