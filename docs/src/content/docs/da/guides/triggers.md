---
title: Triggers
description: Alle de måder en popup kan udløses på, med kodeeksempler til hver.
---

En **trigger** afgør *hvornår* en popup vises. Triggeren konfigureres af dit team i Deepdots og leveres automatisk til SDK'et — du skriver aldrig trigger-definitioner i kode.

Afhængigt af trigger-typen kan din applikation dog have brug for at gøre noget, for at triggeren faktisk kan udløses: rendere et element med et bestemt id, udsende en forretnings-event osv. Denne side forklarer hver type og viser den **host-side-kode**, der kræves.

## De fem trigger-typer

| Type            | Udløses når…                                                | Semantik for `value`                                |
| --------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| `time_on_page`  | Brugeren har været på en side i N sekunder.                 | `number` — **sekunder** på siden                    |
| `scroll`        | Brugeren har scrollet N% af sidens højde.                   | `number` — procent `0–100`                          |
| `click`         | Brugeren klikker på et element med et bestemt DOM-id.       | `string` — elementets `id`-attribut                 |
| `exit`          | Brugeren navigerer væk fra den nuværende rute.              | `number` — **sekunder** forsinkelse på næste rute   |
| `event`         | Din applikation kalder `popups.triggerEvent(name)`.         | `string` — event-navnet                             |

---

## `time_on_page`

Udløses efter at brugeren har brugt et antal sekunder på siden.

**Host-side-kode:** ingen. Så længe SDK'et er initialiseret og `autoLaunch()` er kaldt, starter SDK'et timeren, når siden indlæses.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();
popups.init({ mode: 'server', apiKey: 'YOUR_PUBLIC_API_KEY' });
popups.autoLaunch();
// Tids-triggers konfigureret i Deepdots udløses af sig selv.
```

:::tip
Brug `time_on_page` til engagement-undersøgelser: "hvordan er denne side indtil videre?", NPS efter landing osv.
:::

---

## `scroll`

Udløses, når brugeren har scrollet forbi en given procentdel af sidens højde.

**Host-side-kode:** ingen. SDK'et tilkobler sin egen scroll-listener og fjerner den, når tærsklen er nået.

```ts
popups.init({ mode: 'server', apiKey: 'YOUR_PUBLIC_API_KEY' });
popups.autoLaunch();
// En scroll-trigger konfigureret til 70% i Deepdots udløses
// automatisk, når brugeren når 70% af siden.
```

:::caution
Procenten måles mod `document.documentElement.scrollHeight`. På meget korte sider eller sticky-footer-layouts kan brugeren nå 100% uden meningsfuld interaktion. Test det inden produktion.
:::

---

## `click`

Udløses, når brugeren klikker på et DOM-element med et bestemt `id`.

**Host-side-kode:** din applikation skal rendere et element, hvis `id` matcher den værdi, der er konfigureret i Deepdots.

```html
<!-- Ethvert element med det konfigurerede id udløser popup'en -->
<button id="feedback-btn">Giv feedback</button>
```

Eller i et framework:

```tsx
// React
<button id="feedback-btn" onClick={handleClick}>
  Giv feedback
</button>
```

SDK'et tilkobler en engangs-klik-listener til elementet. Når den udløses, fjernes listeneren automatisk.

:::caution
Hvis elementet endnu ikke findes, når triggeren registreres, prøver SDK'et igen efter `DOMContentLoaded`. For elementer der monteres senere (SPA'er, modaler, lazy components) skal du sørge for, at id'et er i DOM'en, før brugeren kan klikke på det.
:::

---

## `exit`

Stiller en popup i kø til at vises på den **næste** rute, efter brugeren forlader den nuværende. Nyttigt til "før du går"-undersøgelser uden at blokere navigationen.

**Host-side-kode:** ingen for standard SPA-navigation. SDK'et patcher `history.pushState` / `history.replaceState` og lytter til `popstate`, `hashchange` og klik på links med samme origin. Ethvert normalt klientsidigt rute-skift detekteres.

```ts
popups.init({ mode: 'server', apiKey: 'YOUR_PUBLIC_API_KEY' });
popups.autoLaunch();
// Når brugeren navigerer væk fra en targetet rute,
// stilles popup'en i kø og vises på den næste rute efter den konfigurerede forsinkelse.
```

Sådan fungerer det i praksis:

1. Brugeren er på `/priser` (hvor en exit-trigger er targetet).
2. Brugeren klikker på et link til `/funktioner`.
3. SDK'et stiller popup'en i kø i `sessionStorage`.
4. På `/funktioner` vises popup'en efter den forsinkelse, der er konfigureret i Deepdots.

:::tip
Dette er det anbefalede mønster til "før du forlader pris-siden"-undersøgelser — det respekterer brugerens hensigt uden at bryde navigationen.
:::

---

## `event`

Udløses, når din applikation udsender en brugerdefineret forretnings-event ved navn. **Dette er den trigger-type, du vil bruge mest i kode.**

**Host-side-kode:** kald `popups.triggerEvent(eventName)`, når forretningsbetingelsen er opfyldt. Event-navnet skal matche nøjagtigt den værdi, der er konfigureret for triggeren i Deepdots.

```ts
import { DeepdotsPopups } from '@magicfeedback/popup-sdk';

const popups = new DeepdotsPopups();
popups.init({ mode: 'server', apiKey: 'YOUR_PUBLIC_API_KEY' });
popups.autoLaunch();

// Senere, når noget interessant sker i din app:
function onCheckoutCompleted() {
  popups.triggerEvent('checkout_completed');
}

function onSearchAttempted(query: string) {
  if (searchAttempts >= 3) {
    popups.triggerEvent('search_no_results');
  }
}
```

### Eksempel: React

```tsx
function CheckoutButton({ popups }: { popups: DeepdotsPopups }) {
  return (
    <button
      onClick={async () => {
        await placeOrder();
        popups.triggerEvent('checkout_completed');
      }}
    >
      Betal
    </button>
  );
}
```

### Eksempel: Vanilla JS i en hvilken som helst flow

```js
async function submitContactForm(data) {
  const ok = await api.submit(data);
  if (ok) {
    popups.triggerEvent('contact_form_sent');
  }
}
```

:::tip
Event-triggers giver dig mest kontrol. Brug dem til enhver popup, der skal udløses efter et specifikt forretningsresultat — køb, signup, plan-opgradering, gentagen fejlhandling osv.
:::

:::caution
Event-navne matches bogstaveligt. `'CheckoutCompleted'` er **ikke** det samme som `'checkout_completed'`. Aftal en navnekonvention (vi anbefaler lowercase snake_case) med det team, der konfigurerer popups i Deepdots.
:::

---

## Flere triggers på samme popup

En popup i Deepdots kan have mere end én trigger. En hvilken som helst af dem udløser popup'en (med forbehold for cooldowns og rute-targeting). For eksempel: en popup kan konfigureres til at udløses efter 30 sekunder **eller** når brugeren udsender `cart_abandoned`, alt efter hvad der sker først.

Du behøver ikke gøre noget særligt i kode — sørg bare for, at din applikation leverer de rette host-signaler (montering af klik-mål-id, kald af `triggerEvent` osv.) for hver trigger-type popup'en bruger.

---

## Vis en popup manuelt uden trigger

Hvis du har brug for at omgå triggers helt — for eksempel en "Feedback"-knap altid tilgængelig i footeren — kald `show()` eller `showByPopupId()` direkte:

```ts
popups.show({
  surveyId: 'survey-feedback-001',
  productId: 'product-main',
});

// Eller, hvis du kender popup-id'et fra Deepdots:
popups.showByPopupId('popup-footer-feedback');
```

Cooldowns og rute-targeting respekteres stadig.
