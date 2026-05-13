---
title: Rendering surfaces
description: SDK'et ejer ikke overfladen — render undersøgelsen inden i enhver UI-komponent dit produkt har brug for.
---

> **Kan vi vise undersøgelsen i en BottomSheet eller en dedikeret side i stedet for en modal?**

Ja. SDK'et renderer ind i **et hvilket som helst DOM-element, du peger på** — det tegner ikke selv en modal, drawer eller bottom sheet. Det gør det trivielt at indlejre undersøgelsen i den overflade, dit produkt allerede bruger til lignende flows.

Eneste kontrakt: **giv et element et id, send id'et til `form.generate(...)`, og SDK'et renderer ind i det.**

```html
<div id="survey-root"></div>
```

```ts
const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
await form.generate("survey-root");
```

Herunder de mest almindelige overflademønstre.

---

## Dedikeret side

Den enkleste overflade — en hel rute i din SPA.

```tsx
// React
function FeedbackPage() {
  useEffect(() => {
    magicfeedback.init({ env: "prod" });
    const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
    form.generate("survey-root", { addButton: true, addSuccessScreen: true });
  }, []);

  return <div id="survey-root" />;
}
```

God til NPS-sider, lange undersøgelser, post-purchase-flows, dedikerede `/feedback`-URL'er.

---

## Modal

Render inden i den modal-komponent, dit designsystem allerede tilbyder. SDK'et er ligeglad med hvilket bibliotek du bruger.

```tsx
function FeedbackModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
    form.generate("survey-root", {
      addButton: true,
      addSuccessScreen: true,
      questionFormat: "slim",
      afterSubmitEvent: ({ completed }) => {
        if (completed) onClose();
      },
    });
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogBody>
        <div id="survey-root" />
      </DialogBody>
    </Dialog>
  );
}
```

`questionFormat: "slim"` holder hvert trin kompakt inde i en modal.

---

## Drawer / sidepanel

Samme mønster — containeren bor inde i drawer'en.

```tsx
<Drawer open={open} side="right" onClose={close}>
  <div id="survey-root" />
</Drawer>
```

Brug det til inline produktfeedback, kontekstuelle undersøgelser, "Hvad kan vi forbedre?"-prompts.

---

## Bottom sheet (mobil web)

En native-følende bottom sheet er bare en DOM-container, der er styled til at glide op fra bunden. Brug et bibliotek (vaul, react-modal-sheet, framer-motion) eller byg din egen.

```tsx
import { Drawer } from "vaul";

function FeedbackBottomSheet({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
    form.generate("survey-root", { questionFormat: "slim", addButton: true });
  }, [open]);

  return (
    <Drawer.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay />
        <Drawer.Content>
          <div id="survey-root" />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

Til rent native bottom sheets i **React Native**, se [React Native](/da/reference/react-native/) — dér kører undersøgelsen inde i en `WebView` placeret i bottom sheeten.

---

## Inline-sektion i en eksisterende side

Indlejr undersøgelsen som en del af en større side (fx en feedback-sektion i bunden af en checkout-success-side).

```html
<main>
  <h1>Tak for din ordre!</h1>
  <p>Mens du er her, vil vi rigtig gerne høre din feedback.</p>
  <section>
    <div id="survey-root"></div>
  </section>
</main>
```

```ts
const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
await form.generate("survey-root", { addButton: true });
```

---

## Tab / akkordeon / wizard-trin

Hvor end dit produkt har indlejret indhold, kan undersøgelsen være endnu et panel.

```tsx
<Tabs>
  <TabPanel value="overview">…</TabPanel>
  <TabPanel value="feedback">
    <div id="survey-root" />
  </TabPanel>
</Tabs>
```

Montér formularen når panelet bliver aktivt, ikke ved initial sideindlæsning — ellers genererer du formularen i en skjult container.

---

## Flere undersøgelser på samme side

Har du brug for mere end én undersøgelse på samme side, så brug distinkte container-ids og distinkte form-instanser.

```ts
const a = magicfeedback.form("APP_ID", "PUBLIC_KEY");
const b = magicfeedback.form("OTHER_APP_ID", "OTHER_PUBLIC_KEY");

await a.generate("survey-root-a");
await b.generate("survey-root-b");
```

---

## Rene mount/unmount

Da SDK'et renderer direkte i containeren, er den reneste måde at "destruere" en undersøgelse at **fjerne containeren fra DOM'en** (eller tømme den). I React sker det automatisk, når host-komponenten unmounter.

```tsx
useEffect(() => {
  const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
  form.generate("survey-root");

  return () => {
    // Containeren fjernes af React, når denne komponent unmounter.
    // Intet andet at gøre.
  };
}, []);
```

Renderer du undersøgelsen igen i samme container, så kald `generate()` igen — som standard erstatter SDK'et containerens indhold.

---

## Vælg en overflade

| Overflade        | God til                                                  | Noter                                  |
| ---------------- | -------------------------------------------------------- | -------------------------------------- |
| Dedikeret side   | Lange undersøgelser, NPS, post-purchase-flows            | Brug `questionFormat: "standard"`.     |
| Modal            | Hurtig feedback midt i sessionen, prompt efter en event  | Brug `questionFormat: "slim"`.         |
| Drawer / panel   | Kontekstuel feedback inde i en eksisterende skærm        | Samme som modal.                       |
| Bottom sheet     | Mobil web, native-følende mikro-undersøgelser            | Brug `"slim"` og korte undersøgelser.  |
| Inline-sektion   | "Mens du er her"-undersøgelser efter en primær handling  | Hold den kort for at undgå friktion.   |
| Wizard-trin      | Undersøgelser som del af onboarding eller guidet flow    | Mount ved panel-aktivering.            |
| React Native     | Native apps                                              | Brug en `WebView` — se RN-referencen.  |
