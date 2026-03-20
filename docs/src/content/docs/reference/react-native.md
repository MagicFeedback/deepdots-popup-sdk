---
title: React Native
description: Current state of React Native support in this SDK.
---

## Current state

The SDK includes a React Native renderer, but today it is only a stub. It does not render a real UI on its own.

## What this means in practice

- You need to connect the renderer to your own UI layer.
- The usual approach is to integrate it with a `Modal`, context, or native bridge.
- Documentation should describe React Native as basic support, not as a ready-to-use integration without additional code.

## Recommendation

If you document React Native, clearly explain:

- that the renderer exists
- that it is a stub
- that the host must implement the real UI

:::caution
Do not present React Native as a plug-and-play integration if that UI layer does not exist in the published package.
:::
