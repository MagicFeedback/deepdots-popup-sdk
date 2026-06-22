# Ejemplo React Native — validar Deepdots SDK en runtime

App de prueba con botones para cada caso de uso. El tracking de analytics va en **dry-run**: el payload se imprime en la consola de **Metro** (`[DeepdotsAnalytics] (dry-run …)`). Los eventos de popup sí se envían a `/sdk/popups`.

## 1. Crear (o usar) una app RN

```bash
# nueva app
npx react-native@latest init DeepdotsDemo
cd DeepdotsDemo
```
(o usa tu app existente).

## 2. Instalar dependencias

```bash
# peer-deps que usa el SDK en RN
npm i react-native-webview          # render del survey
npm i react-native-mmkv             # persistencia (síncrono) — recomendado
npm i react-native-device-info      # device info — recomendado
cd ios && pod install && cd ..      # solo iOS
```

## 3. Instalar el SDK (aún no publicado → tarball local)

Desde el repo del SDK:
```bash
cd /Users/sarias/develop/deepdots-popup-sdk
npm run build
npm pack          # genera magicfeedback-popup-sdk-1.1.0.tgz
```
En la app:
```bash
npm i /Users/sarias/develop/deepdots-popup-sdk/magicfeedback-popup-sdk-1.1.0.tgz
```
> `npm pack` respeta `files: ["dist"]`, así que se publica `dist/` con los entries `.` y `./react-native`.

## 4. Copiar el `App.tsx`

Copia [`App.tsx`](./App.tsx) de esta carpeta a la raíz de la app. Rellena en él:
- `CONFIG.apiKey` → tu publicKey.
- `SURVEY.surveyId` / `productId` → un survey real del proyecto (para el botón "Mostrar survey").

## 5. Ejecutar

```bash
npm start            # Metro (mira aquí la consola del tracking)
npm run ios          # o: npm run android
```

## Qué validar

| Acción | Resultado esperado |
|---|---|
| "Ver identidad" | `user_id` no vacío; estable tras reiniciar la app (persistencia MMKV) |
| `setScreen(...)` ×2 | en consola: `analytics · track: page_view {screen, duration_seconds}` (`/product/:id` normalizado) |
| `setUserAttributes` | aparece en `context.attributes` del preview |
| `track`, mini-service, search, friction, funnel | eventos en el buffer (botón "previewAnalytics") con sus params/convenciones |
| "Mostrar survey" | se abre el WebView del survey; al completarlo → evento `survey_completed` (COMPLETED) |
| background/foreground (minimiza la app) | en consola: `user_engagement {engagement_time_msec}` + flush |
| "flushAnalytics" | `[DeepdotsAnalytics] (dry-run · NO enviado) POST /sdk/analytics → {…}` |
| `setTrackingEnabled(false)` | `getUserId()`/`getSessionId()` → null; los `track` dejan de acumular |

## Navegación real (React Navigation)

En lugar de los botones `setScreen`, en tu `NavigationContainer`:
```tsx
import { useDeepdots } from '@magicfeedback/popup-sdk/react-native';
const dd = useDeepdots();
const report = () => { const r = navRef.getCurrentRoute(); if (r) dd.setScreen(r.name); };
<NavigationContainer ref={navRef} onReady={report} onStateChange={report}>…</NavigationContainer>
```

## Notas

- Si NO instalas MMKV, el `user_id` no persistirá entre reinicios (cae a memoria) — el resto funciona.
- El survey carga `@magicfeedback/native` desde CDN dentro del WebView → requiere conexión.
- El envío real de analytics está bloqueado por backend (`/sdk/analytics` + Contact); hasta entonces, dry-run.
