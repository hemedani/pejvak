# Prompt 02 — True frosted-glass shell, control-capsule header, crafted dock

> Original brief for round 8. The plan (`../plans/02-glass-shell.md`) is the record; code wins if
> they disagree.

## Reference

`ignoreAssets/Qwen-image/1.png` (light/dark) and `2.png`. The owner's instruction: **"I want it to
look exactly like the photos I sent you. Do not add or remove anything. If a complete redesign is
necessary, then redesign everything from scratch."**

The render is a concept, not a pixel spec. Where it disagrees with `DESING.md` tokens or
`ContrastContractTest`, the tokens/tests win. Strings, icon shapes, and tile hues are illustrative.

## Owner's two asks

1. **Full frosted glass.** Header and dock are not glassy enough. Content scrolling behind them
   must be barely visible — soft washes of colour. Pane content stays razor sharp.
2. **Chrome lives in the header.** Search, settings, sort, export fold into the header capsule so the
   app feels simpler and more engaging. Tab buttons stay in the dock; the dock itself must feel
   high-quality.

## Constraints carried from the task

- One `rememberHazeState()` in the shell. Content is the Haze source; header/dock/mini-player are
  crisp consuming siblings. `HazeInput.Sources` + `KeepLastFrame`. No `Backdrop`, no platform
  backdrop flag.
- Heavy frost: blur 48 dp + smoked scrim + sheen + grain. Fallback scrim on API 29–30. Contrast is
  guaranteed by the scrim, never by blur.
- Header: `[leading bubble] [overline + title] [spacer] [ActionCluster]`; 44 dp targets; `UserText`
  for content titles; status-bar inset; content scrolls behind via the measured top inset.
- Morphing search is the signature interaction; the query lives in the existing ViewModel.
- Overflow `GlassSheet` for secondary actions; re-home only, invent nothing, drop nothing.
- Dock: one frosted capsule, two 58 dp halves, wave divider, white selected circle, five icon-only
  peers, press spring + haptic, no tab travel animation.
- All colours/alphas/radii in `ui/theme/`; 4 dp rhythm; one icon family; strings in `strings.xml`;
  `GlassSheet` is the only sheet; gesture rules are settled law; threshold never weakened; motion
  gated; offline behaviour untouched.

## Done

`assembleDebug` + `testDebugUnitTest` green (JDK 21); emulator verification in both themes with
motion on/off; API 33+ and API 29/30 panes; search morph on Library/History/Notes; overflow sheets
complete; sheet/player open leaves chrome crisp; Persian titles; 320 dp; Gallery variants.
