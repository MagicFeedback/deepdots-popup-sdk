---
title: Deepdots Popup SDK
description: Show Deepdots surveys as popups inside your product without building a custom popup system. Trigger them at the right moment and measure outcomes.
---

# Deepdots Popup SDK

The **Deepdots Popup SDK** lets your product show Deepdots surveys as popups at exactly the right moment — without building a custom popup system every time you want to ask for feedback.

You install the SDK, give it your API key, and the popups, triggers, targeting, and cooldowns are managed centrally from Deepdots. Your code only needs to mount the SDK once and, optionally, fire host events when something interesting happens in your business flow.

## What it does

- Shows your Deepdots surveys as popups inside your web product.
- Fires them based on time on page, scroll depth, click on an element, route exit, or a custom business event you emit.
- Targets specific routes of your site.
- Applies cooldowns so the same user is not interrupted twice.
- Emits events (`popup_shown`, `popup_clicked`, `survey_completed`) so you can measure the funnel.

## What you don't have to do

- You don't define popups in code. They live in Deepdots and are delivered to the SDK at runtime.
- You don't manage trigger logic, eligibility rules, or anti-spam cooldowns. The SDK handles them.
- You don't host or render the survey UI. The SDK does it for you.

## Typical use cases

- Feedback popup a few seconds after landing on a pricing page.
- Survey shown when a user is about to leave a product page.
- Survey triggered after a meaningful business event (e.g. repeated searches, purchase completed, cart abandoned).
- Popup visible only on specific routes.

## How it works at a glance

1. You call `popups.init({ mode: 'server', apiKey: '…' })` once when your app boots.
2. You call `popups.autoLaunch()` to activate the triggers that come from the Deepdots API.
3. Optionally, you call `popups.triggerEvent('your_event_name')` from your code when a business event happens.
4. You subscribe to SDK events to track popup interactions in your analytics.

## Where to go next

### Product, sales, customer success

- [What is a trigger](/guides/triggers/) — every way a popup can be launched.
- [Events the SDK emits](/guides/events/) — what your analytics will see.

### Technical integration

- [Installation](/getting-started/installation/)
- [Quickstart](/getting-started/quickstart/)
- [Triggers in detail](/guides/triggers/)
- [API reference](/reference/api/)
- [React](/reference/react/) · [React Native](/reference/react-native/)
