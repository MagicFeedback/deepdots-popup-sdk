---
title: MagicFeedback Popup SDK
description: Hvad SDK'et gør, hvilken forretningsværdi det giver, og hvordan det hjælper med at lancere feedback-popups uden særskilt specialudvikling.
---

# MagicFeedback Popup SDK

`MagicFeedback Popup SDK` gør det muligt at vise spørgeskemaer og feedback-formularer som popups i et website eller digitalt produkt, uden at man skal bygge et nyt popup-system til hvert initiativ.

Denne side er skrevet som en kort oversigt for produktfolk, forretning, customer success og salg, som hurtigt vil forstå hvad løsningen gør, og hvornår den giver mening.

## Hvilket problem løser det?

Virksomheder vil ofte gerne:

- vise en undersøgelse på et bestemt tidspunkt i brugerrejsen
- indsamle feedback når en bruger forlader en vigtig side
- starte en undersøgelse efter en forretningshændelse
- måle om popupen blev vist, åbnet eller gennemført

Uden et SDK som dette ender hvert use case ofte som særskilt udvikling med duplikeret logik og begrænset sporbarhed.

## Hvad gør det i praksis?

- Viser MagicFeedback-undersøgelser som popups på websites.
- Gør det muligt at styre præcist hvornår en popup vises.
- Understøtter aktivering via tid, scroll, klik, ruteforløb eller forretningshændelser.
- Understøtter målretning på ruteniveau.
- Udsender events så teamet kan måle effekt og adfærd.

## Hvem er det nyttigt for?

### Produkt / PM

Gør det lettere at lancere feedbackinitiativer uden at skulle redesigne triggere, regler og tracking hver gang.

### Salg / Presales

Gør det nemmere at forklare at løsningen ikke kun er en formular, men en kontrolleret måde at placere undersøgelser i centrale punkter af den digitale brugerrejse.

### Customer Success / Operations

Gør det lettere at teste scenarier, validere oplevelser og koordinere ændringer uden at røre hele applikationen.

## Typiske use cases

- Feedback-popup efter nogle sekunder på en pricing-side.
- Undersøgelse når brugeren forlader en produktside.
- Undersøgelse aktiveret efter en forretningshændelse som gentagne søgninger eller et køb.
- Popup som kun vises på bestemte ruter.

## To måder at arbejde på

### Server mode

Anbefales til rigtige integrationer. Popup-definitioner hentes fra API'et og styres centralt.

### Client mode

Reserveret til intern brug. Det er nyttigt til demoer, QA, prototyper og lokale tests med inline-definitioner i koden, men det er ikke den offentlige integrationsform vi anbefaler til kunder.

## Hvis du kommer fra forretningen

Start med disse sider:

- [Server vs Client Mode](/da/guides/modes/)
- [Examples](/da/guides/examples/)
- [React Native](/da/reference/react-native/)

## Hvis du kommer fra den tekniske integration

Start med disse sider:

- [Installation](/da/getting-started/installation/)
- [Quickstart](/da/getting-started/quickstart/)
- [Popup Definition](/da/reference/popup-definition/)
- [API](/da/reference/api/)

## Vigtig note

Den tekniske dokumentation på dette site er skrevet ud fra SDK'ets aktuelle adfærd. Især:

- `triggers` er et array
- `cooldown` ligger adskilt fra `triggers`
- fremdriftsstatusserne er `SHOWED`, `PARTIAL` og `COMPLETED`
