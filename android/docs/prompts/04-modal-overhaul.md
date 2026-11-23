# Prompt 04 — Modal overhaul (append-only record)

> The original brief and the decisions taken while implementing it. Append-only: keep every sentence,
> add conditions rather than rewriting. See [`../plans/04-modal-overhaul.md`](../plans/04-modal-overhaul.md)
> for the living roadmap.

## 1. Original brief (owner, 2026-11-22)

> "I want to overhaul the whole modal boxes in my app, I think the UI of the modal box is not sync with
> our new style and design system, please look at all of them and redesign it, do your best to make
> extremely beautiful looks and feel.
>
> For progress bar, please look at the main player volume progress bar, In that example, the start and
> end line are flat, and the wave effect is better executed; you can use its code to design progress
> bars within modals. When the history item modal box is open I want to have a better color for played
> section in progress bar. Also I have to see more icons for any meaningful title."

## 2. Decisions

| ID | Decision | Rationale |
|---|---|---|
| P1 | The volume slider's technique = **one continuous wave path + `clipRect` the played part**, with a **wide `ramp` taper** at both ends so the line is flat where it enters and leaves. | This is verbatim what `WaveSlider` does and why it reads well; `WaveProgressBar`/`ListeningTimeline` instead glued two differently-tuned paths, which broke the line at the head. |
| P2 | The "better colour for the played section" in the history modal = `tokens.accentTeal`. | DESING §3.4 reserves teal for "positive state / brand moments"; the heard stretch is exactly a positive, brand-owning readout. White (`accent`) is reserved for the player's own controls. Kept as a `playedColor` parameter so the bar stays reusable. |
| P3 | Improve the modal system at the **shared** layer first (`GlassSheet` header, `WaveProgressBar`, `ListeningTimeline`) so every sheet benefits, then do per-sheet icon work. | AGENTS: `GlassSheet` is the only bottom sheet; one header change reaches every modal. |
| P4 | Icons are added to `ICON_GLYPHS` (extended Material set is on the classpath) and only ever requested by semantic name. | Keeps the one-icon-family rule (§7) and `IconCatalogTest` green; screens never import an icon set. |
| P5 | The flat run-detail bar in `HistoryScreen` is replaced by `WaveProgressBar`, not restyled in place. | It was the one off-system progress bar in a modal; the water language is the contract. |

## 3. Addenda

_(append further decisions/changes here as they land)_

- 2026-11-22 — Shipped A1–A3, B1–B2, C1–C7, D1–D2. The played/heard colour was set to
  `tokens.accentTeal` (P2) for both the history session timeline and the run bar; the general
  `WaveProgressBar` still defaults to `accent` so unrelated callers (folder partial rows) keep
  their white readout unless a `color` is passed. `ListAlt` and `TrendingUp` were switched to their
  `Icons.AutoMirrored.Rounded` forms to keep the build warning-free (the project ships zero Kotlin
  warnings). D3 (light/dark on-device look) is left to the owner.
- 2026-11-22 — **Round 2 (owner review).** The owner overrode P2: the played/heard colour is now the
  **track's own aurora ramp** (light stop), not teal — added a `heardColor` param to
  `ListeningTimeline` and keyed the run bar's `WaveProgressBar(color=…)` on `run.contextKey`.
  Reported a card-breaking layout bug (screenshot 4): a long playback value starved the weighted
  label to one-letter-per-line; fixed by weighting both columns. Reported the full player collapsing
  to mini when a modal opens: the AI opener no longer dismisses the player (the catalogue sheet is
  documented to open over it); the context chip still navigates but the nav host now records the
  back-stack entry and re-expands the player on back (owner's chosen behaviour). Note:
  `NavBackStackEntry.id` is a `String`.
- 2026-11-22 — **Round 3 (owner review).** Two asks. (S1) The history modal should state the
  **day of the week** — added a pure `formatDayOfWeek` (weekday + medium date, locale-aware) and a
  **Day** fact at the top of the SESSION card. (S2) The **enter screen** was a plain blue system
  splash — the owner asked for an attractive **logomotion based on the app logo**. Built
  `SplashIntro`: the logo surfaces on a rising crest (reusing `Wave.kt` + `drawWaveWake`), a ripple
  ring blooms where it lands, and the wordmark + `HairlineWave` rise behind it over the
  `AmbientCanvas`; it runs once then fades/lifts off `AuthGate` (reduced motion settles). The system
  splash background was switched from the blue launcher color to the canvas base so the handoff is
  continuous. Decisions: the intro is a bounded one-shot (only the ambient `rememberWavePhase` drifts,
  gated by motion); the wordmark uses the current `app_name` ("FlowCast") so it stays correct until the
  owner renames the app.
- 2026-11-22 — **Round 4.** Owner reported **two** launch screens (the OS system splash — icon on a
  plain field — then the branded intro) and asked to remove the first. Root cause: `installSplashScreen()`
  held the system splash via `setKeepOnScreenCondition { !settingsReady }`, so it lingered as a distinct
  screen. Fix: remove the hold (settings now load in the background under the intro) and set the system
  splash icon to a transparent drawable, so the OS phase is a sub-frame canvas handoff and the intro is
  the one splash. A brief background-colour flash can still occur if the in-app theme differs from the
  system theme (the splash colour is a resource, the intro colour follows the saved preference); this is
  momentary and harmless.
