---
title: React Native
description: Den aktuelle status for React Native-understøttelsen i dette SDK.
---

## Aktuel status

SDK'et indeholder en renderer til React Native, men i dag er den kun en stub. Den renderer ikke et rigtigt UI alene.

## Hvad betyder det i praksis?

- Du skal selv forbinde rendereren til dit eget UI-lag.
- Typisk gøres det via en `Modal`, context eller en native bridge.
- Dokumentationen bør beskrive React Native som grundlæggende understøttelse, ikke som en plug-and-play integration uden ekstra kode.

## Anbefaling

Hvis du dokumenterer React Native, så vær tydelig om:

- at rendereren findes
- at den er en stub
- at hosten skal implementere det faktiske UI

:::caution
Præsenter ikke React Native som en plug-and-play integration hvis den UI-løsning ikke findes i den publicerede pakke.
:::
