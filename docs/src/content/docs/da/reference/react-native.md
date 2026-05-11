---
title: React Native
description: Sådan integrerer du Deepdots Popup SDK i en React Native-applikation.
---

## Aktuel status

SDK'et leveres med en React Native-renderer, men det er en **stub**: den logger livscyklus-hændelser og udsender de korrekte SDK-events, men den renderer **ingen** UI selv. For at vise en popup i en React Native-app skal du selv stille UI-laget til rådighed (typisk en `Modal` med en `WebView` eller med native komponenter) og sende fuldførelses-/luk-signaler tilbage til SDK'et.

SDK'et detekterer RN automatisk via `navigator.product === 'ReactNative'` og vælger RN-rendereren i det tilfælde. Du kan udskifte den med din egen via `popups.setRenderer()`.

## Arkitektur

SDK'et bygger på `PopupRenderer`-interfacet:

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

Når `popups.show(...)` kører (manuelt eller via en trigger), kalder SDK'et `renderer.show(...)` og giver dig:

- `emit` — kald den med `'survey_completed'` (og eventuelt `'popup_clicked'`) for at sende events tilbage til SDK'et.
- `onClose` — kald den når brugeren lukker modalet, så SDK'et kan rydde sin interne tilstand.

## Installation

```bash
npm install @magicfeedback/popup-sdk react-native-webview
```

## Custom renderer med `Modal` + `WebView`

Den anbefalede integration er en enkelt React-komponent, der:

1. Holder den aktive surveys tilstand.
2. Implementerer `PopupRenderer` og registrerer sig i SDK'et via `setRenderer()`.
3. Renderer en `Modal` med en `WebView`, der peger på din MagicFeedback-survey.
4. Lytter til beskeder fra WebView'et og kalder `emit('survey_completed', ...)`.

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
      // ignorér beskeder, der ikke er JSON
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

Montér hosten én gang i roden af din app:

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

## Udløs en popup imperativt

Eksponér SDK-instansen via en context eller en ref og kald `show()` hvor som helst:

```tsx
popupsRef.current?.show({
  surveyId: 'survey-home-001',
  productId: 'product-main',
});
```

## Bro for events fra WebView'et

Din survey-side skal sende beskeder tilbage til WebView'et, så SDK'et kan registrere svaret. Fra survey-HTML'en (eller MagicFeedback-callbacket):

```js
window.ReactNativeWebView?.postMessage(
  JSON.stringify({ type: 'survey_completed', data: { rating: 9 } })
);
```

`handleMessage`-handleren ovenfor oversætter det til `emit('survey_completed', ...)`, hvilket udløser SDK-eventet `survey_completed` og anvender popupens cooldown.

## Almindelige faldgruber

:::caution
Standard-RN-rendereren er en stub — uden `setRenderer()` ser du kun konsol-logs og ingen UI.
:::

:::caution
Kald altid både `emit('survey_completed', ...)` **og** `onClose()`, når brugeren afslutter surveyen. Hvis du springer `onClose()` over, tror SDK'et stadig, at en popup er åben.
:::

:::caution
Montér `<DeepdotsPopupHost />` én gang i roden. Hvis du monterer den fra en skærm, bliver modalen unmounted ved navigation, og igangværende surveys mistes.
:::
