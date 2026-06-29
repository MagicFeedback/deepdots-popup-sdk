# Integración en React Native — Deepdots SDK

> **Objetivo: trabajo casi 0 en la app del cliente.** Envuelves tu app en un `<DeepdotsProvider config={...}>` (como un `SettingsProvider`) y el SDK hace TODO: identidad persistente, device info, plataforma, lifecycle (engagement), y render de surveys. Solo pasas el JSON de `init`.
>
> El `DeepdotsProvider` lo **provee el SDK** (`@magicfeedback/popup-sdk/react-native`): no hay que pegar código, solo importarlo y envolver la app.
>
> **Estado:** la analítica va en **dry-run** (imprime por consola lo que enviaría) hasta que backend publique `/sdk/analytics`. Los eventos de popup (`/sdk/popups`, Messaging) sí se envían.

---

## 1. Instalación

```bash
npm i @magicfeedback/popup-sdk
npm i react-native-webview          # render del survey
# opcionales (recomendados): el SDK los detecta y usa si están instalados
npm i react-native-mmkv             # persistencia del user_id (síncrono)
npm i react-native-device-info      # device info (Technology #11–13)
```

> Si no instalas MMKV/device-info, el SDK **degrada con elegancia** (storage en memoria, sin device info) — no rompe.

---

## 2. Integración mínima — envolver la app (importado del SDK)

El `DeepdotsProvider` **lo provee el SDK** (subpath `@magicfeedback/popup-sdk/react-native`). No hay que pegar ningún componente: solo envuelves tu app y pasas el `config`.

```tsx
// App.tsx
import { DeepdotsProvider } from '@magicfeedback/popup-sdk/react-native';

export default function App() {
  return (
    <DeepdotsProvider config={{
      apiKey: 'TU_PUBLIC_KEY',
      nodeEnv: __DEV__ ? 'development' : 'production',
      // analytics: { publicKey, integration }, // opcional: ENVÍA analítica a POST /sdk/feedback (sin esto → dry-run)
    }}>
      {/* …tu app… */}
    </DeepdotsProvider>
  );
}
```

✅ Con solo esto, el SDK hace TODO internamente (storage persistente, device info, platform, lifecycle/engagement, render de surveys en WebView). Ya tienes: **user_id persistente** (Users #1–4), **device info** (#11–13), **engagement time** (#8) y **render de surveys** (Messaging #18–22).

> El Provider auto-detecta `react-native-mmkv` y `react-native-device-info` si están instalados (recomendado). `react`, `react-native` y `react-native-webview` son peer-deps (tu app ya los tiene / instalas el webview).

---

## 3. Navegación — Page Views (#9–10) · una línea

El SDK no conoce tu navegación; notifícale la pantalla actual desde React Navigation:

```tsx
import { useNavigationContainerRef } from '@react-navigation/native';
import { useDeepdots } from '@magicfeedback/popup-sdk/react-native';

const navRef = useNavigationContainerRef();
const sdk = useDeepdots();
const report = () => { const r = navRef.getCurrentRoute(); if (r) sdk.setScreen(r.name); };

<NavigationContainer ref={navRef} onReady={report} onStateChange={report}>
  {/* … */}
</NavigationContainer>
```

---

## 4. Casos de uso por evento (con `useDeepdots()`)

```ts
const sdk = useDeepdots();
```

| Caso (PDF) | Código |
|---|---|
| **Breakdowns** (Registration Status, Pass Type, Sector, Pass Status) | `sdk.setUserAttributes({ registration_status:'registered', pass_type:'premium', sector:'retail', pass_status:'active' })` |
| **Meaningful interactions** (#29–30) | `sdk.track('add_to_cart', { product_id:'p1', value:49.9 })` |
| **Mini-Service** (#23, #27) | `sdk.enterMiniService('checkout','home')` … `sdk.exitMiniService()` |
| **Findability** (#31, #34, #35) | `sdk.trackSearch('zapatillas', resultsCount)` · `sdk.trackFindabilityFriction('checkout_address')` |
| **Funnel** | `sdk.trackFunnelStep('outstanding_task','task_started', taskId)` |
| **Mostrar un popup/survey** | `sdk.triggerEvent('mi_evento')` o `sdk.show({ surveyId, productId })` |
| **Privacidad (kill-switch)** | `sdk.setTrackingEnabled(false)` · o arrancar desactivado: `config={{ …, trackingEnabled: false }}` (hasta consentimiento) |

> Engagement (#8) y Page Views (#9–10) son **automáticos** con el Provider (§2) y la navegación (§3). Users/Engagement (#1–7) los calcula backend a partir de `user_id` + eventos.

---

## 5. Verificación (dry-run)

La analítica no se envía aún; el SDK imprime el payload (Metro/Flipper):

```ts
console.log(JSON.stringify(sdk.previewAnalytics(), null, 2)); // lo que se enviaría
sdk.flushAnalytics();                                          // fuerza el "envío" (dry-run)
// → [DeepdotsAnalytics] (dry-run · NO enviado) POST /sdk/analytics → { … }
```

---

## 6. Qué hace el SDK por ti (en `setupReactNative`)

| Pieza | Cómo |
|---|---|
| Persistencia `user_id` | adaptador MMKV (síncrono) si está; si no, in-memory |
| Device info | `react-native-device-info` → `device_type/os_version/device_model/app_version` |
| Platform | `Platform.OS` → `'ios'`/`'android'` en el envelope |
| `init()` | con storage/device/platform inyectados + tu `config` |
| Lifecycle | `AppState` → `onForeground()`/`onBackground()` (engagement + flush) |
| Render de survey | `ReactNativePopupRenderer` → HTML en WebView + traducción de eventos a `/sdk/popups` |

---

## Crash & error reporting

`setupReactNative` engancha automáticamente `global.ErrorUtils` para capturar los **errores JS no manejados** de la app RN — se reportan como evento `deepdots_app_crash` (persistidos en MMKV y reenviados en el siguiente arranque). No necesitas configurar nada.

Para reportar errores manualmente (capturados, con severidad y contexto):

```ts
try {
  // ...código que puede fallar
} catch (e) {
  sdk.reportError(e, { severity: 'error', context: { screen: 'Checkout' } });
}
```

> **Cobertura:** se capturan los errores del hilo **JS**. Los crashes **nativos** (iOS/Android bajo RN) requieren un crash reporter nativo dedicado (no incluido). Si el host ya usa uno (Crashlytics/Sentry), puede reenviar los errores a `reportError`.

`errorUtils` apunta por defecto a `globalThis.ErrorUtils` y puede pasarse explícitamente si tu entorno lo requiere:

```ts
setupReactNative(sdk, config, { errorUtils: global.ErrorUtils });
```

---

## 7. Notas / límites

- **`session_id`:** lo asigna el backend en la respuesta del evento de popup. Sin popups, `getSessionId()` es `null` y el backend cose por `user_id`. No es un error.
- **El survey** carga `@magicfeedback/native` desde CDN dentro del WebView → requiere conexión.
- **Envío real de analytics:** bloqueado por backend (endpoint `/sdk/analytics` + alta de Contact desde `user_id`). Cuando esté, se activa sin tocar tu integración.
- **Crashes (#14–17):** los errores JS no manejados se capturan automáticamente (ver §Crash & error reporting). Los crashes nativos bajo RN requieren un crash reporter nativo dedicado.
- **Provider:** se importa directamente del SDK (`@magicfeedback/popup-sdk/react-native`); no hay que pegar código. Internamente usa `setupReactNative` + `ReactNativePopupRenderer`, ambos también exportados por si quieres una integración a medida.
