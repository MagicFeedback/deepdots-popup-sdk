# Messaging Tracking (`trackMessage`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a single `trackMessage(stage, options)` helper (Web + KMP) that emits one reserved `deepdots_message` analytics event, so the backend can derive Messaging metrics #18–22 (Delivered, CTR, Unique CTR Users, Conversion Rate, Action Users) for host app notifications (push + in-app), broken down by `message_title` / `registration_status` / `channel`.

**Architecture:** One method → one event. A pure `buildMessageParams(stage, options)` (mirrors `crashRecordToParams`) builds the event params; `trackMessage` is a thin wrapper over the existing gated `track('deepdots_message', …)`. The message funnel (delivered → clicked → converted) is correlated by `message_id` and grouped by `message_title`; `channel` distinguishes push vs in_app. Host-instrumented (the SDK cannot observe the host's notification system automatically).

**Tech Stack:** TS + vitest (Web); Kotlin Multiplatform + kotlin.test (KMP).

**Event shape (`deepdots_message`):**
```json
{ "stage": "clicked", "message_id": "msg-42", "message_title": "Rebajas de verano", "channel": "push", "campaign": "summer_sale", "value": 49.9, "currency": "EUR" }
```
`campaign`/`value`/`currency` optional (omitted when absent). Extra `params` merged in.

---

## File Structure

- Create: `src/analytics/messaging.ts` — `MessageStage`, `TrackMessageOptions`, `buildMessageParams`.
- Create: `src/analytics/messaging.test.ts` — unit tests for `buildMessageParams`.
- Modify: `src/core/deepdots-popups.ts` — public `trackMessage`.
- Modify: `src/core/deepdots-popups.analytics.test.ts` — integration test.
- Modify: `src/index.ts` — export helper + types.
- Create (KMP): `shared/src/commonMain/kotlin/com/deepdots/sdk/analytics/Messaging.kt` — `buildMessageParams`.
- Modify (KMP): `shared/src/commonMain/kotlin/com/deepdots/sdk/DeepdotsPopups.kt` — public `trackMessage`.
- Modify (KMP): `shared/src/commonTest/kotlin/com/deepdots/sdk/DeepdotsPopupsAnalyticsTest.kt` — integration test.
- Modify: `scripts/seed-analytics.mjs` — `--focus=messaging` mode.
- Modify: `docs/ANALYTICS-BACKEND-SPEC.md` — document `deepdots_message` + #18–22 derivation.

---

## Task 1: Web — buildMessageParams + trackMessage

**Files:**
- Create: `src/analytics/messaging.ts`
- Create: `src/analytics/messaging.test.ts`
- Modify: `src/core/deepdots-popups.ts`
- Modify: `src/core/deepdots-popups.analytics.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing unit test**

Create `src/analytics/messaging.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildMessageParams } from './messaging';

describe('buildMessageParams', () => {
  it('maps stage + core fields; omits absent optionals', () => {
    const p = buildMessageParams('delivered', { id: 'msg-42', title: 'Rebajas', channel: 'push' });
    expect(p).toEqual({ stage: 'delivered', message_id: 'msg-42', message_title: 'Rebajas', channel: 'push' });
  });

  it('includes campaign/value/currency and merges extra params', () => {
    const p = buildMessageParams('converted', {
      id: 'm1', title: 'Verano', channel: 'in_app', campaign: 'summer', value: 49.9, currency: 'EUR',
      params: { placement: 'home' },
    });
    expect(p).toMatchObject({
      stage: 'converted', message_id: 'm1', message_title: 'Verano', channel: 'in_app',
      campaign: 'summer', value: 49.9, currency: 'EUR', placement: 'home',
    });
  });

  it('keeps value:0 (does not drop a falsy numeric)', () => {
    const p = buildMessageParams('converted', { id: 'm', title: 't', channel: 'push', value: 0 });
    expect(p.value).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/analytics/messaging.test.ts` → FAIL (`Cannot find module './messaging'`).

- [ ] **Step 3: Implement `src/analytics/messaging.ts`**
```typescript
/**
 * Messaging (#18–22): tracking de notificaciones del host (push / in-app).
 * Un único evento reservado `deepdots_message` con un campo `stage` discriminador;
 * el funnel se correlaciona por `message_id` y se agrupa por `message_title`.
 */

export type MessageStage = 'delivered' | 'clicked' | 'converted';

export interface TrackMessageOptions {
  /** Identificador del mensaje/notificación — correlaciona el funnel delivered→clicked→converted. */
  id: string;
  /** Título del mensaje — dimensión de agrupación de #18–22. */
  title: string;
  /** Canal de entrega. */
  channel: 'push' | 'in_app';
  /** Nombre de la campaña (opcional). */
  campaign?: string;
  /** Valor de conversión (opcional, típico en `stage: 'converted'`). */
  value?: number;
  currency?: string;
  /** Parámetros libres adicionales. */
  params?: Record<string, unknown>;
}

/** Construye los params del evento `deepdots_message` (omite opcionales ausentes). */
export function buildMessageParams(stage: MessageStage, o: TrackMessageOptions): Record<string, unknown> {
  const p: Record<string, unknown> = {
    stage,
    message_id: o.id,
    message_title: o.title,
    channel: o.channel,
  };
  if (o.campaign) p.campaign = o.campaign;
  if (o.value !== undefined) p.value = o.value;
  if (o.currency) p.currency = o.currency;
  return { ...p, ...(o.params ?? {}) };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/analytics/messaging.test.ts` → PASS (3).

- [ ] **Step 5: Add the integration test**

In `src/core/deepdots-popups.analytics.test.ts`, append inside the top-level `describe(...)`:
```typescript
  it('trackMessage emite deepdots_message con stage + message_id/title/channel (#18–22)', () => {
    popups.trackMessage('delivered', { id: 'msg-42', title: 'Rebajas de verano', channel: 'push', campaign: 'summer_sale' });
    popups.trackMessage('clicked', { id: 'msg-42', title: 'Rebajas de verano', channel: 'push' });
    popups.trackMessage('converted', { id: 'msg-42', title: 'Rebajas de verano', channel: 'push', value: 49.9, currency: 'EUR' });

    const msgs = popups.previewAnalytics().events.filter((e) => e.name === 'deepdots_message');
    expect(msgs).toHaveLength(3);
    expect(msgs[0].params).toMatchObject({ stage: 'delivered', message_id: 'msg-42', message_title: 'Rebajas de verano', channel: 'push', campaign: 'summer_sale' });
    expect(msgs[2].params).toMatchObject({ stage: 'converted', value: 49.9, currency: 'EUR' });
  });
```

- [ ] **Step 6: Run — expect FAIL**

Run: `npx vitest run src/core/deepdots-popups.analytics.test.ts` → FAIL (`popups.trackMessage is not a function`).

- [ ] **Step 7: Implement `trackMessage` in `src/core/deepdots-popups.ts`**

Add the import next to the other analytics imports (e.g. after the crash-reporter import line):
```typescript
import { buildMessageParams, type MessageStage, type TrackMessageOptions } from '../analytics/messaging';
```
Add the method immediately AFTER the existing `trackFunnelStep(...)` method (whose body is `this.track('deepdots_funnel_step', { funnel, step, task_id: taskId, ...(params ?? {}) });`):
```typescript
    /** Messaging (#18–22): registra una etapa del funnel de una notificación (push/in-app). No-op si tracking off. */
    trackMessage(stage: MessageStage, options: TrackMessageOptions): void {
        this.track('deepdots_message', buildMessageParams(stage, options));
    }
```

- [ ] **Step 8: Run — expect PASS**

Run: `npx vitest run src/core/deepdots-popups.analytics.test.ts` → PASS.

- [ ] **Step 9: Export from `src/index.ts`**

Add:
```typescript
export { buildMessageParams } from './analytics/messaging';
export type { MessageStage, TrackMessageOptions } from './analytics/messaging';
```

- [ ] **Step 10: Full suite + build**

Run: `npm test` → PASS (ignore ONLY a preexisting `renderPopup.inject-style.test.ts` failure if it appears).
Run: `npm run build` → success.

- [ ] **Step 11: Commit**
```bash
git add src/analytics/messaging.ts src/analytics/messaging.test.ts src/core/deepdots-popups.ts src/core/deepdots-popups.analytics.test.ts src/index.ts
git commit -m "Add trackMessage + deepdots_message event for Messaging metrics #18-22 (Web)"
```

---

## Task 2: KMP — buildMessageParams + trackMessage (parity)

**Working dir:** `/Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK` (stay on `main`).

**Files:**
- Create: `shared/src/commonMain/kotlin/com/deepdots/sdk/analytics/Messaging.kt`
- Modify: `shared/src/commonMain/kotlin/com/deepdots/sdk/DeepdotsPopups.kt`
- Modify: `shared/src/commonTest/kotlin/com/deepdots/sdk/DeepdotsPopupsAnalyticsTest.kt`

- [ ] **Step 1: Write the failing test**

In `shared/src/commonTest/kotlin/com/deepdots/sdk/DeepdotsPopupsAnalyticsTest.kt`, append to the class (it has the `sdk()` helper + imports `jsonPrimitive`; add `import kotlinx.serialization.json.double` near the top if needed for the value assertion):
```kotlin
    @Test
    fun track_message_emits_deepdots_message_with_stage_and_core_fields() {
        val s = sdk()
        s.trackMessage("delivered", "msg-42", "Rebajas de verano", "push", campaign = "summer_sale")
        s.trackMessage("clicked", "msg-42", "Rebajas de verano", "push")
        s.trackMessage("converted", "msg-42", "Rebajas de verano", "push", value = 49.9, currency = "EUR")

        val msgs = s.previewAnalytics().events.filter { it.name == "deepdots_message" }
        assertEquals(3, msgs.size)
        assertEquals("delivered", msgs[0].params?.get("stage")?.jsonPrimitive?.content)
        assertEquals("msg-42", msgs[0].params?.get("message_id")?.jsonPrimitive?.content)
        assertEquals("Rebajas de verano", msgs[0].params?.get("message_title")?.jsonPrimitive?.content)
        assertEquals("push", msgs[0].params?.get("channel")?.jsonPrimitive?.content)
        assertEquals("summer_sale", msgs[0].params?.get("campaign")?.jsonPrimitive?.content)
        assertEquals("converted", msgs[2].params?.get("stage")?.jsonPrimitive?.content)
        assertEquals("EUR", msgs[2].params?.get("currency")?.jsonPrimitive?.content)
    }
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK && ./gradlew :shared:testDebugUnitTest` → BUILD FAILED (`trackMessage` unresolved).

- [ ] **Step 3: Create `shared/src/commonMain/kotlin/com/deepdots/sdk/analytics/Messaging.kt`**
```kotlin
package com.deepdots.sdk.analytics

/**
 * Messaging (#18–22): tracking de notificaciones del host (push / in-app).
 * Un único evento reservado `deepdots_message` con un campo `stage` discriminador;
 * el funnel se correlaciona por `message_id` y se agrupa por `message_title`.
 * Espejo del SDK Web (src/analytics/messaging.ts).
 */
fun buildMessageParams(
    stage: String,
    id: String,
    title: String,
    channel: String,
    campaign: String? = null,
    value: Double? = null,
    currency: String? = null,
    params: Map<String, Any?>? = null,
): Map<String, Any?> {
    val p = LinkedHashMap<String, Any?>()
    p["stage"] = stage
    p["message_id"] = id
    p["message_title"] = title
    p["channel"] = channel
    campaign?.let { p["campaign"] = it }
    value?.let { p["value"] = it }
    currency?.let { p["currency"] = it }
    params?.let { p.putAll(it) }
    return p
}
```

- [ ] **Step 4: Add `trackMessage` in `DeepdotsPopups.kt`**

Add the method immediately AFTER the existing `trackFunnelStep(...)` method:
```kotlin
    /** Messaging (#18–22): registra una etapa del funnel de una notificación (push/in-app). No-op si tracking off. */
    fun trackMessage(
        stage: String,
        id: String,
        title: String,
        channel: String,
        campaign: String? = null,
        value: Double? = null,
        currency: String? = null,
        params: Map<String, Any?>? = null,
    ) {
        track("deepdots_message", com.deepdots.sdk.analytics.buildMessageParams(stage, id, title, channel, campaign, value, currency, params))
    }
```

- [ ] **Step 5: Run — expect PASS + iOS compile**

Run: `cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK && ./gradlew :shared:testDebugUnitTest` → BUILD SUCCESSFUL.
Run: `cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK && ./gradlew compileKotlinIosSimulatorArm64` → BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**
```bash
cd /Users/sarias/AndroidStudioProjects/DeepdotsPopupSDK
git add shared/src/commonMain/kotlin/com/deepdots/sdk/analytics/Messaging.kt \
  shared/src/commonMain/kotlin/com/deepdots/sdk/DeepdotsPopups.kt \
  shared/src/commonTest/kotlin/com/deepdots/sdk/DeepdotsPopupsAnalyticsTest.kt
git commit -m "Add trackMessage + deepdots_message event for Messaging metrics #18-22 (KMP)"
```

---

## Task 3: Seed — `--focus=messaging` mode

**Files:**
- Modify: `scripts/seed-analytics.mjs`

- [ ] **Step 1: Add a messaging campaign pool**

Near the other pools (e.g. after `MISC_EVENTS`), add:
```javascript
const CAMPAIGNS = [
  { title: 'Rebajas de verano', campaign: 'summer_sale' },
  { title: 'Vuelve el stock', campaign: 'back_in_stock' },
  { title: 'Tu carrito te espera', campaign: 'cart_reminder' },
  { title: 'Bienvenido a la app', campaign: 'welcome' },
  { title: 'Oferta flash 24h', campaign: 'flash_deal' },
  { title: 'Pedido enviado', campaign: 'order_shipped' },
  { title: 'Baja de precio', campaign: 'price_drop' },
];
```

- [ ] **Step 2: Emit message funnels in `buildTimeline`**

Inside `buildTimeline`, immediately BEFORE the `// errores/crashes` block (after the engagement pulses `emit('deepdots_user_engagement', ...)` loop), add:
```javascript
  // Messaging (#18–22): notificaciones entregadas → click → conversión (funnel por message_id).
  const msgCount = FOCUS === 'messaging' ? randint(2, 5) : (chance(0.35) ? randint(1, 2) : 0);
  for (let m = 0; m < msgCount; m++) {
    const c = pick(CAMPAIGNS);
    const channel = chance(0.6) ? 'push' : 'in_app';
    const id = `m-${c.campaign}-${randint(1000, 9999)}`;
    advance(randint(1, 20));
    emit('deepdots_message', { stage: 'delivered', message_id: id, message_title: c.title, channel, campaign: c.campaign });
    if (chance(0.38)) { // CTR ~38%
      advance(randint(1, 40));
      emit('deepdots_message', { stage: 'clicked', message_id: id, message_title: c.title, channel, campaign: c.campaign });
      if (chance(0.35)) { // conversión ~35% de los clicks
        advance(randint(2, 30));
        emit('deepdots_message', { stage: 'converted', message_id: id, message_title: c.title, channel, campaign: c.campaign, value: money(10, 200), currency: 'EUR' });
      }
    }
  }
```

- [ ] **Step 3: Update the FOCUS help comment**

Update the `FOCUS` declaration comment to include the new mode:
```javascript
const FOCUS = (args.find((a) => a.startsWith('--focus=')) ?? '').split('=')[1] || null; // 'mini-service' | 'crash' | 'messaging'
```
Also, when `FOCUS === 'messaging'`, keep crashes low — change the crashRate line's `FOCUS === 'mini-service' ? 0.03` branch to also cover messaging:
```javascript
  const crashRate = FOCUS === 'crash' ? 1 : (FOCUS === 'mini-service' || FOCUS === 'messaging') ? 0.03 : Math.min(0.4, 0.1 * profile.appVersionCrash);
```

- [ ] **Step 4: Dry-run sanity check**

Run: `node scripts/seed-analytics.mjs --dry-run --focus=messaging`
Expected: the example session's event list includes several `deepdots_message` entries. (No commit needed for a dry-run.)

- [ ] **Step 5: Commit**
```bash
git add scripts/seed-analytics.mjs
git commit -m "seed: add --focus=messaging to populate Messaging metrics #18-22"
```

---

## Task 4: Docs — backend contract

**Files:**
- Modify: `docs/ANALYTICS-BACKEND-SPEC.md`

- [ ] **Step 1: Add `deepdots_message` to the event catalogue**

In section 3, in the "Eventos del host" area (with the SDK-helper events like `deepdots_search`/`deepdots_funnel_step`), add:
```markdown
#### `deepdots_message`
Etapa del funnel de una notificación del host (push / in-app). Un único evento con un campo `stage` discriminador; el funnel se correlaciona por `message_id` y se agrupa por `message_title`.
```json
{ "stage": "clicked", "message_id": "msg-42", "message_title": "Rebajas de verano", "channel": "push", "campaign": "summer_sale", "value": 49.9, "currency": "EUR" }
```

| Campo | Valores | Descripción |
|---|---|---|
| `stage` | `delivered` / `clicked` / `converted` | Etapa del funnel del mensaje |
| `message_id` | string | Correlaciona las etapas del mismo mensaje |
| `message_title` | string | Dimensión de agrupación de #18–22 |
| `channel` | `push` / `in_app` | Canal de entrega |
| `campaign` | string? | Campaña (opcional) |
| `value` / `currency` | number / string | Valor de conversión (típico en `converted`) |

**Derivación de Messaging (#18–22)** (group by `message_title`, breakdown por `registration_status` del contexto y opcionalmente `channel`):
- **#18 Messages Delivered** = `count(stage='delivered')`
- **#19 CTR** = `count(stage='clicked') / count(stage='delivered')`
- **#20 Unique Click-Through Users** = `user_id` distintos con `stage='clicked'`
- **#21 Conversion Rate** = `count(stage='converted') / count(stage='delivered')`
- **#22 Action Users** = `user_id` distintos con `stage IN ('clicked','converted')`
```

- [ ] **Step 2: Commit**
```bash
git add docs/ANALYTICS-BACKEND-SPEC.md
git commit -m "Docs: document deepdots_message event + Messaging #18-22 derivation"
```

---

## Notas

- `trackMessage` es host-instrumentado (el SDK no observa el sistema de notificaciones del host). Cubre push + in-app; para push, el "delivered" real puede venir mejor del proveedor/backend — el host llama a `trackMessage('delivered', …)` cuando su handler de push/asset lo permite.
- Paridad Web↔KMP: mismo evento `deepdots_message`, mismos campos; TS usa options-object, KMP named params (igual que `reportError`).
- La guía de analytics centralizada (repo Deepdots-Documentation) se actualizará aparte (no en este repo).
