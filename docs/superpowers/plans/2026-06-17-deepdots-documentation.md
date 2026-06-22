# Deepdots Documentation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single unified Astro + Starlight documentation site in the `Deepdots-Documentation` repo, with one product "topic" per SDK (Popup Web, Popup Native KMP, Surveys), migrating the existing two docs sites and adding KMP stubs.

**Architecture:** One Astro + Starlight project. The `starlight-sidebar-topics` plugin provides a product switcher; each SDK is a topic whose sidebar autogenerates from its own directory. i18n uses Starlight's native locales with English (`root`) as source of truth and `es`/`da` mirrors. Content lives under `src/content/docs/<sdk>/...` (en) and `src/content/docs/<locale>/<sdk>/...` (es/da). Deploys to GitHub Pages at `https://magicfeedback.github.io/Deepdots-Documentation`.

**Tech Stack:** Astro 5, `@astrojs/starlight` ^0.37, `starlight-sidebar-topics`, GitHub Actions → GitHub Pages, Node 20.

**Working directory for ALL tasks:** `/Users/sarias/develop/Deepdots-Documentation` (the cloned empty repo). The source content is read from `/Users/sarias/develop/deepdots-popup-sdk` (referred to below as `$SRC`).

**Source/destination mapping reference:**

| Source (in `$SRC`)                                  | Destination (new repo)                          |
|-----------------------------------------------------|-------------------------------------------------|
| `docs/src/content/docs/{getting-started,guides,reference}` | `src/content/docs/popup-web/...`         |
| `docs/src/content/docs/index.md`                    | `src/content/docs/popup-web/index.md`           |
| `docs/src/content/docs/es/...`                      | `src/content/docs/es/popup-web/...`             |
| `docs/src/content/docs/da/...`                      | `src/content/docs/da/popup-web/...`             |
| `docs-magicfeedback-sdk/src/content/docs/...`       | `src/content/docs/surveys/...` (+ es/da mirror) |
| (new)                                               | `src/content/docs/popup-native/...` (+ es/da)   |

**Internal-link rewrite rules** (existing content uses absolute root-relative links):
- en files: `](/getting-started/` → `](/<sdk>/getting-started/`, same for `/guides/` and `/reference/`.
- es files: `](/es/getting-started/` → `](/es/<sdk>/getting-started/`, same for guides/reference.
- da files: `](/da/getting-started/` → `](/da/<sdk>/getting-started/`, same for guides/reference.

---

## Task 1: Scaffold the Astro + Starlight project

**Files:**
- Create: `/Users/sarias/develop/Deepdots-Documentation/package.json`
- Create: `/Users/sarias/develop/Deepdots-Documentation/tsconfig.json`
- Create: `/Users/sarias/develop/Deepdots-Documentation/.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "deepdots-documentation",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "@astrojs/starlight": "^0.37.0",
    "astro": "^5.18.1"
  },
  "overrides": {
    "@astrojs/sitemap": "3.5.0",
    "zod": "3.25.76"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`** (copy of the source docs tsconfig)

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```gitignore
node_modules/
dist/
.astro/
.DS_Store
```

- [ ] **Step 4: Install dependencies**

Run:
```bash
cd /Users/sarias/develop/Deepdots-Documentation
npm install
npm install starlight-sidebar-topics
```
Expected: installs astro, starlight, and the latest `starlight-sidebar-topics` (its resolved version is written into `package.json`/`package-lock.json`); exit 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/sarias/develop/Deepdots-Documentation
git add package.json package-lock.json tsconfig.json .gitignore
git commit -m "chore: scaffold Astro + Starlight project"
```

---

## Task 2: Content collection config + unified Astro config

**Files:**
- Create: `src/content.config.ts`
- Create: `astro.config.mjs`
- Create: `src/assets/.gitkeep` (placeholder so the dir exists before Task 7 adds logos)

- [ ] **Step 1: Create `src/content.config.ts`**

```ts
import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema(),
  }),
};
```

- [ ] **Step 2: Create `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightSidebarTopics from 'starlight-sidebar-topics';

const vercelSite =
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : undefined;
const githubPagesSite =
  process.env.GITHUB_PAGES === 'true' && process.env.GITHUB_REPOSITORY_OWNER
    ? `https://${process.env.GITHUB_REPOSITORY_OWNER}.github.io`
    : undefined;
const site = process.env.SITE_URL || vercelSite || githubPagesSite;
const base =
  process.env.BASE_PATH
  || (process.env.GITHUB_PAGES === 'true' && process.env.GITHUB_REPOSITORY
    ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}`
    : undefined);

export default defineConfig({
  site,
  base,
  integrations: [
    starlight({
      title: 'Deepdots Documentation',
      description: 'Official documentation for the Deepdots SDK ecosystem.',
      favicon: '/favicon.ico',
      disable404Route: true,
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        es: { label: 'Español', lang: 'es' },
        da: { label: 'Dansk', lang: 'da' },
      },
      social: [
        { icon: 'github', label: 'Popup Web', href: 'https://github.com/MagicFeedback/deepdots-popup-sdk' },
        { icon: 'github', label: 'Surveys', href: 'https://github.com/MagicFeedback/magicfeedback-sdk' },
      ],
      plugins: [
        starlightSidebarTopics([
          {
            label: { en: 'Popup Web SDK', es: 'SDK Popup Web', da: 'Popup Web SDK' },
            link: '/popup-web/',
            icon: 'rocket',
            items: [
              { label: 'Getting Started', autogenerate: { directory: 'popup-web/getting-started' } },
              { label: 'Guides', autogenerate: { directory: 'popup-web/guides' } },
              { label: 'Reference', autogenerate: { directory: 'popup-web/reference' } },
            ],
          },
          {
            label: { en: 'Popup Native (KMP)', es: 'Popup Nativo (KMP)', da: 'Popup Native (KMP)' },
            link: '/popup-native/',
            icon: 'phone',
            badge: { text: 'Beta', variant: 'caution' },
            items: [
              { label: 'Getting Started', autogenerate: { directory: 'popup-native/getting-started' } },
              { label: 'Guides', autogenerate: { directory: 'popup-native/guides' } },
              { label: 'Reference', autogenerate: { directory: 'popup-native/reference' } },
            ],
          },
          {
            label: { en: 'Surveys SDK', es: 'SDK de Surveys', da: 'Surveys SDK' },
            link: '/surveys/',
            icon: 'comment',
            items: [
              { label: 'Getting Started', autogenerate: { directory: 'surveys/getting-started' } },
              { label: 'Guides', autogenerate: { directory: 'surveys/guides' } },
              { label: 'Reference', autogenerate: { directory: 'surveys/reference' } },
            ],
          },
        ]),
      ],
    }),
  ],
});
```

Note: `starlight-sidebar-topics` manages the sidebar, so no top-level `sidebar` key is set. If `astro build` later errors on an unknown icon name, replace the offending `icon` with `'open-book'` (a guaranteed built-in).

- [ ] **Step 3: Create placeholder so assets dir is tracked**

Run: `cd /Users/sarias/develop/Deepdots-Documentation && mkdir -p src/assets && touch src/assets/.gitkeep`

- [ ] **Step 4: Commit**

```bash
cd /Users/sarias/develop/Deepdots-Documentation
git add astro.config.mjs src/content.config.ts src/assets/.gitkeep
git commit -m "feat: unified Starlight config with product topics and i18n"
```

---

## Task 3: Migrate Popup Web content (en/es/da) + rewrite links

**Files:**
- Create: `src/content/docs/popup-web/**` (from `$SRC/docs/src/content/docs`)
- Create: `src/content/docs/es/popup-web/**`, `src/content/docs/da/popup-web/**`

- [ ] **Step 1: Copy English (root) content into the popup-web topic**

```bash
SRC=/Users/sarias/develop/deepdots-popup-sdk
DST=/Users/sarias/develop/Deepdots-Documentation
mkdir -p "$DST/src/content/docs/popup-web"
cp -R "$SRC/docs/src/content/docs/getting-started" "$DST/src/content/docs/popup-web/"
cp -R "$SRC/docs/src/content/docs/guides"          "$DST/src/content/docs/popup-web/"
cp -R "$SRC/docs/src/content/docs/reference"       "$DST/src/content/docs/popup-web/"
cp "$SRC/docs/src/content/docs/index.md"           "$DST/src/content/docs/popup-web/index.md"
```

- [ ] **Step 2: Copy es/da locale content into the popup-web topic**

```bash
SRC=/Users/sarias/develop/deepdots-popup-sdk
DST=/Users/sarias/develop/Deepdots-Documentation
for L in es da; do
  mkdir -p "$DST/src/content/docs/$L/popup-web"
  cp -R "$SRC/docs/src/content/docs/$L/." "$DST/src/content/docs/$L/popup-web/"
done
```

- [ ] **Step 3: Rewrite internal links to the popup-web prefix**

```bash
DST=/Users/sarias/develop/Deepdots-Documentation
# English (root) files
find "$DST/src/content/docs/popup-web" -name '*.md' -print0 | xargs -0 sed -i '' \
  -e 's#](/getting-started/#](/popup-web/getting-started/#g' \
  -e 's#](/guides/#](/popup-web/guides/#g' \
  -e 's#](/reference/#](/popup-web/reference/#g'
# es/da files
for L in es da; do
  find "$DST/src/content/docs/$L/popup-web" -name '*.md' -print0 | xargs -0 sed -i '' \
    -e "s#](/$L/getting-started/#](/$L/popup-web/getting-started/#g" \
    -e "s#](/$L/guides/#](/$L/popup-web/guides/#g" \
    -e "s#](/$L/reference/#](/$L/popup-web/reference/#g"
done
```

- [ ] **Step 4: Verify no stale (un-prefixed) internal links remain**

Run:
```bash
DST=/Users/sarias/develop/Deepdots-Documentation
grep -rnE '\]\(/(es/|da/)?(getting-started|guides|reference)/' "$DST/src/content/docs/popup-web" "$DST/src/content/docs/es/popup-web" "$DST/src/content/docs/da/popup-web"
```
Expected: no output (all links now carry the `/popup-web/` segment).

- [ ] **Step 5: Commit**

```bash
cd /Users/sarias/develop/Deepdots-Documentation
git add src/content/docs/popup-web src/content/docs/es/popup-web src/content/docs/da/popup-web
git commit -m "feat: migrate Popup Web SDK docs into popup-web topic"
```

---

## Task 4: Migrate Surveys content (en/es/da) + rewrite links

**Files:**
- Create: `src/content/docs/surveys/**` (from `$SRC/docs-magicfeedback-sdk/src/content/docs`)
- Create: `src/content/docs/es/surveys/**`, `src/content/docs/da/surveys/**`

- [ ] **Step 1: Copy English (root) content into the surveys topic**

```bash
SRC=/Users/sarias/develop/deepdots-popup-sdk
DST=/Users/sarias/develop/Deepdots-Documentation
mkdir -p "$DST/src/content/docs/surveys"
cp -R "$SRC/docs-magicfeedback-sdk/src/content/docs/getting-started" "$DST/src/content/docs/surveys/"
cp -R "$SRC/docs-magicfeedback-sdk/src/content/docs/guides"          "$DST/src/content/docs/surveys/"
cp -R "$SRC/docs-magicfeedback-sdk/src/content/docs/reference"       "$DST/src/content/docs/surveys/"
cp "$SRC/docs-magicfeedback-sdk/src/content/docs/index.md"           "$DST/src/content/docs/surveys/index.md"
```

- [ ] **Step 2: Copy es/da locale content into the surveys topic**

```bash
SRC=/Users/sarias/develop/deepdots-popup-sdk
DST=/Users/sarias/develop/Deepdots-Documentation
for L in es da; do
  mkdir -p "$DST/src/content/docs/$L/surveys"
  cp -R "$SRC/docs-magicfeedback-sdk/src/content/docs/$L/." "$DST/src/content/docs/$L/surveys/"
done
```

- [ ] **Step 3: Rewrite internal links to the surveys prefix**

```bash
DST=/Users/sarias/develop/Deepdots-Documentation
find "$DST/src/content/docs/surveys" -name '*.md' -print0 | xargs -0 sed -i '' \
  -e 's#](/getting-started/#](/surveys/getting-started/#g' \
  -e 's#](/guides/#](/surveys/guides/#g' \
  -e 's#](/reference/#](/surveys/reference/#g'
for L in es da; do
  find "$DST/src/content/docs/$L/surveys" -name '*.md' -print0 | xargs -0 sed -i '' \
    -e "s#](/$L/getting-started/#](/$L/surveys/getting-started/#g" \
    -e "s#](/$L/guides/#](/$L/surveys/guides/#g" \
    -e "s#](/$L/reference/#](/$L/surveys/reference/#g"
done
```

- [ ] **Step 4: Verify no stale internal links remain**

Run:
```bash
DST=/Users/sarias/develop/Deepdots-Documentation
grep -rnE '\]\(/(es/|da/)?(getting-started|guides|reference)/' "$DST/src/content/docs/surveys" "$DST/src/content/docs/es/surveys" "$DST/src/content/docs/da/surveys"
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd /Users/sarias/develop/Deepdots-Documentation
git add src/content/docs/surveys src/content/docs/es/surveys src/content/docs/da/surveys
git commit -m "feat: migrate Surveys SDK docs into surveys topic"
```

---

## Task 5: Create Popup Native (KMP) stub pages (en/es/da)

**Files:**
- Create: `src/content/docs/popup-native/{index.md,getting-started/installation.md,guides/overview.md,reference/api.md}`
- Create: `src/content/docs/{es,da}/popup-native/{...same four...}`

- [ ] **Step 1: Generate the stub tree with a script**

```bash
DST=/Users/sarias/develop/Deepdots-Documentation
gen() { # $1=dir  $2=title  $3=desc
  mkdir -p "$(dirname "$1")"
  cat > "$1" <<EOF
---
title: $2
description: $3
---

:::caution
This documentation is a work in progress. The Popup Native (KMP) SDK reference is being written.
:::

$2 — coming soon.
EOF
}

# English (root)
gen "$DST/src/content/docs/popup-native/index.md"                    "Popup Native SDK (KMP)" "Show Deepdots surveys as native popups on Android and iOS via the Kotlin Multiplatform SDK."
gen "$DST/src/content/docs/popup-native/getting-started/installation.md" "Installation" "Add the Deepdots Popup Native SDK to your Android/iOS project."
gen "$DST/src/content/docs/popup-native/guides/overview.md"         "Overview" "How the native popup SDK works on Android and iOS."
gen "$DST/src/content/docs/popup-native/reference/api.md"           "API Reference" "Public API of the Deepdots Popup Native SDK."

# Spanish
gen "$DST/src/content/docs/es/popup-native/index.md"                    "SDK Popup Nativo (KMP)" "Muestra encuestas de Deepdots como popups nativos en Android e iOS mediante el SDK Kotlin Multiplatform."
gen "$DST/src/content/docs/es/popup-native/getting-started/installation.md" "Instalación" "Añade el SDK Popup Nativo de Deepdots a tu proyecto Android/iOS."
gen "$DST/src/content/docs/es/popup-native/guides/overview.md"         "Visión general" "Cómo funciona el SDK de popup nativo en Android e iOS."
gen "$DST/src/content/docs/es/popup-native/reference/api.md"           "Referencia de API" "API pública del SDK Popup Nativo de Deepdots."

# Danish
gen "$DST/src/content/docs/da/popup-native/index.md"                    "Popup Native SDK (KMP)" "Vis Deepdots-undersøgelser som native popups på Android og iOS via Kotlin Multiplatform SDK'et."
gen "$DST/src/content/docs/da/popup-native/getting-started/installation.md" "Installation" "Tilføj Deepdots Popup Native SDK til dit Android/iOS-projekt."
gen "$DST/src/content/docs/da/popup-native/guides/overview.md"         "Oversigt" "Sådan fungerer det native popup-SDK på Android og iOS."
gen "$DST/src/content/docs/da/popup-native/reference/api.md"           "API-reference" "Offentligt API for Deepdots Popup Native SDK."
```

- [ ] **Step 2: Verify 12 stub files exist**

Run: `find /Users/sarias/develop/Deepdots-Documentation/src/content/docs -path '*popup-native*' -name '*.md' | sort`
Expected: 12 paths (4 pages × 3 locales).

- [ ] **Step 3: Commit**

```bash
cd /Users/sarias/develop/Deepdots-Documentation
git add src/content/docs/popup-native src/content/docs/es/popup-native src/content/docs/da/popup-native
git commit -m "feat: add Popup Native (KMP) stub docs"
```

---

## Task 6: Root landing page (en/es/da)

**Files:**
- Create: `src/content/docs/index.mdx`
- Create: `src/content/docs/es/index.mdx`, `src/content/docs/da/index.mdx`

Note: these landing pages use `<Card>`/`<CardGrid>` components, which require the `.mdx`
extension (plain `.md` cannot import/use components).

- [ ] **Step 1: Create the English splash landing**

`src/content/docs/index.mdx`:
```mdx
---
title: Deepdots Documentation
description: Official documentation for the Deepdots SDK ecosystem — Popup Web, Popup Native (KMP), and Surveys.
template: splash
hero:
  tagline: Choose the SDK you are integrating.
  actions:
    - text: Popup Web SDK
      link: /popup-web/
      icon: right-arrow
    - text: Popup Native (KMP)
      link: /popup-native/
      icon: right-arrow
      variant: minimal
    - text: Surveys SDK
      link: /surveys/
      icon: right-arrow
      variant: minimal
---

import { Card, CardGrid } from '@astrojs/starlight/components';

<CardGrid>
  <Card title="Popup Web SDK" icon="rocket">
    Show Deepdots surveys as popups in your web product. [Read the docs](/popup-web/).
  </Card>
  <Card title="Popup Native (KMP)" icon="phone">
    Native popups for Android and iOS via Kotlin Multiplatform. [Read the docs](/popup-native/).
  </Card>
  <Card title="Surveys SDK" icon="comment">
    Render and submit Deepdots survey feedback. [Read the docs](/surveys/).
  </Card>
</CardGrid>
```

- [ ] **Step 2: Create the Spanish landing**

`src/content/docs/es/index.mdx`:
```mdx
---
title: Documentación de Deepdots
description: Documentación oficial del ecosistema de SDKs de Deepdots — Popup Web, Popup Nativo (KMP) y Surveys.
template: splash
hero:
  tagline: Elige el SDK que vas a integrar.
  actions:
    - text: SDK Popup Web
      link: /es/popup-web/
      icon: right-arrow
    - text: Popup Nativo (KMP)
      link: /es/popup-native/
      icon: right-arrow
      variant: minimal
    - text: SDK de Surveys
      link: /es/surveys/
      icon: right-arrow
      variant: minimal
---

import { Card, CardGrid } from '@astrojs/starlight/components';

<CardGrid>
  <Card title="SDK Popup Web" icon="rocket">
    Muestra encuestas de Deepdots como popups en tu producto web. [Ver la documentación](/es/popup-web/).
  </Card>
  <Card title="Popup Nativo (KMP)" icon="phone">
    Popups nativos para Android e iOS mediante Kotlin Multiplatform. [Ver la documentación](/es/popup-native/).
  </Card>
  <Card title="SDK de Surveys" icon="comment">
    Renderiza y envía feedback de encuestas de Deepdots. [Ver la documentación](/es/surveys/).
  </Card>
</CardGrid>
```

- [ ] **Step 3: Create the Danish landing**

`src/content/docs/da/index.mdx`:
```mdx
---
title: Deepdots-dokumentation
description: Officiel dokumentation for Deepdots SDK-økosystemet — Popup Web, Popup Native (KMP) og Surveys.
template: splash
hero:
  tagline: Vælg det SDK, du integrerer.
  actions:
    - text: Popup Web SDK
      link: /da/popup-web/
      icon: right-arrow
    - text: Popup Native (KMP)
      link: /da/popup-native/
      icon: right-arrow
      variant: minimal
    - text: Surveys SDK
      link: /da/surveys/
      icon: right-arrow
      variant: minimal
---

import { Card, CardGrid } from '@astrojs/starlight/components';

<CardGrid>
  <Card title="Popup Web SDK" icon="rocket">
    Vis Deepdots-undersøgelser som popups i dit webprodukt. [Læs dokumentationen](/da/popup-web/).
  </Card>
  <Card title="Popup Native (KMP)" icon="phone">
    Native popups til Android og iOS via Kotlin Multiplatform. [Læs dokumentationen](/da/popup-native/).
  </Card>
  <Card title="Surveys SDK" icon="comment">
    Render og indsend Deepdots-undersøgelsesfeedback. [Læs dokumentationen](/da/surveys/).
  </Card>
</CardGrid>
```

- [ ] **Step 4: Commit**

```bash
cd /Users/sarias/develop/Deepdots-Documentation
git add src/content/docs/index.mdx src/content/docs/es/index.mdx src/content/docs/da/index.mdx
git commit -m "feat: add root landing pages for all locales"
```

---

## Task 7: Branding assets

**Files:**
- Create: `src/assets/logo-dark-long.svg`, `src/assets/logo-light-long.svg` (from `$SRC/docs/src/assets`)
- Create: `public/favicon.ico` (from `$SRC/docs/public/favicon.ico`)
- Modify: `astro.config.mjs` (add `logo` block); delete `src/assets/.gitkeep`

- [ ] **Step 1: Copy logos and favicon**

```bash
SRC=/Users/sarias/develop/deepdots-popup-sdk
DST=/Users/sarias/develop/Deepdots-Documentation
mkdir -p "$DST/src/assets" "$DST/public"
cp "$SRC/docs/src/assets/logo-dark-long.svg"  "$DST/src/assets/"
cp "$SRC/docs/src/assets/logo-light-long.svg" "$DST/src/assets/"
cp "$SRC/docs/public/favicon.ico"             "$DST/public/favicon.ico"
rm -f "$DST/src/assets/.gitkeep"
```

- [ ] **Step 2: Add the `logo` block to the starlight() config**

In `astro.config.mjs`, immediately after the `favicon: '/favicon.ico',` line, add:
```js
      logo: {
        light: './src/assets/logo-dark-long.svg',
        dark: './src/assets/logo-light-long.svg',
        replacesTitle: true,
      },
```

- [ ] **Step 3: Commit**

```bash
cd /Users/sarias/develop/Deepdots-Documentation
git add src/assets public astro.config.mjs
git commit -m "feat: add shared Deepdots branding (logo + favicon)"
```

---

## Task 8: Full build verification

**Files:** none (verification only).

- [ ] **Step 1: Build the site**

Run: `cd /Users/sarias/develop/Deepdots-Documentation && npm run build`
Expected: exit 0, no broken-link errors. Starlight validates internal links during build, so a stale link from Task 3/4 would fail here.

- [ ] **Step 2: Confirm all three topics and locales built**

Run:
```bash
DST=/Users/sarias/develop/Deepdots-Documentation
for p in popup-web popup-native surveys es/popup-web da/popup-web es/surveys da/surveys es/popup-native da/popup-native; do
  test -f "$DST/dist/$p/index.html" && echo "OK $p" || echo "MISSING $p";
done
```
Expected: all `OK`.

- [ ] **Step 3: Visual smoke check with dev server**

Run: `cd /Users/sarias/develop/Deepdots-Documentation && npm run dev` (background), then load `http://localhost:4321/`. Confirm: landing shows three cards; the product switcher lists Popup Web / Popup Native (Beta) / Surveys; switching changes the sidebar; the language picker offers English/Español/Dansk. Stop the dev server afterward.

- [ ] **Step 4: Commit any fixes** (only if Step 1–3 required edits)

```bash
cd /Users/sarias/develop/Deepdots-Documentation
git add -A && git commit -m "fix: resolve build/link issues found in verification"
```

---

## Task 9: GitHub Pages deployment workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create the workflow**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy Docs to GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Pages
        id: pages
        uses: actions/configure-pages@v5

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Build
        env:
          GITHUB_PAGES: "true"
          GITHUB_REPOSITORY: ${{ github.repository }}
          GITHUB_REPOSITORY_OWNER: ${{ github.repository_owner }}
          ASTRO_TELEMETRY_DISABLED: "1"
        run: npm run build

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

Note: the build derives `base: /Deepdots-Documentation` from `GITHUB_REPOSITORY`. `SITE_URL`/CNAME for `docs.deepdots.com` is intentionally NOT set here — the custom-domain cutover happens in the later deletion PR.

- [ ] **Step 2: Commit**

```bash
cd /Users/sarias/develop/Deepdots-Documentation
git add .github/workflows/deploy.yml
git commit -m "ci: deploy unified docs to GitHub Pages"
```

---

## Task 10: CLAUDE.md — centralized style & authoring rules

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Create `CLAUDE.md`**

```md
# Deepdots Documentation — Authoring rules

Unified documentation site for the Deepdots SDK ecosystem. Single Astro + Starlight
project; one "topic" (product) per SDK via `starlight-sidebar-topics`.

## Commands
- `npm run dev` — local dev server (http://localhost:4321).
- `npm run build` — production build; **validates internal links** (a broken link fails the build).
- `npm run preview` — preview the built site.

## Products (topics)
| Topic         | Directory                        | Source repo                                   |
|---------------|----------------------------------|-----------------------------------------------|
| Popup Web     | `src/content/docs/popup-web/`    | `github.com/MagicFeedback/deepdots-popup-sdk` |
| Popup Native  | `src/content/docs/popup-native/` | KMP SDK (Android + iOS)                       |
| Surveys       | `src/content/docs/surveys/`      | `github.com/MagicFeedback/magicfeedback-sdk`  |

Each product has exactly three sections: `getting-started/`, `guides/`, `reference/`.

## i18n
- English is the **source of truth**, at the root (`src/content/docs/<topic>/...`).
- `es/` and `da/` are mirrors: `src/content/docs/<locale>/<topic>/...`.
- Translations MUST mirror the English file tree — same filenames, same structure. Never let a
  locale diverge in which pages exist.
- Internal links are locale-aware: English uses `/popup-web/...`; `es` uses `/es/popup-web/...`;
  `da` uses `/da/popup-web/...`. Always include the topic segment.

## Adding a new SDK
1. Create `src/content/docs/<new-topic>/{getting-started,guides,reference}/` with an `index.md`.
2. Mirror it under `es/` and `da/`.
3. Register the topic in `astro.config.mjs` (`starlightSidebarTopics([...])`) with a `label`
   object (en/es/da), `link`, `icon`, and the three autogenerated section items.
4. Add a card + hero action to each `index.md` landing (root/es/da).

## Style & voice
- Audience-aware: each product's docs target that SDK's integrators only — do not cross-reference
  another product's internal pages except from the landing or an explicit "ecosystem" note.
- Terminology: client auth key is `publicKey` (= `apiKey`). Backend URLs: production
  `https://api.deepdots.com`, development `https://api-dev.deepdots.com`.
- Use Starlight components for structure: `Tabs`/`TabItem`, `Aside` (note/tip/caution/danger),
  `Steps`, `Card`/`CardGrid`. Import them from `@astrojs/starlight/components`.
- Code blocks: always set a language; show the minimal runnable snippet.
- Frontmatter: every page needs `title` and `description`.

## Ecosystem map
- **Popup Web** (`@magicfeedback/popup-sdk`) and **Popup Native** (KMP) decide when/how to show a
  popup and report popup status to `POST /sdk/popups`.
- **Surveys** (`@magicfeedback/native`) renders the survey UI and submits Feedback via `send()`.
- Both popup SDKs embed the Surveys SDK.

## Deploy
- GitHub Actions (`.github/workflows/deploy.yml`) → GitHub Pages at
  `https://magicfeedback.github.io/Deepdots-Documentation`.
- `base` is derived from the repo name at build time. The `docs.deepdots.com` custom domain will
  be cut over from the old `deepdots-popup-sdk` Pages site in a later migration step.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/sarias/develop/Deepdots-Documentation
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md authoring rules and ecosystem map"
```

---

## Task 11: Push to GitHub

**Files:** none.

- [ ] **Step 1: Push all commits**

Run:
```bash
cd /Users/sarias/develop/Deepdots-Documentation
git push -u origin main
```
Expected: branch `main` published to `MagicFeedback/Deepdots-Documentation`.

- [ ] **Step 2: Confirm the Pages build**

Manual: make the repo public and enable Pages (Source = GitHub Actions) in repo settings, then confirm the `Deploy Docs to GitHub Pages` workflow run succeeds and the site loads at `https://magicfeedback.github.io/Deepdots-Documentation`.

---

## Out of scope (separate later PR)
- Deleting `docs/` and `docs-magicfeedback-sdk/` from `deepdots-popup-sdk` (and equivalent in the
  Surveys repo), removing `vercel.json` and the old `docs-gh-pages.yml`, adding README pointers.
- Cutting over the `docs.deepdots.com` CNAME to the new repo.
- Writing real Popup Native (KMP) content (stubs only here).
