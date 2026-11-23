# Prompt 05 — Track detail + History Stats redesign (append-only)

> The original brief and the decisions taken while implementing it. Append-only: keep every sentence,
> add conditions rather than rewriting. See [`../plans/05-track-and-stats-redesign.md`](../plans/05-track-and-stats-redesign.md).

## 1. Original brief (owner, 2026-11-23)

> "I want to overhaul and redesign these two pages: The individual track page, I want to show all
> information we have about the track, and do not display empty informations. Also I want to get the
> most beautiful looks and feels (good UI UX). The stats tab in history page, we have several bugs in
> this page, like line breaking on long text key values, and also I want to have the most beautiful
> looks and feels (good UI UX). I attached the screenshots of that pages
> (`ignoreAssets/screenshot/5.jpg`, `6.jpg`)."

## 2. Decisions

| ID | Decision | Rationale |
|---|---|---|
| Q1 | Introduce shared `DetailBlock` primitives (`DetailSection`, `DetailRow`, `StatTile`) and use them on **both** screens | Owner prefers shared components upgraded once over per-screen patches (USER pref). `DetailRow` is the generalised, starvation-free version of the `Fact`/`FactRow` fix from plan 04. |
| Q2 | "Do not display empty information" = build each section's present-rows list first, then **omit the entire section** if it has no rows; and for a never-played track show one "not listened yet" state instead of four zero tiles. | The lone empty Tags circle and the `0 / 0% / 0s / Not played yet` grid in 5.jpg are exactly the empty-info the owner wants gone. |
| Q3 | Surface the already-loaded `SessionSummary` (days listened, avg, longest, speeds, first/last activity) plus `AudioInfo.channelMode/bitsPerSample/variableBitrate/durationSec`, tag version, track/disc number, folder/collection, mime, added date. | The data is fetched into `TrackDetailUiState` but never rendered — "show all information we have" is mostly a rendering task, no new queries. |
| Q4 | Stats `StatRow` bug fixed by routing through `DetailRow` (both columns weighted). | Identical root cause to plan 04 N2: an unbounded value measured before the `weight(1f)` label starves it to one-letter-per-line. |
| Q5 | Daily chart keeps a simple bar layout but gains rounded gradient bars, a baseline, and day-of-month labels at the ends + a total; media split becomes a proportional bar. | 6.jpg shows crude edge-to-edge white bars with no reference; keep it light-weight (no chart lib) but legible and on-brand. |

## 3. Addenda

_(append further decisions/changes here as they land)_

- 2026-11-23 — Shipped A1–A3, B1–B6, C1–C6, D1–D2. Shared `DetailBlock.kt` primitives now back both
  screens; `DetailRow` is the generalised starvation-free label/value line (both columns weighted).
  The track page renders the previously-unused `SessionSummary` and the extra `AudioInfo`/tag fields,
  and every section is hidden when it has no present rows (the empty Tags circle and the four zero
  tiles are gone). The Stats panel dropped `StatRow` entirely for headline + tiles + a media-split bar
  + a gradient daily chart + ranked leaders. Two `LazyListScope` gotchas were fixed: (1) `stringResource`
  cannot be called at the `LazyColumn` content scope — the row lists and chip labels moved inside their
  `item {}` blocks, with non-composable null checks deciding section visibility; (2) smart-casting the
  nullable `info` through a `hasAudio` boolean warning — bound it to a non-null local (`val audio = info;
  if (audio != null)`) instead. Leaders/longest kept non-interactive this round (no nav callback wired).
- 2026-11-23 — **Follow-up (E1).** Owner: the Library Tracks sub-tabs (Local/Online) need proper icons.
  They already passed `folder`/`online` to `GlassChip`, but the shared chip rendered the count badge
  *in place of* the icon, so the marks never showed. Fixed in `GlassChip.ChipContent` to lay out
  icon + label + count together (count now a trailing tabular figure, not a replacement). This also
  keeps the icon on the main view-tab chips while a search shows their count. Shared-component fix.
