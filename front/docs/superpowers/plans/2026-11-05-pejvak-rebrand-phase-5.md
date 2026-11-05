# Phase 5 — polish

_The rebrand spec's final phase: forced colours, print, reduced-motion audit and
visual snapshots. The source work and the snapshot pass are both here._

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

## Found in the screenshots

Captured with `npm run capture` against a production server
(`BACKEND_URL=http://localhost:1405 npm run start`): 33 shots covering the eight
routes at desktop and mobile, light and dark, plus a reduced-motion pass.

- The narrow users table forced itself wider than the viewport for a long email,
  clipping the row instead of the text. The email cell now breaks on small
  screens and truncates only from `md` up; the table's scroll width equals its
  client width at 390 and 360 px.
- The page requested `/favicon.ico` and got a 404 on every route. `src/app/icon.svg`
  now serves the brand mark, so the shell is complete in the browser chrome.

## Not done here

- Print pagination of very long tables (browser default; no `@page` rules until
  a real printed artefact is asked for).

## Done when

`npm run check` is green.
