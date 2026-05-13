---
title: Rendering surfaces
description: The SDK does not own the surface — render the survey inside any UI component your product needs.
---

> **Can we display the survey in a BottomSheet or a dedicated page instead of a modal?**

Yes. The SDK renders into **any DOM element you point it to** — it does not draw a modal, drawer, or bottom sheet itself. That makes it trivial to embed the survey inside whichever surface your product already uses for similar flows.

The only contract is: **provide an element with an id, pass that id to `form.generate(...)`, and the SDK will render into it.**

```html
<div id="survey-root"></div>
```

```ts
const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
await form.generate("survey-root");
```

Below are the common surface patterns.

---

## Dedicated page

The simplest surface — a full route in your SPA.

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

Good for NPS pages, long surveys, post-purchase flows, dedicated `/feedback` URLs.

---

## Modal

Render inside any modal component your design system already provides. The SDK does not care which library you use.

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

`questionFormat: "slim"` keeps each step compact inside a modal.

---

## Drawer / side panel

Identical pattern — the container just lives inside a drawer.

```tsx
<Drawer open={open} side="right" onClose={close}>
  <div id="survey-root" />
</Drawer>
```

Use it for inline product feedback, contextual surveys, "What can we improve?" prompts.

---

## Bottom sheet (mobile web)

A native-feeling bottom sheet is just a DOM container styled to slide up from the bottom. Use any library (vaul, react-modal-sheet, framer-motion) or roll your own.

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

For purely native bottom sheets in **React Native**, see [React Native](/reference/react-native/) — there the survey runs inside a `WebView` placed inside the bottom sheet.

---

## Inline section of an existing page

Embed the survey as part of a larger page (e.g. a feedback section at the bottom of a checkout success page).

```html
<main>
  <h1>Thanks for your purchase!</h1>
  <p>While you're here, we'd love your feedback.</p>
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

## Tab / accordion / wizard step

Anywhere your product already has nested content, the survey can be just one more panel.

```tsx
<Tabs>
  <TabPanel value="overview">…</TabPanel>
  <TabPanel value="feedback">
    <div id="survey-root" />
  </TabPanel>
</Tabs>
```

Mount the form when the panel becomes active, not on initial page load — otherwise you'll generate the form into a hidden container.

---

## Multiple surveys on the same page

If you need more than one survey on a single page, use distinct container ids and distinct form instances.

```ts
const a = magicfeedback.form("APP_ID", "PUBLIC_KEY");
const b = magicfeedback.form("OTHER_APP_ID", "OTHER_PUBLIC_KEY");

await a.generate("survey-root-a");
await b.generate("survey-root-b");
```

---

## Mounting and unmounting cleanly

Because the SDK renders directly into the container, the cleanest way to "destroy" a survey is to **remove the container from the DOM** (or empty it). In React, that happens automatically when the host component unmounts.

```tsx
useEffect(() => {
  const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
  form.generate("survey-root");

  return () => {
    // Container is removed by React when this component unmounts.
    // Nothing else to do.
  };
}, []);
```

If you re-render the survey in the same container, call `generate()` again with `clearContainer` semantics — by default the SDK replaces the container's contents.

---

## Picking a surface

| Surface          | Good for                                                  | Notes                                  |
| ---------------- | --------------------------------------------------------- | -------------------------------------- |
| Dedicated page   | Long surveys, NPS, post-purchase flows                    | Use `questionFormat: "standard"`.      |
| Modal            | Quick mid-session feedback, prompt after an event         | Use `questionFormat: "slim"`.          |
| Drawer / panel   | Contextual feedback inside an existing screen             | Same as modal.                         |
| Bottom sheet     | Mobile web, native-feeling micro-surveys                  | Use `"slim"` and short surveys.        |
| Inline section   | "While you're here" surveys after a primary action        | Keep it short to avoid friction.       |
| Wizard step      | Surveys as part of an onboarding or guided flow           | Mount on panel activation.             |
| React Native     | Native apps                                               | Use a `WebView` — see RN reference.    |
