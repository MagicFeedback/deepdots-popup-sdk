---
title: MagicFeedback Popup SDK
description: Que hace el SDK, para que sirve en negocio y como ayuda a lanzar popups de feedback sin depender de desarrollos ad hoc.
---

# MagicFeedback Popup SDK

El `MagicFeedback Popup SDK` permite mostrar encuestas y formularios de feedback como popups dentro de una web o producto digital, sin tener que construir un sistema de popups a medida para cada iniciativa.

Esta pagina esta pensada como resumen para personas de producto, negocio, customer success o ventas que quieran entender rapidamente que resuelve y cuando tiene sentido usarlo.

## Que problema resuelve

Muchas veces una empresa quiere:

- lanzar una encuesta en un momento concreto del journey
- pedir feedback al abandonar una pagina importante
- activar una encuesta despues de una accion de negocio
- medir si ese popup se ha mostrado, abierto o completado

Sin un SDK como este, cada caso suele acabar en desarrollos aislados, logica duplicada y poca trazabilidad.

## Que hace en la practica

- Muestra popups de encuestas de MagicFeedback dentro de la web.
- Permite decidir cuando aparece cada popup.
- Soporta activacion por tiempo, scroll, click, cambio de ruta o evento de negocio.
- Permite segmentar por ruta.
- Emite eventos para que el equipo pueda medir impacto y comportamiento.

## Para quien es util

### Producto / PM

Sirve para lanzar iniciativas de feedback sin tener que redefinir cada vez la logica de disparo, elegibilidad y seguimiento.

### Ventas / Preventa

Ayuda a explicar que la solucion no es solo un formulario, sino una forma controlada de insertar encuestas en momentos clave del journey digital.

### Customer Success / Operaciones

Facilita probar escenarios, validar experiencias y coordinar cambios sin tocar toda la aplicacion.

## Casos de uso tipicos

- Popup de feedback tras unos segundos en una pagina de pricing.
- Encuesta al salir de una ficha de producto.
- Encuesta activada despues de un evento del negocio como una busqueda repetida o una compra.
- Popup solo visible en rutas concretas.

## Dos formas de trabajar

### Server mode

Recomendado para integraciones reales. Las definiciones de popup se descargan desde la API y se gestionan de forma centralizada.

### Client mode

Reservado para uso interno. Es util para demos, QA, prototipos y pruebas locales con definiciones inline, pero no es el modo publico de integracion que recomendamos a clientes.

## Si vienes de negocio

Empieza por estas paginas:

- [Server vs Client Mode](/es/guides/modes/)
- [Examples](/es/guides/examples/)
- [React Native](/es/reference/react-native/)
- [Demo publica](../demo/)

## Si vienes de integracion tecnica

Empieza por estas paginas:

- [Instalacion](/es/getting-started/installation/)
- [Quickstart](/es/getting-started/quickstart/)
- [Popup Definition](/es/reference/popup-definition/)
- [API](/es/reference/api/)
- [Demo publica](../demo/)

## Nota importante

La documentacion tecnica de este sitio esta escrita desde el comportamiento real del SDK actual. En especial:

- `triggers` es un array
- `cooldown` va separado de `triggers`
- los estados de progreso son `SHOWED`, `PARTIAL` y `COMPLETED`
