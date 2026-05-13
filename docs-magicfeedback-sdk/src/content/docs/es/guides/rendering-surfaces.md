---
title: Rendering surfaces
description: El SDK no impone la superficie — renderiza la encuesta dentro del componente UI que tu producto necesite.
---

> **¿Podemos mostrar la encuesta en un BottomSheet o una página propia en lugar de un modal?**

Sí. El SDK renderiza dentro de **cualquier elemento del DOM al que le apuntes** — no dibuja un modal, drawer ni bottom sheet por sí mismo. Eso hace trivial empotrarla dentro de la superficie que tu producto ya use para flujos similares.

El único contrato es: **proporciona un elemento con un id, pasa ese id a `form.generate(...)` y el SDK renderiza dentro.**

```html
<div id="survey-root"></div>
```

```ts
const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
await form.generate("survey-root");
```

Debajo, los patrones de superficie más comunes.

---

## Página dedicada

La superficie más simple — una ruta entera en tu SPA.

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

Buena para encuestas NPS, encuestas largas, flujos post-compra, URLs dedicadas tipo `/feedback`.

---

## Modal

Renderiza dentro del componente modal que ya tenga tu design system. Al SDK le da igual qué librería uses.

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

`questionFormat: "slim"` mantiene cada paso compacto dentro de un modal.

---

## Drawer / panel lateral

Mismo patrón — el contenedor vive dentro del drawer.

```tsx
<Drawer open={open} side="right" onClose={close}>
  <div id="survey-root" />
</Drawer>
```

Útil para feedback inline en producto, encuestas contextuales, prompts tipo "¿Qué podemos mejorar?".

---

## Bottom sheet (móvil web)

Un bottom sheet con apariencia nativa es solo un contenedor del DOM estilado para subir desde abajo. Usa cualquier librería (vaul, react-modal-sheet, framer-motion) o monta el tuyo.

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

Para bottom sheets puramente nativos en **React Native**, mira [React Native](/es/reference/react-native/) — ahí la encuesta corre dentro de un `WebView` colocado dentro del bottom sheet.

---

## Sección inline de una página existente

Empótrala como parte de una página más grande (p. ej. una sección de feedback al final de la página de éxito de checkout).

```html
<main>
  <h1>¡Gracias por tu compra!</h1>
  <p>Ya que estás aquí, nos encantaría tu feedback.</p>
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

## Pestaña / acordeón / paso de wizard

En cualquier sitio donde tu producto ya tenga contenido anidado, la encuesta puede ser un panel más.

```tsx
<Tabs>
  <TabPanel value="overview">…</TabPanel>
  <TabPanel value="feedback">
    <div id="survey-root" />
  </TabPanel>
</Tabs>
```

Monta el formulario cuando el panel se active, no en la carga inicial — si no, generarías el formulario en un contenedor oculto.

---

## Varias encuestas en la misma página

Si necesitas más de una encuesta en la misma página, usa ids de contenedor e instancias distintas.

```ts
const a = magicfeedback.form("APP_ID", "PUBLIC_KEY");
const b = magicfeedback.form("OTHER_APP_ID", "OTHER_PUBLIC_KEY");

await a.generate("survey-root-a");
await b.generate("survey-root-b");
```

---

## Montaje y desmontaje limpios

Como el SDK renderiza directamente dentro del contenedor, la forma más limpia de "destruir" una encuesta es **quitar el contenedor del DOM** (o vaciarlo). En React, ocurre automáticamente cuando el componente host se desmonta.

```tsx
useEffect(() => {
  const form = magicfeedback.form("APP_ID", "PUBLIC_KEY");
  form.generate("survey-root");

  return () => {
    // El contenedor lo elimina React cuando este componente se desmonta.
    // No hace falta nada más.
  };
}, []);
```

Si vuelves a renderizar la encuesta en el mismo contenedor, llama de nuevo a `generate()` — por defecto el SDK reemplaza el contenido del contenedor.

---

## Elegir superficie

| Superficie         | Buena para                                              | Notas                                  |
| ------------------ | ------------------------------------------------------- | -------------------------------------- |
| Página dedicada    | Encuestas largas, NPS, flujos post-compra               | Usa `questionFormat: "standard"`.      |
| Modal              | Feedback rápido en mitad de sesión, tras un evento      | Usa `questionFormat: "slim"`.          |
| Drawer / panel     | Feedback contextual dentro de una pantalla existente    | Igual que el modal.                    |
| Bottom sheet       | Móvil web, micro-encuestas con sensación nativa         | Usa `"slim"` y encuestas cortas.       |
| Sección inline     | Encuestas "ya que estás aquí" tras una acción principal | Mantenla corta para evitar fricción.   |
| Paso de wizard     | Encuestas dentro de un onboarding o flujo guiado        | Monta al activar el panel.             |
| React Native       | Apps nativas                                            | Usa un `WebView` — mira la referencia. |
