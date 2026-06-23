# Ejemplo React Native — validar Deepdots SDK en runtime

App de prueba con botones para cada caso de uso. El tracking de analytics va en **dry-run**: el payload se imprime en la consola de **Metro** (`[DeepdotsAnalytics] (dry-run …)`). Los eventos de popup sí se envían a `/sdk/popups`.

## ⚡ Vía rápida: un comando

```bash
bash /Users/sarias/develop/deepdots-popup-sdk/examples/react-native/setup.sh DeepdotsDemo ~/
```
Empaqueta el SDK, crea la app (`@react-native-community/cli`), instala SDK + peers (MMKV v3 opcional), copia `App.tsx` y hace `pod install`. Luego edita `App.tsx` (apiKey + survey) y `npm run ios` / `npm run android`.

> Requiere tener instalado el toolchain nativo (Xcode / Android Studio + CocoaPods). El script no compila ni arranca el simulador.

Si prefieres hacerlo a mano, sigue los pasos de abajo.

---

> ⚠️ **Ejecuta cada paso por separado y comprueba con `pwd` dónde estás.** NO encadenes con `&&`: si un comando falla (p. ej. el `init`), los `npm i` siguientes se ejecutarían en el repo del SDK y lo contaminan (meten el SDK como dependencia de sí mismo).

## 0. Empaquetar el SDK (en el repo del SDK)

```bash
cd /Users/sarias/develop/deepdots-popup-sdk
npm run build
npm pack          # genera magicfeedback-popup-sdk-1.1.0.tgz
```
> `npm pack` respeta `files: ["dist"]`, así que se publica `dist/` con los entries `.` y `./react-native`.

## 1. Crear la app RN — comando NUEVO (`react-native init` está deprecado)

```bash
cd ~/        # FUERA del repo del SDK
npx @react-native-community/cli@latest init DeepdotsDemo
cd DeepdotsDemo   # ← verifica con `pwd` que estás aquí antes de seguir
```

## 2. Instalar el SDK + peer-deps (DENTRO de DeepdotsDemo)

```bash
# RN 0.86 trae React 19 → usa --legacy-peer-deps para evitar el conflicto de peers
npm i /Users/sarias/develop/deepdots-popup-sdk/magicfeedback-popup-sdk-1.1.0.tgz --legacy-peer-deps
npm i react-native-webview react-native-mmkv react-native-device-info --legacy-peer-deps
cd ios && pod install && cd ..      # solo iOS
```
> Si `react-native-mmkv` falla con tu versión de RN, omítelo: el SDK degrada a memoria (solo se pierde la persistencia del `user_id`); el resto funciona.

## 3. Copiar el `App.tsx`

Copia [`App.tsx`](./App.tsx) de esta carpeta a la raíz de la app. Rellena en él:
- `CONFIG.apiKey` → tu publicKey.
- `SURVEY.surveyId` / `productId` → un survey real del proyecto (para el botón "Mostrar survey").

## 4. Ejecutar

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
