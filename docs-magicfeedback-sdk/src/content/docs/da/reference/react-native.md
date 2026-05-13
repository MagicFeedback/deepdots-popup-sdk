---
title: React Native
description: Sådan viser du MagicFeedback-undersøgelser i en React Native-app via WebView.
---

## Hvorfor dette er anderledes end web

MagicFeedback SDK'et er et **browser**-bibliotek: det afhænger af `window`, `document` og `localStorage` for at rendere undersøgelsens UI direkte i DOM'en. React Native har ingen DOM, så SDK'et **kan ikke bruges direkte** fra RN-kode.

Den understøttede vej er at rendere den **hostede MagicFeedback-survey-URL inde i en `WebView`**. Det giver dig:

- Den samme survey-UI dine web-brugere ser, uden at vedligeholde en parallel native-implementation.
- Alle spørgsmålstyper SDK'et understøtter.
- Livscyklus-events bygget tilbage til din RN-app via `postMessage`.

## Installation

```bash
npm install react-native-webview
```

Du behøver **ikke** at installere `@magicfeedback/native` i RN-bundlen — WebView'et er host'en.

## Host survey'en

Du skal bruge en offentlig URL, som starter SDK'et og renderer én formular. To muligheder:

1. **MagicFeedback-hostet survey-URL** — bed din MagicFeedback-kontakt om den standalone survey-URL til dit `appId`/`publicKey`.
2. **Self-hostet tynd side** — én HTML-fil i dit CDN, som indlæser SDK'et og renderer formularen. Send `appId`, `publicKey` og evt. metadata via query params.

Eksempel på self-hostet side (`https://your-cdn.example.com/mf-survey.html`):

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

## Montér WebView'et i RN

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
      // ignorér beskeder der ikke er JSON
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

## Render i en BottomSheet (eller en hvilken som helst anden RN-overflade)

Placér `<WebView>` inden i den RN-overflade du bruger. Mønsteret er identisk — modal, bottom sheet, dedikeret skærm — alle fungerer ens.

```tsx
// Med @gorhom/bottom-sheet
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
// Dedikeret skærm
export function FeedbackScreen() {
  return <WebView source={{ uri: SURVEY_URL }} onMessage={handleMessage} />;
}
```

## Bro for events fra WebView'et til RN

Inde i survey-HTML'en kan hvert livscyklus-event fra SDK'et videresendes via `postMessage`:

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

På RN-siden dispatch'er du på `msg.type`:

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

## Tilpas UI'et inde i WebView'et

Da WebView'et indlæser din egen HTML, kontrollerer du CSS'et præcis som i en hvilken som helst web-app. Tilføj CSS-variabel-overrides til `<head>`:

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

Se [Customization](/da/guides/customization/) for hele variabel-overfladen.

## Indsend fra RN uden WebView

Har du ikke brug for det renderede UI og kun vil indsende feedback (fx en one-off NPS-prompt i native UI), kan du kalde MagicFeedbacks REST-API direkte fra RN — uden SDK. Det er samme payload som SDK'et sender internt; bed din MagicFeedback-kontakt om endpoint-kontrakten for din konto.

## Almindelige faldgruber

:::caution
Forsøg ikke at importere `@magicfeedback/native` i React Native-kode. SDK'et rører `window` på modulniveau og vil kaste fejl.
:::

:::caution
WebView'et skal tillade `localStorage` (slået til som standard på iOS/Android). Slå ikke storage fra hvis session-resume skal virke.
:::

:::caution
Mount WebView'et først, når brugeren faktisk åbner undersøgelsen. Pre-mounting af skjulte WebViews spilder hukommelse og kan forvirre analytics.
:::
