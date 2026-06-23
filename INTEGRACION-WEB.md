# Integración y pruebas — Web (JS / browser)

> Guía para integrar y **probar** el SDK `@magicfeedback/popup-sdk` en una app web (vanilla, React, Vue, etc.). En web **casi todo es automático**: el SDK usa las APIs del navegador, así que la integración es mínima comparada con React Native.
>
> **Automático en web (no requiere código del host):**
> - **user_id persistente** → `localStorage`
> - **page_view (#9–10)** → hooks de History API (`pushState`/`popstate`/`hashchange`)
> - **device info (#11–13)** → `navigator.userAgent` (backend deriva OS/modelo)
> - **engagement time (#8)** → `visibilitychange`/`pagehide`
> - **render de surveys (#18–22)** → popup en el DOM
>
> **Estado:** la analítica va en **dry-run** (imprime por consola lo que enviaría) hasta que backend publique `/sdk/analytics`. Los eventos de popup (`POST /sdk/popups`) sí se envían.

---

## 1. Instalación

```bash
npm i @magicfeedback/popup-sdk
```
O por CDN (ESM):
```html
<script type="module">
  import { DeepdotsPopups } from 'https://cdn.jsdelivr.net/npm/@magicfeedback/popup-sdk/dist/index.mjs';
</script>
```

---

## 2. Inicialización (esto es casi todo)

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

export const deepdots = new DeepdotsPopups();

deepdots.init({
  apiKey: 'TU_PUBLIC_KEY',
  nodeEnv: 'production',     // 'development' → api-dev.deepdots.com
  debug: false,             // true → logs de tracking/analytics en consola
  appVersion: '1.2.3',      // opcional, para Technology #11
  // userId: 'id-del-host', // opcional: si tu app ya identifica al usuario (no se persiste)
  // trackingEnabled: false, // opcional: arranca SIN trackear (p. ej. hasta consentimiento). Luego setTrackingEnabled(true)
  // analytics: { publicKey, integration }, // opcional: ENVÍA la analítica a POST /sdk/feedback (sin esto → dry-run)
});
```

✅ Con esto ya tienes, sin más código: identidad persistente (#1–4), engagement (#8), page views (#9–10), device (#11–13).

### React (web)
Si usas React, basta inicializar una vez (módulo singleton o un `useEffect` en la raíz). Opcionalmente, un provider sencillo:
```tsx
import { createContext, useContext, useEffect } from 'react';
import { deepdots } from './deepdots';
const Ctx = createContext(deepdots);
export const useDeepdots = () => useContext(Ctx);
export function DeepdotsProvider({ children }) {
  useEffect(() => { deepdots.init({ apiKey: 'PK', nodeEnv: 'production' }); }, []);
  return <Ctx.Provider value={deepdots}>{children}</Ctx.Provider>;
}
```
> La navegación con React Router se autodetecta (History API). Si usas rutas no basadas en URL, llama a `deepdots.setScreen(name)` en cada cambio.

---

## 3. Casos de uso por evento

```ts
deepdots.setUserAttributes({ registration_status:'registered', pass_type:'premium', sector:'retail', pass_status:'active' }); // breakdowns
deepdots.track('add_to_cart', { product_id:'p1', value:49.9 });            // meaningful interactions (#29–30)
deepdots.enterMiniService('checkout', 'home'); /* … */ deepdots.exitMiniService(); // mini-service (#23, #27)
deepdots.trackSearch('zapatillas', resultsCount);                          // findability (#31)
deepdots.trackFindabilityFriction('checkout_address');                     // findability friction (#34/#35)
deepdots.trackFunnelStep('outstanding_task', 'task_started', taskId);      // funnel
deepdots.setTrackingEnabled(false);                                        // kill-switch (privacidad)
```
> `page_view` (#9–10) y `user_engagement` (#8) son **automáticos**. El resto los disparas tú.

---

## 4. Mostrar popups / surveys (Messaging #18–22)

**Los popups se definen en Deepdots (backend) y el SDK los recibe de la API** — no se configuran en el código. Tras `init()`, el SDK los descarga; solo arrancas los triggers:
```ts
deepdots.autoLaunch();                 // empieza a evaluar los triggers de los popups recibidos
```
Disparo manual (triggers de tipo `event` definidos en backend):
```ts
deepdots.triggerEvent('checkout_abandonado');
```
Escuchar eventos:
```ts
deepdots.on('popup_shown', (e) => console.log(e));
deepdots.on('survey_completed', (e) => console.log(e));
```

---

## 5. Probar / verificar

Activa `debug: true` y expón el SDK para la consola:
```ts
deepdots.init({ apiKey: 'PK', nodeEnv: 'development', debug: true });
window.deepdots = deepdots; // para probar desde la consola del navegador
```

### Comandos útiles (consola del navegador)
```js
deepdots.getUserId()                  // user_id persistente
deepdots.getSessionId()               // null hasta que un popup recibe sessionId del backend
deepdots.previewAnalytics()           // el envelope que se ENVIARÍA (sin enviar)
deepdots.flushAnalytics()             // imprime el dry-run y vacía el buffer
deepdots.setTrackingEnabled(false)    // kill-switch
```

### Checklist de pruebas (acción → resultado esperado)

| # | Acción | Esperado |
|---|---|---|
| 1 | Cargar la página (con `debug`) | Consola: `[DeepdotsPopups] tracking · user_id: <uuid> · new_user: true`. DevTools → Application → Local Storage: `deepdots.user_id` + `deepdots.user.first_seen` |
| 2 | Recargar | mismo `user_id` (`new_user: false`) — returning |
| 3 | `deepdots.track('cta_click',{label:'x'})` | en `previewAnalytics().events` aparece `cta_click` |
| 4 | `deepdots.setUserAttributes({registration_status:'registered'})` | aparece en `previewAnalytics().context.attributes` |
| 5 | `deepdots.enterMiniService('checkout','home'); deepdots.track('t'); deepdots.exitMiniService()` | eventos `mini_service_enter` → `t` (con `mini_service`) → `mini_service_exit` (con `duration_seconds`) |
| 6 | Navegar (cambiar de ruta / `history.pushState`) | evento `page_view` con `screen` normalizado (`/producto/:id`) + `duration_seconds` |
| 7 | Cambiar de pestaña y volver | evento `user_engagement` con `engagement_time_msec` + flush dry-run |
| 8 | `deepdots.setTrackingEnabled(false)` | `getUserId()`/`getSessionId()` → `null`; `track()` no-op. Reactivar restaura el id |
| 9 | `deepdots.flushAnalytics()` | consola: `[DeepdotsAnalytics] (dry-run · NO enviado) POST /sdk/analytics → {…}`; buffer vacío |
| 10 | Mostrar un popup (apiKey real) | Network → `POST /sdk/popups` con body `{publicKey,status,popupId,userId}` (**sin** sessionId); respuesta `{sessionId}` → consola `session_id from backend: …` |
| 11 | Abrir el survey | consola `tracking · survey identity → {userId, sessionId, miniService}` (lo que va al `form()`) |

### Demo local del repo
```bash
node scripts/serve-static.mjs 5173      # sirve la raíz con MIME correcto para .mjs
# abre http://localhost:5173/examples/demo.html  (carga ../dist, debug:true, window.deepdots)
```
`examples/sdk-loader.js` controla la fuente: `local` (build de `./dist`) o `package_latest` (npm).

### Tests automáticos del SDK
```bash
npm test          # vitest (unit + integración)
npm run e2e       # Playwright (Chromium) contra la build local: identidad, page_view, session backend
npm run e2e:report
```

---

## 6. Notas / límites

- **Analytics en dry-run:** nada se envía aún; el `console.log` ES la verificación. Cuando backend publique `/sdk/analytics`, se activa el POST sin tocar tu integración.
- **`session_id`:** lo asigna el backend en la respuesta del evento de popup. Sin popups, `getSessionId()` es `null` y backend cose por `user_id`.
- **`406 "Contact not found"`** al postear a `/sdk/popups` con un `user_id` no registrado: es un bloqueo de backend conocido (alta de Contact desde `user_id`), no del SDK.
- **Crashes (#14–17):** fuera de scope (requieren crash reporter).
- **React Native:** integración distinta (puntos de inyección) → ver `INTEGRACION-REACT-NATIVE.md`.

---

## 7. Resumen — caso de uso → API → automático/manual

| Caso (PDF) | Web | Manual |
|---|---|---|
| Users 1–4 (identidad) | `init()` | — (auto, localStorage) |
| Engagement 5–8 | auto (sesión backend + engagement) | — |
| Page Views 9–10 | auto (History API) | `setScreen()` si rutas no-URL |
| Technology 11–13 | auto (UA) + `appVersion` en init | — |
| Messaging 18–22 | popups **recibidos de la API** + `autoLaunch()`/`triggerEvent()` | — (se definen en Deepdots) |
| Mini-Service 23–28 | `enterMiniService`/`exitMiniService` | sí |
| Meaningful 29–30 | `track(name, params)` | sí |
| Findability 31,34,35 | `trackSearch`/`trackFindabilityFriction` | sí |
| Rating/CSAT 32–33 | del survey | — |
| Funnel | `trackFunnelStep(funnel, step, taskId)` | sí |
| Privacidad | `setTrackingEnabled(bool)` | sí |
