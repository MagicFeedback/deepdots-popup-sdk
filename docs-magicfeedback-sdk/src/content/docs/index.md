---
title: MagicFeedback SDK
description: Render MagicFeedback surveys and forms directly inside your product, wherever you need them — from a dedicated page to a modal, drawer, or bottom sheet.
---

# MagicFeedback SDK

The **MagicFeedback SDK** (`@magicfeedback/native`) is a browser SDK that renders MagicFeedback surveys and forms directly into a DOM container of your choice. You stay in full control of where the survey appears, how it looks, and what happens before and after each submission.

## What it does

- **Renders** a hosted MagicFeedback form into any DOM element you point it to.
- **Resumes** an existing survey session by `sessionId`.
- **Submits** feedback directly via API when you already own the UI.
- **Previews** a single question or page locally for QA.
- **Exposes lifecycle events** — `onLoadedEvent`, `beforeSubmitEvent`, `afterSubmitEvent`, `onBackEvent`.

## What it is *not*

- It is **not** a modal or popup framework. The SDK does not draw a modal, drawer, or bottom sheet — it renders into whatever container you give it. Place that container wherever your product needs the survey to appear.
- It is **not** a WebView wrapper. On the web, the survey is rendered as **plain DOM inside your page**, fully styleable with CSS.
- It is **not** a React Native native renderer. For React Native, the recommended path is to load the hosted MagicFeedback survey URL inside a `WebView` — see the [React Native reference](/reference/react-native/).

## Typical questions answered by this SDK

- *"Is the survey rendered in a WebView? Can we customize the UI?"* → No, it's plain DOM on the web; full CSS customization via variables. See [Customization](/guides/customization/).
- *"Can we display it in a BottomSheet or a dedicated page instead of a modal?"* → Yes. The SDK doesn't impose a surface — you pick where to render it. See [Rendering surfaces](/guides/rendering-surfaces/).

## Where to go next

- [Installation](/getting-started/installation/)
- [Quickstart](/getting-started/quickstart/)
- [Customization](/guides/customization/)
- [Rendering surfaces](/guides/rendering-surfaces/)
- [Lifecycle events](/guides/events/)
- [API reference](/reference/api/)
- [React](/reference/react/) · [React Native](/reference/react-native/)
