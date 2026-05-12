---
title: Deepdots Popup SDK
description: Muestra encuestas de Deepdots como popups dentro de tu producto sin construir un sistema de popups propio. Dispáralos en el momento justo y mide resultados.
---

# Deepdots Popup SDK

El **Deepdots Popup SDK** permite que tu producto muestre encuestas de Deepdots como popups en el momento exacto — sin necesidad de construir un sistema de popups a medida cada vez que quieras pedir feedback.

Instalas el SDK, le das tu API key, y los popups, triggers, segmentación y cooldowns se gestionan centralmente desde Deepdots. Tu código solo necesita inicializar el SDK una vez y, opcionalmente, lanzar eventos cuando ocurra algo relevante en tu flujo de negocio.

## Qué hace

- Muestra tus encuestas de Deepdots como popups dentro de tu producto web.
- Los dispara según tiempo en página, profundidad de scroll, click en un elemento, salida de ruta o un evento de negocio que tú emites.
- Segmenta por ruta del sitio.
- Aplica cooldowns para no interrumpir al mismo usuario dos veces.
- Emite eventos (`popup_shown`, `popup_clicked`, `survey_completed`) para que puedas medir el funnel.

## Lo que no tienes que hacer

- No defines popups en código. Viven en Deepdots y se entregan al SDK en tiempo de ejecución.
- No gestionas la lógica de triggers, las reglas de elegibilidad ni los cooldowns. Lo hace el SDK.
- No alojas ni renderizas la UI de la encuesta. Lo hace el SDK por ti.

## Casos de uso típicos

- Popup de feedback unos segundos después de llegar a la página de precios.
- Encuesta al detectar que un usuario está a punto de salir de una página de producto.
- Encuesta tras un evento de negocio relevante (búsquedas repetidas, compra completada, carrito abandonado…).
- Popup visible solo en rutas concretas.

## Cómo funciona, a grandes rasgos

1. Llamas a `popups.init({ mode: 'server', apiKey: '…' })` una vez al arrancar tu app.
2. Llamas a `popups.autoLaunch()` para activar los triggers que vienen de la API de Deepdots.
3. Opcionalmente, llamas a `popups.triggerEvent('nombre_evento')` desde tu código cuando ocurra un evento de negocio.
4. Te suscribes a los eventos del SDK para registrar las interacciones en tu analítica.

## Por dónde seguir

### Producto, ventas, customer success

- [Qué es un trigger](/es/guides/triggers/) — todas las formas en que un popup puede lanzarse.
- [Eventos que emite el SDK](/es/guides/events/) — qué verá tu analítica.

### Integración técnica

- [Instalación](/es/getting-started/installation/)
- [Quickstart](/es/getting-started/quickstart/)
- [Triggers en detalle](/es/guides/triggers/)
- [Referencia de la API](/es/reference/api/)
- [React](/es/reference/react/) · [React Native](/es/reference/react-native/)
