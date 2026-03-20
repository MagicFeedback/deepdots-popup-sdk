---
title: MagicFeedback Popup SDK
description: What the SDK does, the business value it provides, and how it helps teams launch feedback popups without building one-off solutions.
---

# MagicFeedback Popup SDK

The `MagicFeedback Popup SDK` lets teams show surveys and feedback forms as popups inside a website or digital product, without having to build a custom popup system for every initiative.

This page is designed as a business-friendly overview for product, sales, customer success, and operations teams who want to quickly understand what the SDK solves and when it is useful.

## What problem does it solve?

Teams often want to:

- launch a survey at a specific moment in the journey
- ask for feedback when a user leaves an important page
- trigger a survey after a business event
- measure whether a popup was shown, opened, or completed

Without an SDK like this, each use case often turns into ad hoc development, duplicated logic, and limited visibility.

## What does it do in practice?

- Shows MagicFeedback surveys as popups inside the web experience.
- Lets teams decide exactly when each popup appears.
- Supports triggers based on time, scroll depth, click, route change, or business event.
- Supports route-based targeting.
- Emits events so the host app can measure usage and outcomes.

## Who is it useful for?

### Product / PM

It helps launch feedback initiatives without redefining trigger logic, eligibility rules, and tracking every time.

### Sales / Presales

It helps explain that the solution is not just a form, but a controlled way to place surveys at key moments in the digital journey.

### Customer Success / Operations

It makes it easier to test scenarios, validate experiences, and coordinate changes without touching the whole application.

## Typical use cases

- Feedback popup after a few seconds on a pricing page.
- Survey shown when a user leaves a product page.
- Survey triggered after a business event like repeated search attempts or a purchase.
- Popup visible only on specific routes.

## Two ways to work

### Server mode

Recommended for real integrations. Popup definitions are fetched from the API and managed centrally.

### Client mode

Reserved for internal use. It is useful for demos, QA, prototypes, and local testing with inline definitions, but it is not the public integration mode we recommend to customers.

## If you come from the business side

Start with these pages:

- [Server vs Client Mode](/guides/modes/)
- [Examples](/guides/examples/)
- [React Native](/reference/react-native/)

## If you come from the technical integration side

Start with these pages:

- [Installation](/getting-started/installation/)
- [Quickstart](/getting-started/quickstart/)
- [Popup Definition](/reference/popup-definition/)
- [API](/reference/api/)

## Important note

The technical documentation in this site is written from the current runtime behavior of the SDK. In particular:

- `triggers` is an array
- `cooldown` is separate from `triggers`
- the progress states are `SHOWED`, `PARTIAL`, and `COMPLETED`
