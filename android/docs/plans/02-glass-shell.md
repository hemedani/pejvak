# Plan 02 — True frosted-glass shell, control-capsule header, crafted dock

> **Round 8 of the native rewrite.** Builds on plan 01. This file is the design + work record for
> shell chrome only; feature behaviour is unchanged. Reference: `ignoreAssets/Qwen-image/1.png`
> and `2.png` (light/dark concept renders). Where the render disagrees with `DESING.md` tokens or
> `ContrastContractTest`, the tokens/tests win.
>
> **Discipline:** tick a box and append a progress entry after each small task. Never commit unless
> asked.

---

## 1. Owner's words (the spec)

1. "The header and dock aren't glassy enough. I want FULL frosted glass — content scrolling behind
   them should be barely visible, just soft washes of color."
2. "Fold the screen's chrome (search, settings, sort, export…) into the header creatively so the app
   feels simpler and more engaging. Tab buttons stay in the dock — but make the dock itself feel
   high-quality."
3. "I want it to look exactly like the photos I sent you. Do not add or remove anything."

What the render shows, and what we adopt:

- One floating **header capsule** (overline + title, two circular glass bubbles at the trailing edge).
- A pinned **chip row** immediately below it (Library's Tracks / Folders / Playlists / Recent).
- Content (Continue card, rows) scrolling **behind** header and dock, visible only as soft washes.
- One floating **dock capsule** with two halves: a mini-player (artwork, title, artist, wave, pause,
  next) and five icon-only peers. A hairline wave separates the halves. Selected tab = solid white
  circle with the glyph knocked out.
- **No full-width background band anywhere.** The canvas is the only field; every pane floats.

Not adopted from the render: X-style compose button, labels under tabs, raised centre action,
illustrative strings/icon shapes. Pejvak keeps five icon-only peers, white accent circle, English
LTR, water/wave language.

## 2. Material decision — Haze 2.1.0

The only real backdrop blur available below Android 17 QPR2 is the source-capture technique: record
the content into a layer, then draw a blurred, offset, shape-clipped copy under the pane's own crisp
content. `Modifier.blur` blurs the pane's own pixels; window blur-behind needs a second window;
`setBackdropRenderEffect` needs SDK 37.2.

**Decision:** add `dev.chrisbanes.haze:haze` + `dev.chrisbanes.haze:haze-blur` **2.1.0**
(latest stable 2026-11-02, Apache-2.0, mavenCentral already first, minSdk 23). `haze-blur-materials`
is not used (we build our own style from Pejvak tokens). Verify against Compose BOM 2026.09.00; if a
BOM bump is unavoidable, state the reason first. All Haze artifacts stay on one version. This goes
in AGENTS.md version pins.

- `HazeInput.Sources(state)` everywhere (exact source ownership, `KeepLastFrame` so tab
  save/restore does not flash). **Not** `Backdrop`; **never** enable
  `HazeFeatureFlags.isPlatformBackdropEnabled`.
- One `rememberHazeState()` in `PejvakNavHost`, shared through `LocalHazeState`.
- Each screen's scroll content is the source (`Modifier.hazeSource`), not the header/dock. Effects
  are siblings of the source, exactly like the Haze sample.
- Consumers: `GlassHeader`, `AppDock`, `StandaloneMiniPlayer` only. Cards/rows keep the light
  `GlassSurface` recipe; at most three blurred panes on screen.
- API 29–30: Haze already draws `fallbackColorEffect` instead of blur. Same smoked read.

### Frost recipe (`ui/theme/Frost.kt`, tokens in `Color.kt`/`Theme.kt`/`Tokens.kt`)

| Layer | Light | Dark |
|---|---|---|
| blur radius (`frostBlur`) | 48 dp | 48 dp |
| base | `canvasBase` @ 0.55 | `canvasBase` @ 0.62 |
| smoked scrim (`frostScrim`) | `canvasBase` @ 0.62 | `#06090F` @ 0.68 |
| sheen (`frostSheen`) | white @ 0.10 | white @ 0.06 |
| grain (`frostNoise`) | 0.12 | 0.12 |
| fallback (`frostFallback`) | `canvasBase` @ 0.82 | `#06090F` @ 0.86 |

Edges stay: 1–1.5 dp `glassBorder`, 3 dp top rim light, `elevation.dock` (soft) only under dock.
Alpha scaling rule applies (`copy(alpha = tokens.x.alpha * factor)`).

`ContrastContractTest` gets new cases modelling the full frost stack (worst bloom → base → scrim →
sheen) plus the fallback scrim, for `text` and `textSecondary`. **No threshold is weakened.**

## 3. Shell architecture

```
Box(fillMaxSize)
├── content layer
│   ├── AmbientCanvas                (static field)
│   └── NavHost  →  screens
│        screen = Box
│        ├── scroll body  .hazeSource(state) .blur(backdropBlur)
│        └── GlassHeader  .hazeBlur(Sources(state))   ← crisp sibling of body
├── AppDock / StandaloneMiniPlayer    .hazeBlur(Sources(state))  ← crisp siblings
├── WaveSweep
└── sheets (own windows)
```

- Remove the shell's `statusBarsPadding()` and `padding(bottom)`.
- `LocalShellInsets` exposes the **measured** dock clearance (top of dock in root coords) + nav bar;
  initial value from `geo.dock.dockInset + navigationInset`.
- `LocalBackdropBlur` exposes the sheet/player frost amount; screens apply it to **their body**, not
  the shell, so header/dock stay crisp when a sheet opens.
- The header is mounted per screen from the one shared component; it measures itself and reports the
  top inset to the body. All screens therefore share the same anatomy and behaviour.

## 4. Component work

- [x] `FrostedSurface` (shared): capsule clip + Haze + fill/border/rim. Used by header, dock,
      standalone mini-player.
- [x] `GlassHeader` (evolve `ScreenHeader.kt`): leading slot, title block (overline/title/subtitle,
      `UserText` for content titles), trailing `ActionCluster`, 44 dp bubbles. Owns status-bar inset.
- [x] Morphing search: search bubble expands the whole capsule into `HeaderSearchField`
      (~280 ms spring, gated on `useMotionEnabled`, haptic). Query stays in the existing VM.
- [x] Overflow sheet: the shared `GlassSheet` + `ListGroup` rows; only existing actions.
- [x] `HairlineWave` extracted from `GlassSheet` header and reused as the dock divider.
- [x] `AppDock`: frost, `radius.xl` when mini is present / `pill` when nav-only, 58 dp halves,
      animate mini presence, press spring 1→0.92→1.05→1, haptic, optical centering, wave divider.
- [x] `StandaloneMiniPlayer`: same frost, pill, `UserText`.
- [x] `NowPlayingSheet` header adopts the same tokens/recipe (no structural change).

## 5. Per-screen absorption map (nothing dropped)

| Screen | Leading | Title | Trailing | Search | Overflow |
|---|---|---|---|---|---|
| Library | — | overline + Library | search, gear | morphing | gear sheet: Settings, Language |
| History | — | overline + History | search, more | morphing | Refresh, Sort, Date range, Export |
| Notes | — | overline + Notes | search, more | morphing | Date range |
| Discover | — | Discover + language subtitle | language | — | — (Browse keeps its own search) |
| AI | — | AI | — | — | — |
| Track / Folder / Playlist / Smart / Online / Source / Language | back | content title (`UserText`) | history, AI, add, delete as today | — | secondary actions |
| Settings / Import / Missing / AiFeature | back or close | title | existing | — | — |
| Auth | — | centered brand (unchanged, exclusion noted) | — | — | — |

Pinned blocks shrink to chips/segments only. Library loses its standalone `SearchField` (the capsule
is the search); History loses its list-level search; Notes likewise.

## 6. Order

1. Haze dependency + justification + shell wiring.
2. Frost tokens + contrast tests + `DESING.md`/`AGENTS.md` updates.
3. Dock / standalone mini-player material + craft.
4. Header capsule + morphing search.
5. Overflow sheets + per-screen absorption (tabs, then pushed screens).
6. Fallback + performance + Gallery variants + verification.

## 7. Verification matrix

- `./gradlew assembleDebug`, `./gradlew testDebugUnitTest` (JDK 21).
- Both themes × motion on/off: scroll a busy list behind header and dock → soft washes, razor-sharp
  pane content; no band; no flash on tab switch.
- API 33+ (real blur) and API 29/30 (fallback scrim).
- Search morph on Library/History/Notes: expand, type, collapse, query persists, IME sane.
- Overflow sheets: correct actions, nothing missing.
- Sheet/player open: content frosts, header/dock crisp; mini-player morph and pull-to-dismiss intact.
- Persian content titles in header + mini-player; 320 dp width; empty states not occluded.

## Progress log

- 2026-11-19 — Plan authored. Reference read (`Qwen-image/1.png`, `2.png`); current code audited:
  dock is stroke-only, header is a plain row, no Haze, screens reserve dock space in the shell.
- 2026-11-19 — Shell wired: one `HazeState`, content is the source, header/dock/standalone mini are
  crisp consumers; dock clearance measured into `LocalShellInsets`; sheet presence still frosts only
  the content. Frost tokens + `rememberPejvakFrost`, `FrostedSurface`, `HairlineWave`, morphing
  `GlassHeader`, `ScreenFrame`, and the rewired dock/mini-player are in place. All tabs and pushed
  screens absorbed their old headers (Library, History, Notes, Discover, AI, details, Settings,
  Import, Missing, AiFeature); Auth stays centered. `compileDebugKotlin` is green.
- 2026-11-19 — Verified on the emulator in both themes. Opening a sheet while navigating revealed a
  native `RenderThread` stack overflow: `Modifier.blur` on the Haze *source* recurses. Removed it;
  the sheet frost is now a Haze consumer overlay in `ScreenFrame` that sits above the body and below
  the header (body softens, chrome stays crisp). Search morph, overflow sheet, Settings navigation
  and light/dark panes all exercised; no crash in the crash buffer.
- 2026-11-19 — Now Playing no longer blurs its own tree; when one of its sheets is up the player
  surface takes the smoked frost scrim instead. Contrast tests extended to the frost stack and the
  API 29–30 fallback; `DESING.md` §3.2/§6/§9.5 and the `AGENTS.md` pins updated; Gallery gained a
  shell-chrome station. `assembleDebug` + `testDebugUnitTest` green; emulator (API 35) checked in
  light and dark. Not yet exercised: a real API 29/30 device (fallback path is contrast-tested only)
  and the Now Playing sheet during playback (no local track on this emulator).
- 2026-11-19 — Owner feedback: modal backdrop blur must return, and the dock wants the same blur
  with no extra layer. Restored the original shell-level `.blur(backdropBlur)` around the
  canvas+NavHost (18 dp, animates with sheet/player presence) and deleted the consumer-overlay
  attempt. The Haze source now lives on a wrapper in `ScreenFrame`, so the blurred node is never a
  source node — the native render-thread overflow does not reproduce. The dock and standalone mini
  player use `frostBackdrop` (18 dp) through `FrostedSurface`, so the blur is the pane's own
  background, not an overlay. Verified on device: backdrop frost, Settings navigation with the sheet
  open, no crash.
