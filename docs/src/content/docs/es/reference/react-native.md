---
title: React Native
description: Cómo integrar el SDK de popups de Deepdots en una aplicación React Native.
---

## Estado actual

El SDK incluye un renderer para React Native, pero es un **stub**: registra eventos del ciclo de vida y emite los eventos correctos del SDK, pero **no** renderiza ninguna UI por sí mismo. Para mostrar un popup en una app React Native debes aportar la capa de UI (normalmente un `Modal` con un `WebView` o con componentes nativos) y devolver al SDK las señales de finalización/cierre.

El SDK detecta RN automáticamente mediante `navigator.product === 'ReactNative'` y selecciona el renderer RN en ese caso. Puedes sustituirlo por uno propio con `popups.setRenderer()`.

## Arquitectura

El SDK se apoya en la interfaz `PopupRenderer`:

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

Cuando se ejecuta `popups.show(...)` (manualmente o por un trigger), el SDK llama a `renderer.show(...)` y te pasa:

- `emit` — llámalo con `'survey_completed'` (y opcionalmente `'popup_clicked'`) para devolver eventos al SDK.
- `onClose` — llámalo cuando el usuario cierre el modal para que el SDK limpie su estado interno.

## Instalación

```bash
npm install @magicfeedback/popup-sdk react-native-webview
```

## Renderer personalizado con `Modal` + `WebView`

La integración recomendada es un único componente React que:

1. Mantiene el estado de la encuesta activa.
2. Implementa `PopupRenderer` y se registra en el SDK con `setRenderer()`.
3. Renderiza un `Modal` con un `WebView` apuntando a tu encuesta MagicFeedback.
4. Escucha mensajes del WebView y llama a `emit('survey_completed', ...)`.

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
      // ignora mensajes que no sean JSON
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

Monta el host una sola vez en la raíz de tu app:

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

## Disparar un popup de forma imperativa

Expón la instancia del SDK con un contexto o una ref y llama a `show()` desde cualquier sitio:

```tsx
popupsRef.current?.show({
  surveyId: 'survey-home-001',
  productId: 'product-main',
});
```

## Puente de eventos desde el WebView

Tu página de encuesta debe enviar mensajes al WebView para que el SDK registre la respuesta. Desde el HTML de la encuesta (o desde el callback de MagicFeedback):

```js
window.ReactNativeWebView?.postMessage(
  JSON.stringify({ type: 'survey_completed', data: { rating: 9 } })
);
```

El handler `handleMessage` mostrado arriba traduce eso en `emit('survey_completed', ...)`, lo que dispara el evento `survey_completed` del SDK y aplica el cooldown del popup.

## Errores comunes

:::caution
El renderer RN por defecto es un stub — sin `setRenderer()` solo verás logs en consola y ninguna UI.
:::

:::caution
Llama siempre a `emit('survey_completed', ...)` **y** a `onClose()` cuando el usuario termine la encuesta. Si te saltas `onClose()`, el SDK seguirá pensando que hay un popup abierto.
:::

:::caution
Monta `<DeepdotsPopupHost />` una sola vez en la raíz. Si lo montas dentro de una pantalla, al navegar se desmontará el modal y perderás encuestas en curso.
:::
