# Phase 5 — polish, source-only

_The rebrand spec's final phase: forced colours, print, reduced-motion audit and
visual snapshots. Snapshots need a browser and are not claimable from this
session; everything that can be settled in source is settled here._

## Audited

- **Forced colours:** no block existed. Custom focus and active states would be
  replaced by the system palette and lose their distinction.
- **Print:** no rules existed, so the sidebar, topbar and floating player bar
  would print, and a dark-theme print would put light text on white paper.
- **Reduced motion:** already complete. CSS collapses duration and delay;
  `useMotionEnabled` covers the JS-drawn wave; the ambient wash is CSS.
- **Four states:** every list surface already renders skeleton, empty, error or
  offline. No change.

## Changes

- `styles/tokens.css` — a print palette that resolves both themes to light paper,
  keeps the accent, and removes the shadow.
- `app/globals.css` — print rules (stop reveal/page/skeleton motion, underline
  links, clear the shell padding) and a `forced-colors` block that keeps the
  focus ring, `aria-current`, skeletons and the ambient wash legible.
- Shell and admin layouts, sidebar, topbar, player bar — `print:hidden` on chrome,
  `print:*` padding/max-width reset on `<main>`.
- `lib/__tests__/design-tokens.test.ts` — guards the print palette, the
  forced-colours states and the chrome on paper.

## Not done here

- Screenshot capture for dark/light/narrow/coarse/reduced-motion.
- Print pagination of very long tables (browser default; no `@page` rules until
  a real printed artefact is asked for).

## Done when

`npm run check` is green.
