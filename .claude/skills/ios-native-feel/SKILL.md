---
name: ios-native-feel
description: The Mishwar front-end standard — it must feel like an App Store app on iPhone Safari first, in Arabic right to left. Use whenever you create or change any screen, component, layout, CSS or Tailwind class, navigation or tab bar, form input, dialog or sheet, loading or empty state, icon, web manifest, theme colour or design token, even for a small UI tweak. Not for data and sync behaviour (offline-first-pwa) or domain wording (gaza-transit-domain).
---

# iOS native feel

Riders decide in the first few taps. If the app zooms, wobbles or looks like a website,
they go back to waving at the roadside. Build for iPhone Safari first, then check Android
Chrome.

## Installable

- **Install basics** (details in the `pwa-manifest` skill):
  - standalone display and a stable manifest `id`;
  - icons: 192 and 512, a separate maskable icon, and a 180×180 opaque apple-touch-icon;
  - the theme colour matches the painted background, in light and dark;
  - the splash colour is the app background.
- **iOS has no install prompt.** In Safari and not standalone, show a short Arabic sheet
  that walks through Share, then Add to Home Screen.
- **Screen edges and height:**
  - `viewport-fit=cover`, with safe-area insets on every edge-anchored element (notch and
    home indicator).
  - `100dvh` with a `100vh` fallback; never a bare `100vh`.

## Never zoom by accident, never block zoom

- **Inputs:** every input, select and textarea is at least 16px computed (body text is
  17px). Anything smaller makes iOS Safari zoom on focus.
- **Width:** nothing is wider than the screen. No `100vw`, no fixed pixel widths. Check at
  320px.
- **Double-tap:** `touch-action: manipulation` on interactive elements, so double-tap
  doesn't zoom.
- **Keep pinch-zoom working.** Never `user-scalable=no` or `maximum-scale=1`: they fail
  accessibility and iOS ignores them anyway (P-701).

## App patterns

- **Bottom tab bar** for the main sections. It's rendered once in the root layout, so it
  survives navigation; it's safe-area padded, and content is padded so the last item is
  never hidden behind it.
- **Large titles** (34px bold) that compact on scroll.
- **Sheets that slide up from the bottom,** not centred pop-up dialogs.
  - One overlay primitive for everything.
  - Each one is history-backed, so back or swipe-back closes it.
  - Details in the `pwa-shell` skill.
- **Touch targets** at least 44×44px.
- **No hover-only controls.** Hover styles only inside
  `@media (hover: hover) and (pointer: fine)`.
- **Instant feedback on every tap:**
  - an `:active` state, paired with `-webkit-tap-highlight-color: transparent`;
  - optimistic UI for writes.
- **Skeletons, not spinners.**
  - Reserve space (fixed heights, `aspect-ratio` on images) so nothing jumps when data
    arrives.
- **An in-app back button on every screen deeper than a tab.** A standalone app has no
  browser back button.

## Right to left

- **Direction and spacing:**
  - `<html lang="ar" dir="rtl">`.
  - Logical properties only: `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`,
    `margin-inline-start`.
  - Never `ml-`, `mr-`, `left`, `right` for layout.
- **Icons:**
  - mirror direction icons (back and forward chevrons);
  - never mirror logos, the map, play buttons or clocks.
- **Mixed-direction text:** phone numbers, prices and plate numbers inside Arabic text go
  in `<bdi>`, or they scramble.
- Details in the `pwa-rtl` skill.

## Fonts

**Use Tajawal, self-hosted through `next/font/google`.**
- Weights 400, 500 and 700; subsets `arabic` and `latin`; `display: "swap"`.
- It's exposed as a CSS variable, with the system stack as fallback.
- The font files ship from our own origin, so the service worker caches them and the app
  reads well offline.
- Ahmed chose it over the system fonts, which looked compressed in the QA screenshots.

```css
font-family: var(--font-tajawal), system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif;
```

## Design tokens

- **One small set, in `references/tokens.md`:** colours, spacing, radius and type, in light
  and dark.
- **Defined once** as CSS custom properties and mapped into Tailwind.
- **Components use tokens only:** no raw hex, no one-off spacing.
- **If a design needs a value that isn't a token,** add the token deliberately, in the
  same PR.

## Before you call a UI change done

- **Run the static audit** (no browser needed): `node ~/.claude/skills/pwa-audit/scripts/run-audit.mjs .`
  - Fix every P0 and P1 FAIL before opening the PR.
  - Device-only items stay UNVERIFIED. They're checked by the fleet's phone screenshots
    and Ahmed's iPhone; never claim them green.
- **Add every new screen to `qa/routes.txt`** (see ship-safely) so the fleet photographs it
  at phone size.
