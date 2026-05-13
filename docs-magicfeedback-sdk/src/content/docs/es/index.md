---
title: MagicFeedback SDK
description: Renderiza encuestas y formularios de MagicFeedback directamente dentro de tu producto, donde los necesites — desde una página dedicada hasta un modal, drawer o bottom sheet.
---

# MagicFeedback SDK

El **MagicFeedback SDK** (`@magicfeedback/native`) es un SDK de navegador que renderiza encuestas y formularios de MagicFeedback directamente en un contenedor del DOM que tú eliges. Mantienes el control total de dónde aparece la encuesta, cómo se ve y qué ocurre antes y después de cada envío.

## Qué hace

- **Renderiza** un formulario alojado en MagicFeedback dentro del elemento del DOM que le indiques.
- **Reanuda** una sesión existente por `sessionId`.
- **Envía** feedback directamente vía API cuando ya tienes tu propia UI.
- **Previsualiza** una pregunta o página individual en local para QA.
- **Expone eventos de ciclo de vida** — `onLoadedEvent`, `beforeSubmitEvent`, `afterSubmitEvent`, `onBackEvent`.

## Lo que *no* es

- **No** es un framework de modales o popups. El SDK no dibuja un modal, drawer ni bottom sheet — renderiza dentro del contenedor que le pases. Coloca ese contenedor donde tu producto necesite que aparezca la encuesta.
- **No** es un wrapper de WebView. En la web, la encuesta se renderiza como **DOM plano dentro de tu página**, totalmente estilable con CSS.
- **No** es un renderer nativo de React Native. Para React Native, la vía recomendada es cargar la URL de la encuesta alojada por MagicFeedback dentro de un `WebView` — mira la [referencia de React Native](/es/reference/react-native/).

## Preguntas típicas que responde este SDK

- *"¿La encuesta se renderiza en un WebView? ¿Podemos personalizar la UI?"* → No, es DOM plano en la web; personalización CSS completa vía variables. Mira [Customization](/es/guides/customization/).
- *"¿Podemos mostrarla en un BottomSheet o una página propia en vez de un modal?"* → Sí. El SDK no impone una superficie — tú eliges dónde renderizar. Mira [Rendering surfaces](/es/guides/rendering-surfaces/).

## Por dónde seguir

- [Instalación](/es/getting-started/installation/)
- [Quickstart](/es/getting-started/quickstart/)
- [Customization](/es/guides/customization/)
- [Rendering surfaces](/es/guides/rendering-surfaces/)
- [Eventos de ciclo de vida](/es/guides/events/)
- [Referencia de la API](/es/reference/api/)
- [React](/es/reference/react/) · [React Native](/es/reference/react-native/)
