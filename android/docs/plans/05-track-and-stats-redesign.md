# Plan 05 — Track detail + History Stats redesign

> **Sector:** `android/` · **Type:** cross-cutting UI round (owner's words + screenshots are the spec).
> **Companions:** [`../DESING.md`](../DESING.md), [`../AGENTS.md`](../AGENTS.md),
> [`01-native-rewrite.md`](01-native-rewrite.md), [`04-modal-overhaul.md`](04-modal-overhaul.md).
> **Precedence:** code > plan > AGENTS.md > docs. Living record — tick a box + append a progress-log
> row after **every** small task.

## 1. The brief (owner, 2026-11-23; screenshots `ignoreAssets/screenshot/5.jpg`, `6.jpg`)

1. **Individual track page** — redesign to show **all the information we have** about the track, and
   **do not display empty information**. Best-in-class UI/UX.
2. **History → Stats tab** — fix bugs (notably **line-breaking on long text key/values** — the
   "Longest session" label wraps one letter per line) and give it the most beautiful look/feel.

## 2. Diagnosis (against the code)

| # | Observation | Root cause | Fix |
|---|---|---|---|
| T1 | Track page hides a lot of loaded data | `SessionSummary` (days listened, avg, longest, speeds, first/last activity, open/interrupted counts) is fetched into state but **never rendered**; `AudioInfo.channelMode/bitsPerSample/variableBitrate/durationSec`, tag version, track/disc number, folder/collection, mime, added date are unused. | Render a fuller Listening summary + Audio + Details + File sections from the data already available. |
| T2 | Empty information shown | A `Tags` card renders even when author/narrator/album/year are all blank (the lone empty circle in 5.jpg); "No sessions yet." / zeros show for never-played tracks. | Build each section's row list first; **skip the whole section when it has no present rows**; show one tasteful "not listened yet" state instead of four zero tiles. |
| T3 | Stats `StatRow` letter-wraps on long values | `StatRow` gives the label `weight(1f)` and leaves the value **unbounded** — the same starvation fixed in plan 04 for `Fact`/`FactRow`. | Weight both columns (or stack long values); generalise into a shared `DetailRow`. |
| T4 | Stats looks like a flat key/value list + crude white bars | One `GlassCard` of `StatRow`s + a bare `Row` of white `Box` bars with no baseline/labels; no hierarchy. | Headline tile, a 2-up stat grid, a media-split bar, a labelled daily chart with rounded gradient bars + baseline, ranked leaders with artwork tiles. |

## 3. Work items

### A. Shared detail primitives (`ui/components/DetailBlock.kt`)
- [x] A1 — `DetailSection(title, icon)` — teal glow bubble + overline header above a `GlassCard`; a variant that renders nothing when its row list is empty (the "hide empty" rule).
- [x] A2 — `DetailRow(icon?, label, value)` — skips blank values; label `weight(1f)` single-line ellipsize, value `weight(1.3f)` end, ≤3 lines ellipsize (never starves).
- [x] A3 — `StatTile(label, value, secondary?)` — glass tile, big **tabular** value + label.

### B. Track detail screen
- [x] B1 — Hero artwork + a meta chip row (duration, format, origin badge) — no empty chips.
- [x] B2 — Listening summary: stat tiles from `TrackStats` + `SessionSummary` (sessions, listened, completion, last played, days, avg, longest, notes, speeds, first/last) — only meaningful ones; a single "not listened yet" state when there is no history.
- [x] B3 — Audio section from `AudioInfo` (container, codec, bitrate+VBR, sample rate, channels+mode, bit depth, declared duration) — hidden when no facts.
- [x] B4 — Details section (author, narrator, album, year, track #, disc #, folder, collection, format, added) — hidden when empty.
- [x] B5 — File section (name, path, size, source/downloaded) — hidden when no file info (e.g. pure stream).
- [x] B6 — Sessions + Notes lists shown only when present (drop the "No sessions/notes yet" empty text).

### C. History Stats panel
- [x] C1 — Fix `StatRow` starvation (route through `DetailRow`).
- [x] C2 — Headline "total listened" tile + 2-up grid (sessions, tracks, active days, avg).
- [x] C3 — Streak + media split (Audiobooks vs Music) as a proportional bar, not a text row.
- [x] C4 — Longest session as a readable card (label + title + duration, bounded).
- [x] C5 — Daily chart: rounded gradient bars, baseline, day-of-month labels at the ends + a total.
- [x] C6 — Top tracks: rank number + `PaletteTile` artwork + title + plays · listen time.

### D. Verify
- [x] D1 — `assembleDebug` green, zero Kotlin warnings.
- [x] D2 — `testDebugUnitTest` green (incl. contrast contract; any new pure helper tested).
- [ ] D3 — On-device visual pass in light + dark, with a never-played track, a fully-tagged track, and a long-title track (owner's).

## 4. Invariants
- Colours only from `ui/theme/`; no literals. `accentTeal` for identity/positive; content ramps via `paletteIndexFor`.
- One icon family (`PejvakIcon` by semantic name); `IconCatalogTest` vocabulary intact.
- Tabular figures for anything that counts (DESING §4).
- `GlassSheet`/`GlassCard`/`ScreenFrame` remain the surfaces; no raw Material sheets.
- Reduced motion still honoured (`oceanEntrance`/`OceanCascade` unchanged).

## 5. Out of scope
- Backend, Room schema, sync.
- Navigation wiring from leaders/longest to the track screen (kept non-interactive this round).
- The History (non-stats) list and other tabs.

## 6. Progress log

| Date | Task | What changed | Notes |
|---|---|---|---|
| 2026-11-23 | A1–A3 | New `ui/components/DetailBlock.kt`: `DetailSection` (teal-glow bubble header + glass card), `DetailRow` (both columns weighted → never starves; blank value renders nothing), `StatTile` (tabular figure + label + optional secondary), `MetaChip`. | Shared primitives so both screens (and future detail screens) upgrade once. |
| 2026-11-23 | B1–B6 | `TrackDetailScreen` rebuilt: hero artwork + meta chips (duration/format/origin), a Listening section that surfaces the previously-ignored `SessionSummary` (days, avg, longest, speeds, first-listened) + `TrackStats` as stat tiles (or one "not listened yet" card for a never-played track), fuller Audio (channel mode, bit depth, VBR, declared duration), Details (track/disc no, folder, collection, format, added) and File sections, each **hidden when empty**; sessions/notes lists shown only when present. | Root cause of the lone empty Tags circle: the section rendered regardless of rows. Now guarded by non-composable null checks. |
| 2026-11-23 | C1–C6 | History Stats: deleted the starved `StatRow`; new headline "total listened" + 2-up stat tiles (sessions/tracks, days/avg, streak/longest with the title as a secondary line so it can't crush the label); a proportional **media split** bar (Audiobooks vs Music); a **daily chart** with rounded teal-gradient bars, a baseline and day-of-month end labels; ranked **Top tracks** rows with rank number + `PaletteTile` artwork. | Fixes the "Longest session" one-letter-per-line bug (6.jpg) at its cause. |
| 2026-11-23 | D1–D2 | `assembleDebug` green, zero Kotlin warnings; `testDebugUnitTest` green. | D3 (light/dark, never-played / fully-tagged / long-title) is the owner's device pass. |
| 2026-11-23 | E1 (follow-up) | `GlassChip` now renders **icon + label + count** together instead of count-replaces-icon. The Library Tracks sub-tabs (Local/Online) already passed `folder`/`online` icons but showed only the count badge — the marks now appear. Main view-tab chips also keep their icon while a search shows the count. | Shared-component fix (upgrade once). `assembleDebug` green, zero warnings; tests green. |
| 2026-11-23 | F1–F4 (follow-up: group history) | New pure `groupByTrack(entries, sort)` + `groupByCollection(runs, sort)` in `domain/History.kt`. The **Sessions** tab now groups stretches **by track** (header = track artwork + title + "N · total"); the **Collections** tab groups runs **by collection** (header = type bubble + collection title + "N runs · total"). `HistoryViewModel` feeds `sections = groupByTrack(...)` and a new `groupedCollections`; the sort (Newest/Oldest/Longest) orders the groups and the items within. `HistoryTest` gained track/collection grouping cases. | Replaces the day-grouping in Sessions with track-grouping (the owner's ask). Stretch `id`/run `id` stay unique Lazy keys; section keys `h-`/`ch-` prefixed. `assembleDebug` green, zero warnings; tests green. |
| 2026-11-23 | F5 (follow-up: per-group show more) | Each group lists up to `groupPreview = 5` items with a centered **Show N more / Show less** row (`ShowMoreRow`, chevronDown/Up glyphs added). Expand state is a `remember`ed set keyed `s:`/`c:` per group, so it survives recomposition and the two tabs don't collide. | New strings `history_show_more`/`history_show_less`. `assembleDebug` green, zero warnings; tests green. |
