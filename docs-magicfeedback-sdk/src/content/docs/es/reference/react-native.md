---
title: React Native
description: Cómo mostrar encuestas de MagicFeedback en una app React Native vía WebView.
---

## Por qué esto es distinto de la web

El MagicFeedback SDK es una librería **de navegador**: depende de `window`, `document` y `localStorage` para renderizar la UI de la encuesta directamente en el DOM. React Native no tiene DOM, así que el SDK **no se puede usar directamente** desde código RN.

La vía soportada es renderizar la **URL de la encuesta alojada por MagicFeedback dentro de un `WebView`**. Eso te da:

- La misma UI de encuesta que ven tus usuarios web, sin duplicar implementación nativa.
- Todos los tipos de pregunta soportados por el SDK.
- Eventos de ciclo de vida puenteados hacia tu app RN vía `postMessage`.

## Instalación

```bash
npm install react-native-webview
```

**No** hace falta instalar `@magicfeedback/native` en el bundle de React Native — el WebView es el host.

## Alojar la encuesta

Necesitas una URL pública que arranque el SDK y renderice un formulario. Dos opciones:

1. **URL de encuesta alojada por MagicFeedback** — pídele a tu contacto en MagicFeedback la URL standalone para tu `appId`/`publicKey`.
2. **Página fina self-hosted** — un fichero HTML en tu CDN que cargue el SDK y renderice el formulario. Pasa `appId`, `publicKey` y cualquier metadata vía query params.

Ejemplo de página self-hosted (`https://your-cdn.example.com/mf-survey.html`):

```html
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://unpkg.com/@magicfeedback/native/dist/styles/magicfeedback-default.css" />
  </head>
  <body>
    <div id="survey-root"></div>
    <script src="https://unpkg.com/@magicfeedback/native/dist/magicfeedback-sdk.browser.js"></script>
    <script>
      const params = new URLSearchParams(location.search);
      const appId = params.get("appId");
      const publicKey = params.get("publicKey");

      window.magicfeedback.init({ env: "prod" });

      const form = window.magicfeedback.form(appId, publicKey);
      form.generate("survey-root", {
        addButton: true,
        addSuccessScreen: true,
        questionFormat: "slim",
        afterSubmitEvent: (event) => {
          window.ReactNativeWebView?.postMessage(
            JSON.stringify({ type: "afterSubmit", ...event }),
          );
        },
        onLoadedEvent: () => {
          window.ReactNativeWebView?.postMessage(
            JSON.stringify({ type: "loaded" }),
          );
        },
      });
    </script>
  </body>
</html>
```

## Montar el WebView en RN

```tsx
import { useState } from "react";
import { Modal, View, StyleSheet } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

const APP_ID = "APP_ID";
const PUBLIC_KEY = "PUBLIC_KEY";
const SURVEY_URL = `https://your-cdn.example.com/mf-survey.html?appId=${APP_ID}&publicKey=${PUBLIC_KEY}`;

export function FeedbackModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "afterSubmit" && msg.completed) {
        onClose();
      }
    } catch {
      // ignora mensajes que no sean JSON
    }
  };

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <WebView source={{ uri: SURVEY_URL }} onMessage={handleMessage} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "white" },
});
```

## Renderizar en un BottomSheet (o cualquier otra superficie RN)

Coloca el `<WebView>` dentro de la superficie RN que prefieras. El patrón es idéntico — modal, bottom sheet, pantalla dedicada — todos funcionan igual.

```tsx
// Con @gorhom/bottom-sheet
import BottomSheet from "@gorhom/bottom-sheet";

export function FeedbackBottomSheet() {
  return (
    <BottomSheet snapPoints={["80%"]}>
      <WebView source={{ uri: SURVEY_URL }} onMessage={handleMessage} />
    </BottomSheet>
  );
}
```

```tsx
// Pantalla dedicada
export function FeedbackScreen() {
  return <WebView source={{ uri: SURVEY_URL }} onMessage={handleMessage} />;
}
```

## Puente de eventos del WebView a RN

Dentro del HTML de la encuesta, cada evento de ciclo de vida del SDK se puede reenviar vía `postMessage`:

```js
form.generate("survey-root", {
  onLoadedEvent: () =>
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: "loaded" })),
  beforeSubmitEvent: (e) =>
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: "beforeSubmit", ...e })),
  afterSubmitEvent: (e) =>
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: "afterSubmit", ...e })),
  onBackEvent: (e) =>
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: "back", ...e })),
});
```

En el lado RN, dispatch por `msg.type`:

```tsx
const handleMessage = (event: WebViewMessageEvent) => {
  const msg = JSON.parse(event.nativeEvent.data);
  switch (msg.type) {
    case "loaded":       analytics.track("mf_loaded"); break;
    case "afterSubmit":  if (msg.completed) onComplete(); break;
    case "back":         break;
  }
};
```

## Personalizar la UI dentro del WebView

Como el WebView carga tu propio HTML, controlas el CSS exactamente igual que en una app web. Añade overrides de variables CSS al `<head>`:

```html
<style>
  :root {
    --mf-primary: #0f766e;
    --mf-bg-primary: #ffffff;
    --mf-text-primary: #0f172a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --mf-bg-primary: #0f172a;
      --mf-text-primary: #f8fafc;
    }
  }
</style>
```

Mira [Customization](/es/guides/customization/) para la superficie completa de variables.

## Enviar desde RN sin WebView

Si no necesitas la UI renderizada y solo quieres enviar feedback (p. ej. un prompt NPS one-off en UI nativa), puedes llamar a la API REST de MagicFeedback directamente desde RN — sin SDK. Es el mismo payload que el SDK envía internamente; pídele a tu contacto el contrato del endpoint para tu cuenta.

## Errores comunes

:::caution
No intentes importar `@magicfeedback/native` en código React Native. El SDK toca `window` a nivel de módulo y lanzará error.
:::

:::caution
El WebView debe permitir `localStorage` (activado por defecto en iOS/Android). No lo desactives si quieres que el resume de sesiones funcione.
:::

:::caution
Monta el WebView solo cuando el usuario abra la encuesta. Pre-montar WebViews ocultos malgasta memoria y puede liar a la analítica.
:::
