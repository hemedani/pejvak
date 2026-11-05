# Pejvak Web Rebrand — Phase 3 (player)

Written against: `f9b04d7`

Phase 3 covers the player screen, its scrubber and wave, transport grouping, and
the queue/timer sheets. The audit used `docs/DESIGN.md`, `docs/UI-REVIEW.md`
§3.3–§3.6 and the rendered player path.

## Findings

| # | Problem | Evidence | Proposed change | Scope | Confidence |
|---|---|---|---|---|---|
| 1 | Five labelled utilities sat in one wrapping row on the player, and volume kept a slider on a narrow viewport where the bar already hides it. The transport and the controls that belong to it were split. | `player-screen.tsx` "More controls"; `UI-REVIEW.md` §3.4.10; `volume-control.tsx`; `player-bar.tsx` hides volume below `md`. | Speed moves beside the transport; Jump/Sleep collapse into a More menu below `md`; volume hides below `md`. Note stays inline. | Player screen | High |

The scrubber hit band (§3.4.11), sheet title clamp (§3.6.16) and wave/timeline
semantics (§3.6.15) already landed in Phase 1 or are history-surface work.

## Task — player control grouping (resolved)

- `components/player/player-more-menu.tsx` — Radix dropdown with Jump/Sleep.
- `player-screen.tsx` — speed beside transport; utilities responsive; volume
  hidden below `md`; sleep label computed once.
- Test: opening the menu calls the right handler; Jump is disabled on live.

## Done when

`npm run check` is green and a narrow player shows transport + speed, Note and
More — not five wrapping buttons.
