---
title: Deepdots Popup SDK
description: Vis Deepdots-undersøgelser som popups i dit produkt uden at bygge et popup-system selv. Udløs dem på det rigtige tidspunkt og mål resultaterne.
---

# Deepdots Popup SDK

**Deepdots Popup SDK** lader dit produkt vise Deepdots-undersøgelser som popups på præcis det rigtige tidspunkt — uden at bygge et særskilt popup-system hver gang du vil bede om feedback.

Du installerer SDK'et, giver det din API-nøgle, og popups, triggers, targeting og cooldowns styres centralt fra Deepdots. Din kode skal kun montere SDK'et én gang og — valgfrit — udsende host-events når noget interessant sker i din forretningslogik.

## Hvad det gør

- Viser dine Deepdots-undersøgelser som popups i dit web-produkt.
- Udløser dem ud fra tid på siden, scroll-dybde, klik på et element, rute-exit eller en brugerdefineret forretnings-event, som du udsender.
- Targeter specifikke ruter på dit website.
- Anvender cooldowns, så den samme bruger ikke afbrydes to gange.
- Udsender events (`popup_shown`, `popup_clicked`, `survey_completed`), så du kan måle tragten.

## Hvad du ikke behøver gøre

- Du definerer ikke popups i kode. De lever i Deepdots og leveres til SDK'et i runtime.
- Du håndterer ikke trigger-logik, eligibility-regler eller anti-spam-cooldowns. Det gør SDK'et.
- Du hoster eller renderer ikke undersøgelsens UI. Det klarer SDK'et for dig.

## Typiske use cases

- Feedback-popup et par sekunder efter landing på en pris-side.
- Undersøgelse vist når en bruger er ved at forlade en produktside.
- Undersøgelse udløst efter en meningsfuld forretnings-event (gentagne søgninger, gennemført køb, forladt kurv).
- Popup synlig kun på specifikke ruter.

## Sådan fungerer det overordnet

1. Du kalder `popups.init({ mode: 'server', apiKey: '…' })` én gang når din app starter.
2. Du kalder `popups.autoLaunch()` for at aktivere de triggers, der kommer fra Deepdots-API'en.
3. Valgfrit kalder du `popups.triggerEvent('event_navn')` fra din kode, når en forretnings-event indtræffer.
4. Du abonnerer på SDK'ets events for at registrere popup-interaktioner i din analytics.

## Hvor skal du gå hen herfra

### Produkt, salg, customer success

- [Hvad er en trigger](/da/guides/triggers/) — alle de måder en popup kan udløses på.
- [Events SDK'et udsender](/da/guides/events/) — hvad din analytics vil se.

### Teknisk integration

- [Installation](/da/getting-started/installation/)
- [Quickstart](/da/getting-started/quickstart/)
- [Triggers i detaljer](/da/guides/triggers/)
- [API-reference](/da/reference/api/)
- [React](/da/reference/react/) · [React Native](/da/reference/react-native/)
