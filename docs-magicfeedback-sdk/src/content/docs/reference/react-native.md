---
title: React Native
description: How to show MagicFeedback surveys in a React Native app via WebView.
---

## Why this is different from web

The MagicFeedback SDK is a **browser** library: it depends on `window`, `document`, and `localStorage` to render the survey UI directly into the DOM. React Native does not have a DOM, so the SDK **cannot be used directly** from RN code.

The supported path is to render the **hosted MagicFeedback survey URL inside a `WebView`**. That gives you:

- The same survey UI your web users see, with no parallel native implementation to maintain.
- All question types supported by the SDK.
- Lifecycle events bridged into your RN app via `postMessage`.

## Installation

```bash
npm install react-native-webview
```

There is **no** need to install `@magicfeedback/native` in the React Native bundle — the WebView is the host.

## Hosting the survey

You need a public URL that boots the SDK and renders one form. Two options:

1. **MagicFeedback-hosted survey URL** — ask your MagicFeedback contact for the standalone survey URL for your `appId`/`publicKey`.
2. **Self-hosted thin page** — a single HTML file in your CDN that loads the SDK and renders the form. Pass the `appId`, `publicKey`, and any metadata via query params.

Example self-hosted page (`https://your-cdn.example.com/mf-survey.html`):

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

## Mounting the WebView in RN

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
      // ignore non-JSON messages
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

## Rendering in a BottomSheet (or any other RN surface)

Place the `<WebView>` inside whichever RN surface you use. The pattern is identical — modal, bottom sheet, dedicated screen, all work the same.

```tsx
// With @gorhom/bottom-sheet
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
// Dedicated screen
export function FeedbackScreen() {
  return <WebView source={{ uri: SURVEY_URL }} onMessage={handleMessage} />;
}
```

## Bridging events from the WebView to RN

Inside the hosted survey HTML, every SDK lifecycle event can be forwarded via `postMessage`:

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

On the RN side, dispatch on `msg.type`:

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

## Customizing the UI inside the WebView

Because the WebView loads your own HTML, you control the CSS exactly like in any web app. Add CSS variable overrides to the `<head>`:

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

See [Customization](/guides/customization/) for the full variable surface.

## Submitting from RN without a WebView

If you don't need the rendered UI and only want to submit feedback (e.g. a one-off NPS prompt in native UI), you can call the MagicFeedback REST API directly from RN — no SDK needed. This is the same payload the SDK posts internally; ask your MagicFeedback contact for the endpoint contract for your account.

## Common pitfalls

:::caution
Do not try to import `@magicfeedback/native` in React Native code. The SDK touches `window` at module top-level and will throw.
:::

:::caution
The WebView must allow `localStorage` (enabled by default on iOS/Android). Don't disable storage if you want session resume to work.
:::

:::caution
Mount the WebView only when the user actually opens the survey. Pre-mounting hidden WebViews wastes memory and can confuse analytics.
:::
