---
title: React Native
description: Estado actual del soporte React Native en este SDK.
---

## Estado actual

El SDK incluye un renderer para React Native, pero hoy es un stub. No renderiza una UI real por si solo.

## Que significa en la practica

- Necesitas conectar el renderer a tu propia capa de UI.
- Lo habitual es integrarlo con un `Modal`, contexto o bridge nativo.
- La documentacion debe tratar React Native como soporte base, no como integracion lista para usar sin codigo adicional.

## Recomendacion

Si vas a documentar React Native, describe claramente:

- que el renderer existe
- que es un stub
- que el host debe implementar la UI real

:::caution
No presentes React Native como una integracion plug-and-play si no existe esa capa de UI en el paquete publicado.
:::
