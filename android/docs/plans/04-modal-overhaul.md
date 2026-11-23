# Plan 04 — Modal overhaul (design-system sync)

> **Sector:** `android/` · **Type:** cross-cutting UI round (the owner's words are the spec).
> **Companions:** [`../DESING.md`](../DESING.md) (the look), [`../AGENTS.md`](../AGENTS.md) (rules),
> [`01-native-rewrite.md`](01-native-rewrite.md) (feature parity), [`03-collection-first-playback.md`](03-collection-first-playback.md).
> **Precedence:** code > plan > AGENTS.md > docs.
>
> This plan is a **living record**. Tick a box and append a progress-log row after **every** small
> task — not at the end of the round.

## 1. The brief (owner, 2026-11-22)

The modal boxes (bottom sheets) are out of sync with the current design system. Redesign all of them
to look and feel best-in-class. Three concrete asks ride along:

1. **Progress bars inside modals** must follow the **volume slider** (`WaveSlider`) — its start/end
   lines are **flat** and its wave reads well. Reuse that technique.
2. **The history item modal** (`SessionDetailSheet` / `RunDetailSheet`) needs a **better colour for the
   played/heard section** of its progress bar (it is plain white today).
3. **More icons** for any meaningful title — sheet headers, section headings, and list rows should
   carry a glyph where the title has meaning.

## 2. Diagnosis (what is actually wrong, against the code)

| # | Observation | Root cause | Fix |
|---|---|---|---|
| M1 | `WaveProgressBar` looks worse than the volume slider | It builds the played part as a **separate path** with a **different wavelength** (`40` vs `40×1.7`) and a different amplitude than the resting track — the exact "two shapes glued on" anti-pattern `WaveSlider` documents. The line breaks at the head. | One continuous full-range wave with a wide end **taper** (flat ends); **clip** the same path to paint the played part — colours meet exactly at the head. |
| M2 | History timeline played part is white and breaks at the head | `ListeningTimeline` repeats the M1 mistake (heard crest `wavelength 44` vs swell `44×1.6`) and uses `tokens.accent` (white). | Same single-path clip; heard range in `accentTeal` (DESING §3.4 "positive/brand"). |
| M3 | Run-detail progress is a flat Material bar | `HistoryScreen` local `ProgressBar` is a `Box` fill — not the water language. | Replace with `WaveProgressBar`. |
| M4 | Sheets read as a generic form, not the design system | `GlassSheet` header icon bubble is a flat 14 % accent fill; title is `headlineSmall`; the handle is a plain pill. | Upgrade the shared header: aurora-tinted glass bubble + catchlight, stronger title, refined handle. Wins every modal at once. |
| M5 | Many meaningful titles carry no icon | Section cards in `SessionDetailSheet`, fact rows in `RunDetailSheet`, preset chips in `DateRangeSheet`, sort options in `CollectionSortSheet`, list rows in the picker sheets. | Add glyphs to the catalogue and wire them per-title. |

## 3. Work items (each box = one small task)

### A. The wave progress language (M1–M3)
- [x] A1 — Rewrite `WaveProgressBar` to the `WaveSlider` single-path + clip pattern; add a `playedColor` parameter; flat wide-tapered ends; head dot on the curve.
- [x] A2 — Rewrite `ListeningTimeline` to the same pattern; heard range `[low..high]` in `accentTeal`; keep the seek tick and the clock/span labels.
- [x] A3 — Replace `HistoryScreen` run-detail `ProgressBar` with `WaveProgressBar` (played = `accentTeal`).

### B. The shared sheet header (M4)
- [x] B1 — Upgrade `GlassSheet`'s `SheetHeader`: aurora/teal glass icon bubble with a rim, stronger title + subtitle hierarchy, refined drag handle.
- [x] B2 — Keep the entrance/exit `SheetWake` + `HairlineWave` crest behaviour intact (no motion regressions; reduced-motion still settles).

### C. Icons for meaningful titles (M5)
- [x] C1 — Add new glyphs to `ICON_GLYPHS` (calendar/today/week/month/year, shuffle, name/A–Z, duration, queue, note, folder, cloud, person, language, download, export/share, stats/trending, sleep, speed, enhancer, volume, music, edit, trash, check, info, warning, lock, mic, sparkle, bookmark, star, list) — extend the catalogue, never break `IconCatalogTest`.
- [x] C2 — `SessionDetailSheet`: titled, iconed section cards for the facts and the playback context; icon per fact row.
- [x] C3 — `RunDetailSheet` + `ContextHistorySheet`: icon per fact/row.
- [x] C4 — `DateRangeSheet`: a distinct icon per preset (Any/Today/Week/Month/Year).
- [x] C5 — `CollectionSortSheet`: a distinct icon per sort option.
- [x] C6 — Picker/list rows: `AddToPlaylistSheet`, `LanguagePickerSheet`, `TrackDetailScreen` add-playlist, `PlaylistDetailScreen` add-tracks, `LibraryScreen` language options — leading glyph per row.
- [x] C7 — Player sheets: label icons on `SleepTimerSheet` / `JumpToTimeSheet` / `AudioEnhancerSheet` where a title is meaningful.

### D. Verify
- [x] D1 — `assembleDebug` green, zero Kotlin warnings.
- [x] D2 — `testDebugUnitTest` green (incl. `IconCatalogTest`, contrast contract).
- [ ] D3 — Visual pass in light + dark (owner's device; agent verifies compile + tests only).

## 4. Invariants (do not break)

- **One home for the curve** — only `Wave.kt` re-derives a sine; `WaveProgressBar`/`ListeningTimeline`
  call `wavePath`/`waveOffsetAt`/`ramp`.
- **Absolute wavelength** — never tie frequency to the filled width.
- **All colours in `ui/theme/`** — the played colour is a token (`accentTeal`), never a literal.
- **`GlassSheet` is the only bottom sheet**; a titled sheet passes `icon`.
- **Reduced motion** still substitutes settled values.
- **`IconCatalogTest`** required vocabulary stays present.

## 5. Out of scope

- Backend, Room schema, sync wire.
- `mobile/` (RN) and `front/`.
- The Now Playing full-screen morph mechanics (untouched; only its sheets' shared header improves).
- Navigation/routing changes.

## 7. Round 2 — owner follow-ups (2026-11-22)

The owner reviewed the round-1 build and reported three items (screenshot `ignoreAssets/screenshot/4.jpg`).

| # | Report | Root cause | Fix |
|---|---|---|---|
| N1 | Played/heard section should be the **track's own colour**, not teal | Round 1 recoloured it to `accentTeal`. | Tint the timeline heard-wave + the run bar with the content's **aurora ramp** (light stop, the legible one on glass — same stop `aiGlyphStop` returns), keyed on `track.contentHash` (timeline) / `run.contextKey` (run bar). |
| N2 | Long collection value **breaks the playback card** (label wraps one letter per line, value overlaps the icon) | `Fact`/`FactRow` gave the label `weight(1f)` but left the value **unbounded** — a long value measured first at full width starves the label to ~0. | Weight **both** columns (label `1f` single-line ellipsize, value `1.3f` right-aligned, up to 3 lines ellipsize) so neither starves. |
| N3 | Opening a modal from the player **collapses it to mini** | The AI opener and the context-chip (folder name) both call `onDismiss()` before opening. AI sheet is meant to float over the player. | AI: drop the `onDismiss()` — the catalogue sheet floats over the (now-frosted) player. Context chip: keep navigating (the full-screen overlay must yield to the collection) but **remember the back-stack entry and re-expand the player on back**. |

- [x] N1 — `ListeningTimeline` gains a `heardColor` param; `SessionDetailSheet` passes the track ramp; `RunDetailSheet` passes the run ramp to `WaveProgressBar`.
- [x] N2 — `Fact` (SessionDetailSheet) and `FactRow` (HistoryScreen) bound both columns.
- [x] N3 — `NowPlayingSheet` AI opener no longer dismisses; `PejvakNavHost` records `reopenPlayerBackStackId` on context open and re-expands the player when returning.
- [x] N4 — `assembleDebug` green, zero Kotlin warnings; `testDebugUnitTest` green.
- [ ] N5 — On-device visual + gesture pass (light/dark, long-value row, AI-over-player, back re-expands player) — owner's.

## 8. Progress log

| Date | Task | What changed | Notes |
|---|---|---|---|
| 2026-11-22 | A1–A3 | `WaveProgressBar` + `ListeningTimeline` rewritten to the `WaveSlider` one-path + `clipRect` technique (wide `ramp` taper → flat ends, absolute wavelength, head dot on the curve); history heard/run sections in `accentTeal`; `HistoryScreen` run-detail flat `ProgressBar` deleted and replaced by `WaveProgressBar`. | Fixes the "two glued paths" break at the head (M1/M2) and the off-system flat bar (M3). |
| 2026-11-22 | B1–B2 | `GlassSheet` header: teal radial-glow icon bubble with `glassBorder` rim, `headlineMedium` title + `bodyMedium` subtitle, gradient hairline drag handle. `SheetWake`/`HairlineWave` crest motion untouched. | One change reaches every modal. |
| 2026-11-22 | C1–C7 | Added 20 glyphs to `ICON_GLYPHS` (today/weekend/event/dateRange/calendar/filter/shuffle/name/duration/list/stats/mic/translate/star/starBorder/bookmark/lock/export, …); iconed section cards + fact rows in `SessionDetailSheet`; iconed facts + `WaveProgressBar` in `RunDetailSheet`; leading glyphs in `ContextHistorySheet`, `AddToPlaylistSheet`, `LanguagePickerSheet`, `TrackDetailScreen`, `PlaylistDetailScreen`, `LibraryScreen`; per-preset icons in `DateRangeSheet`; per-option icons in `CollectionSortSheet`; timer chips in `SleepTimerSheet`. | `ListAlt`/`TrendingUp` use the AutoMirrored variants (deprecation rule). `IconCatalogTest` required vocabulary unchanged. |
| 2026-11-22 | D1–D2 | `assembleDebug` green, zero Kotlin warnings; `testDebugUnitTest` green. | D3 (light/dark visual) is the owner's device pass. |
| 2026-11-22 | N1–N4 (round 2) | Timeline heard-wave + run bar recoloured to the content's aurora ramp (light stop) via a new `heardColor` param / `WaveProgressBar(color=…)`; `Fact`/`FactRow` bound both columns so a long value no longer starves the label; AI sheet opens over the player (no `onDismiss()`); context chip records the back-stack entry and the player re-expands on back. | Root cause of the misalignment (N2) was an unweighted value `Text` measured before the `weight(1f)` label. `NavBackStackEntry.id` is a `String`, not `Int` — the reopen flag is `String?`. |
| 2026-11-22 | S1–S4 (round 3) | Added a **Day** fact (weekday + date) to the session card via a new pure `formatDayOfWeek` domain helper; built a branded **`SplashIntro`** logomotion (logo surfaces on a rising crest + ripple bloom + wordmark on the same swell), wired it over `AuthGate` with a fade/lift exit, and switched the system splash background to the canvas base (`@color/splash_background`) so the handoff is continuous. | `Modifier.padding` has no `top`+`horizontal` overload — split into two chained calls. `drawWaveWake` is `internal` but same-module, so reachable from the splash package. |
| 2026-11-22 | T1–T3 (round 4) | Collapsed the two launch screens into one: dropped `setKeepOnScreenCondition` (settings now load in the background under the intro) and set `windowSplashScreenAnimatedIcon` to a transparent `@drawable/splash_transparent_icon`, so the OS system splash is a sub-frame canvas handoff rather than a lingering icon screen. | The lingering "first splash" was the held system splash; the intro is now the only perceived splash. |

## 9. Round 3 — owner follow-ups (2026-11-22)

| # | Report | Fix |
|---|---|---|
| S1 | History modal should say **which day of the week** the listen happened | New pure `formatDayOfWeek(epochMillis)` (weekday + medium date, locale-aware); a **Day** fact added at the top of the SESSION card (`calendar` icon). |
| S2 | The **enter screen** is just a blue screen — want an attractive **logomotion** based on the app logo | New `ui/screens/splash/SplashIntro.kt`: the app logo rises on a single crest (the `Wave.kt` primitives + `drawWaveWake`), a ripple ring blooms where it lands, the wordmark + `HairlineWave` rise behind it, all over the `AmbientCanvas`. Runs once (~1.4 s), then fades/lifts off `AuthGate`. Reduced motion settles to the final frame. The system splash background moved from the blue launcher color to `@color/splash_background` (canvas base) so the handoff into the intro is seamless. |

- [x] S1 — Day-of-week fact + `formatDayOfWeek` helper.
- [x] S2 — `SplashIntro` logomotion + MainActivity wiring + splash-theme colour.
- [x] S3 — `assembleDebug` green, zero Kotlin warnings; `testDebugUnitTest` green.
- [ ] S4 — On-device visual pass (intro in light/dark, reduced motion, day row) — owner's.

## 10. Round 4 — collapse to a single splash (2026-11-22)

The owner saw **two** launch screens: the OS system splash (icon on a plain field) then the branded
intro. Cause: `installSplashScreen()` held the system splash on `setKeepOnScreenCondition { !settingsReady }`,
so it lingered as a distinct first screen before the intro.

- [x] T1 — Drop the keep-on-screen hold: call `installSplashScreen()` and let it release at the first
      frame (settings still load in the background under the intro).
- [x] T2 — Make the system splash icon transparent (`@drawable/splash_transparent_icon`) so the brief
      handoff frame is just the canvas field, not an "icon screen".
- [x] T3 — `assembleDebug` green, zero warnings; tests green.
- [ ] T4 — On-device: confirm one continuous launch (a sub-frame canvas flash is expected and harmless).

