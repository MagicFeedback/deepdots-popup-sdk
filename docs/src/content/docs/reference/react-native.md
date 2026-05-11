---
title: React Native
description: How to integrate the Deepdots Popup SDK in a React Native application.
---

## Current state

The SDK ships a React Native renderer, but it is a **stub**: it logs lifecycle events and emits the right SDK events, but it does **not** render any UI on its own. To show a popup in a React Native app you must provide the UI layer (typically a `Modal` with a `WebView` or with native components) and feed completion/dismiss signals back into the SDK.

The SDK auto-detects RN via `navigator.product === 'ReactNative'` and picks the RN renderer in that case. You can replace it with your own renderer using `popups.setRenderer()`.

## Architecture

The SDK relies on a `PopupRenderer` interface:

```ts
interface PopupRenderer {
  init?(): void;
  show(
    surveyId: string,
    productId: string,
    data: Record<string, unknown> | undefined,
    emit: (type: DeepdotsEventType, surveyId: string, data?: Record<string, unknown>) => void,
    onClose: () => void,
  ): void;
  hide(): void;
}
```

When `popups.show(...)` runs (manually or via a trigger), the SDK calls `renderer.show(...)` and passes:

- `emit` — call it with `'survey_completed'` (and optionally `'popup_clicked'`) to feed events back into the SDK.
- `onClose` — call it when the user dismisses the modal so the SDK clears its internal state.

## Installation

```bash
npm install @magicfeedback/popup-sdk react-native-webview
```

## Custom renderer with `Modal` + `WebView`

The recommended integration is a single React component that:

1. Holds the current survey state.
2. Implements `PopupRenderer` and registers itself with the SDK via `setRenderer()`.
3. Renders a `Modal` containing a `WebView` pointing at your hosted MagicFeedback survey.
4. Listens to messages from the WebView and calls `emit('survey_completed', ...)`.

```tsx
// DeepdotsPopupHost.tsx
import { useEffect, useRef, useState } from 'react';
import { Modal, View, StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { DeepdotsPopups, DeepdotsEventType } from '@magicfeedback/popup-sdk';

type EmitFn = (
  type: DeepdotsEventType,
  surveyId: string,
  data?: Record<string, unknown>,
) => void;

type ActiveSurvey = {
  surveyId: string;
  productId: string;
  emit: EmitFn;
  onClose: () => void;
};

export function DeepdotsPopupHost({ userId }: { userId?: string }) {
  const [active, setActive] = useState<ActiveSurvey | null>(null);
  const popupsRef = useRef<DeepdotsPopups | null>(null);

  useEffect(() => {
    const popups = new DeepdotsPopups();

    popups.setRenderer({
      init() {},
      show(surveyId, productId, _data, emit, onClose) {
        setActive({ surveyId, productId, emit, onClose });
      },
      hide() {
        setActive(null);
      },
    });

    popups.init({
      mode: 'server',
      apiKey: 'YOUR_PUBLIC_API_KEY',
      userId,
    });
    popups.autoLaunch();
    popupsRef.current = popups;

    return () => {
      popups.setRenderer({ show() {}, hide() {} });
    };
  }, [userId]);

  const handleMessage = (event: WebViewMessageEvent) => {
    if (!active) return;
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'survey_completed') {
        active.emit('survey_completed', active.surveyId, msg.data);
        active.onClose();
        setActive(null);
      }
    } catch {
      // ignore non-JSON messages
    }
  };

  return (
    <Modal
      visible={!!active}
      animationType="slide"
      onRequestClose={() => {
        active?.onClose();
        setActive(null);
      }}
    >
      <View style={styles.container}>
        {active && (
          <WebView
            source={{
              uri: `https://app.magicfeedback.io/survey/${active.surveyId}?productId=${active.productId}`,
            }}
            onMessage={handleMessage}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
});
```

Mount the host once at the root of your app:

```tsx
// App.tsx
import { DeepdotsPopupHost } from './DeepdotsPopupHost';

export default function App() {
  return (
    <>
      <YourNavigation />
      <DeepdotsPopupHost userId="customer-123" />
    </>
  );
}
```

## Triggering a popup imperatively

Expose the SDK instance via a context or a ref and call `show()` from anywhere:

```tsx
popupsRef.current?.show({
  surveyId: 'survey-home-001',
  productId: 'product-main',
});
```

## Bridging events from the WebView

Your survey page must post messages back to the WebView so the SDK can record the answer. From the survey HTML (or MagicFeedback callback):

```js
window.ReactNativeWebView?.postMessage(
  JSON.stringify({ type: 'survey_completed', data: { rating: 9 } })
);
```

The `handleMessage` handler above translates that into `emit('survey_completed', ...)`, which fires the `survey_completed` SDK event and applies the popup's cooldown.

## Common pitfalls

:::caution
The default RN renderer is a stub — without `setRenderer()` you will only see console logs and no UI.
:::

:::caution
Always call both `emit('survey_completed', ...)` **and** `onClose()` when the user finishes the survey. Skipping `onClose()` leaves the SDK thinking a popup is still open.
:::

:::caution
Mount `<DeepdotsPopupHost />` once at the root. Mounting it from a screen will unmount the modal on navigation and lose in-flight surveys.
:::
