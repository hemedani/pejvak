# Motion & Iconography Overhaul — Phase 0 Audit and Implementation Plan

> **Status:** Approved by the human partner on 2026-10-23 and implemented in Tasks 1–8. D1–D7 were accepted as recommended, with two implementation notes: `SwapIcon` uses `duration.toggle` (120 ms) and the dock's fade-out uses the new `duration.exit` token (130 ms); and `springSpec` / `curve` now use `ReduceMotion.Never` so **Full** genuinely overrides an OS reduced-motion setting — `useMotionEnabled()` is the single gate, and every unguarded spring site (`DockPlayer`, `Scrubber`) was given the same guard.
>
> **For agentic workers:** This is a Phase 0 deliverable. Tasks 1–8 are the implementation contract; each names the exact files, interfaces, and verification command.

**Goal:** Make Pejvak's motion feel like one hand authored it — calm, precise, premium — and reduce its icon vocabulary to one coherent family, without weakening the dock, accessibility, or offline-first behavior.

**Architecture:** Keep the existing motion layer (`src/theme/motion.ts`, `src/components/motion/*`) and extend it rather than replacing it. Consolidate every glyph behind the existing semantic `Icon` wrapper and switch its single underlying family to MaterialCommunityIcons. Add app-level motion/haptics preferences to the existing settings chain. Fix the handful of places where motion is currently wrong (continuous loops, reduced-motion holes, abrupt dock resize) rather than restyling screens that already work.

**Tech Stack:** Expo SDK 57, React Native 0.86.3, React 19.2.3, Reanimated 4.5.1, Gesture Handler 2.32.0, `@expo/vector-icons` 15.1.1, `expo-haptics` 57.0.3, `expo-symbols` 57.0.3, Jest + React Native Testing Library.

**Spec:** `../AGENTS.md` (root, authoritative), `AGENTS.md` (mobile), and this audit. Where they disagree, the root `AGENTS.md` wins.

## Execution status

| Task | Result |
|---|---|
| 0 — Approval gate | D1–D7 accepted as recommended. |
| 1 — Motion preference + settings chain | Done: `MotionPreference`, `resolveMotionEnabled`, persisted `motionPreference` / `hapticsEnabled`. |
| 2 — Haptic intents + master switch | Done: `HapticIntent`, 40 ms scrub floor, master switch, `onPress` timing, all call sites migrated. |
| 3 — One icon family | Done: `MaterialCommunityIcons`, 63-name `ICON_GLYPHS`, font preload, lint guard, `iconSize` ramp, catalog test. |
| 4 — Splash, ambient wash, template cleanup | Done: overlay removed, two template leftovers deleted, `AmbientWash` static, no `withRepeat` remains. |
| 5 — Reduced-motion correctness | Done: press springs, skip kick, cross-fade, `GlassProgress`, and sheet drag all honour `useMotionEnabled()`. |
| 6 — Dock + play/pause glyph | Done: height animation, player-half fade, `SwapIcon` in `BouncyIconButton`. |
| 7 — Markers, notes, downloads | Done: marker spring, note exit/layout, `SwapIcon` download state; all sheet scrims were already animated. |
| 8 — Settings UI, docs, validation | Done: Motion card, Haptics switch, section indices renumbered, mobile `AGENTS.md` updated. |

**Pre-existing test failures:** `audioInfo.test.ts` (7), `embeddedArtwork.test.ts` (5), and one `audioTags.test.ts` v2.2 comment/lyrics case fail on a clean `HEAD` worktree as well. They are in the media-byte parsers, untouched by this plan, and are not caused by the motion/icon changes. All other suites pass.

---

## Global Constraints

- **Android only.** Every `eas.json` profile and build script is `--platform android`. `borderCurve: "continuous"` is a no-op; `expo-glass-effect`'s `GlassView` branch never executes. Do not spend a build on either.
- **Card vs Glass.** Everything the user reads is an opaque `Card`; everything that floats (dock, mini-player, sheets, modals, action menus) is a `GlassSurface`. Do not add a new `GlassSurface` call site without justification.
- **Dock invariants (do not change):**
  - One `AppDock` panel holds the now-playing row and the navigation.
  - Five icon-only peer destinations; no raised centre action.
  - Selected = solid accent circle + filled-vs-outlined glyph swap.
  - **No motion on a tab switch.** The pressed spring is the whole interaction.
  - `playerHeight === navHeight` (58). `indicator` 40. `icon` 22, `iconActive` 20.
  - Screens use `dockInset`, never a literal.
- **One continuous loop.** After this plan, the only unbounded animation is the wavy progress bar (`WavyProgress`). Ambient wash, splash glows, and idle shimmers must not loop.
- **Reduced motion is respected at two levels:** the OS setting and the in-app preference. A component that animates must ask `useMotionEnabled()`; a spec's `ReduceMotion.System` alone is not enough for an in-app override.
- **Haptics are a finishing touch, never a failure mode.** Every call is wrapped; a device without a taptic engine does nothing. A master switch disables all of them.
- **Strict TypeScript, no `any`.** Derive icon names from the family's own type.
- **No new dependencies.** The current stack already has a family with every glyph this app needs.
- **Verification commands:** `npm run lint`, `npm run typecheck`, `npm test`. Do not start a dev server, emulator, watcher, or build unless explicitly asked.
- **Commits:** only when the user says `git commit`. Never use `git reset`.

---

## Review Focus

These are the five failure modes most likely to reach a listener. Each has a test or a manual check in the owning task.

1. **Reduced motion still moves.** A listener with OS "Remove animations" on, or the in-app **Reduced** preference, still sees a spring, a rotation kick, a sheet drag, or an ambient loop. Offending code today: `ElasticPressable`, `CrossfadeArtwork`'s skip kick, `NowPlayingSheet`'s pan, `GlassProgress`, and `AmbientWash`.
2. **Haptics fire at the wrong time or twice.** A scroll that begins on a card buzzes; a segment tap fires both `ElasticPressable`'s press-in haptic and an explicit `triggerHaptic` in `onPress`. Excess haptics read as a broken device.
3. **A glyph is a blank box on first launch.** The icon font is not preloaded, or a semantic name maps to a glyph that does not exist in the chosen family. The audit maps all 63 names, but the implementer must pin that with a test.
4. **The dock jumps or overlaps.** Starting/stopping playback mounts/unmounts `DockPlayer` with no height transition, so the one-panel geometry that was carefully fixed snaps by 58 pt. The fix must animate the height without clipping the panel's shadow or reintroducing a clearance token.
5. **Android drops frames under blur.** `AmbientWash` is a 9-second infinite transform running behind a `GlassBlurTarget` on every screen. A continuously moving backdrop under `expo-blur` can force a re-blur every frame. This is the largest likely jank source in the app.

---

# 1. Scope, constraints, and decisions

## 1.1 In scope

- One icon family behind the existing semantic wrapper, with a lint guard and a font preload.
- Motion tokens, reduced-motion correctness, haptic intents and a master switch.
- App-level **Motion** and **Haptics** settings.
- The few motion surfaces that are currently missing or wrong: splash, ambient wash, dock appear/collapse, play/pause glyph swap, annotation markers, notes removal, download progress, sheet scrims.
- Tests for the pure pieces and the icon catalog.

## 1.2 Out of scope

- A visual redesign of cards, typography, colour, or the dock's resting appearance.
- A new navigation animation. Screen pushes stay on the platform's `slide_from_right`; tab switches stay motionless.
- Rebuilding the wavy progress bar, the now-playing morph, the segmented-control thumb, or the cross-fade artwork. They already work and are referenced as the pattern to preserve.
- Backend, sync, database, or audio-engine changes.
- Brand assets. The splash decision removes a template overlay; it does not commission a new logo.

## 1.3 Decisions requiring approval

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D1 | Single icon family | **MaterialCommunityIcons** | 7,448 glyphs; has filled + outlined pairs for every navigation destination; has `rewind-30` and `fast-forward-30`; already installed; all 63 semantic names resolve (verified). Material Symbols via `expo-symbols` cannot express fill (no `fill` prop, no `*_fill1` names in its Android glyph set), and MaterialIcons lacks several names. |
| D2 | AmbientWash | **Make it static** | Removes the only continuous loop besides the progress wave, and removes a per-frame backdrop under Android's `expo-blur`. The two-blob gradient still stops glass reading as flat grey. |
| D3 | Splash | **Remove `AnimatedSplashOverlay`** | It is the Expo template: `expo-logo.png`, `#208AEF`, and a 240-second rotating glow. It is the first motion a listener sees and it says "template", not Pejvak. The native splash already exists via `expo-splash-screen`. |
| D4 | Motion preference values | **System / Full / Reduced** | `System` follows the OS (default); `Full` is an explicit override for listeners who want motion despite an OS setting; `Reduced` is an explicit opt-out. Persist through the existing settings chain. |
| D5 | Haptics switch | **On by default, one master switch** | Most listeners expect haptics; the switch is for those who do not. Default `true` preserves current behavior. |
| D6 | Icon size normalisation | **Add a small `iconSize` ramp; migrate the dock, transport, and rows only** | MCI glyphs are optically heavier than Ionicons at the same point size. A ramp prevents the 13/14/15/16/17/18/19/20/22/24/26/28 sprawl without touching every screen in one commit. |
| D7 | RTL icon mirroring | **Defer** | The app is not forced RTL today; Persian content is rendered with per-string `writingDirection: "rtl"`. Mirroring chevrons only matters if the shell is forced RTL. Do not add `I18nManager` behavior in this overhaul. |

**Approval gate:** reply with the decision numbers you accept or change. Tasks 1–8 assume the recommendations above.

---

# 2. Current-state audit

## 2.1 What already exists and should be kept

| Area | File | State |
|---|---|---|
| Motion tokens | `src/theme/motion.ts` | `springSpec`, seven spring presets, six bezier curves, durations, press ladder, `stagger`, `useMotionEnabled`. This is the foundation; extend it. |
| Press physics | `src/components/motion/ElasticPressable.tsx` | Down at 0.92 with `spring.press`; up snaps to 1.05 with `spring.release`, settles with `spring.bouncy`. Works; needs reduced-motion and haptic-intent handling. |
| Round controls | `src/components/motion/BouncyIconButton.tsx` | Three tones (`accent`, `glass`, `ghost`), 44 pt hit slop, accent glow. |
| Screen entrance | `src/components/motion/Reveal.tsx` | Staggered `FadeInUp/Right/Fade` with a `limit` for virtualised lists. 86 call sites; the list screens use `limit`. |
| Screen scaffold | `src/components/motion/Screen.tsx` | Shared canvas, header, ambient wash. |
| Artwork | `src/components/motion/CrossfadeArtwork.tsx` | 400 ms cross-fade plus a skip kick. |
| Player morph | `src/components/player/NowPlayingSheet.tsx` | Frame grows from the measured mini-player rectangle; content reveals with the morph. |
| Progress wave | `src/components/player/WavyProgress.tsx` | UI-thread sine wave; flattens on pause and stops. This is the reference "one continuous loop". |
| Segmented thumb | `src/components/ui/card/segmented-control.tsx` | Shared translate, seeded from selection, no first-paint jump. |
| Sheet spring | `src/components/ui/glass/GlassSheet.tsx` | Springs open, eases closed; already checks `useMotionEnabled`. |

## 2.2 Findings that drive the plan

### Icons

- `src/components/ui/icon.tsx` is the only file that imports an icon family. Good: one boundary.
- It mixes **Ionicons** (most glyphs) with **MaterialIcons** (four glyphs: `replay-30`, `forward-30`, `playlist-add`, `playlist-add-check`). Two families means two optical weights, two font loads, and two naming schemes.
- 63 semantic names are in use. All 63 have a MaterialCommunityIcons equivalent (verified against the installed glyph map).
- `expo-symbols` is used only by template leftovers: `src/components/app-tabs.web.tsx`, `src/components/ui/collapsible.tsx`. Neither is on the Android path. `collapsible.tsx` has no importer.
- No font preload exists. `@expo/vector-icons` loads on first render, which can flash blank glyph boxes.

### Motion correctness

- **`AnimatedSplashOverlay`** (`src/components/animated-icon.tsx`) is mounted in `src/app/_layout.tsx`. It renders an Expo logo over `#208AEF` and an `AnimatedIcon` glow that rotates for 240 seconds. `AnimatedIcon` itself is unused. The same file is the only reason `expo-logo.png` and `logo-glow.png` are referenced.
- **`AmbientWash`** runs `withRepeat(withTiming(1, 9000), -1, true)` on every `Screen`. On Android this sits behind `GlassBlurTarget`; an animated backdrop under a blur is a per-frame native cost.
- **`ElasticPressable`** always runs the two-spring press and fires `triggerHaptic` on `onPressIn`. It does not consult `useMotionEnabled()`.
- **`CrossfadeArtwork`** applies a 5° rotation + 1.035 scale "skip kick" from an effect that never checks `useMotionEnabled()`. A listener with reduced motion still gets it.
- **`NowPlayingSheet`** sets the initial progress instantly under reduced motion, but the pan gesture still drives `progress` during a drag. Reduced motion should disable the drag-to-dismiss morph (the close button remains).
- **`GlassProgress`** springs on every `progress` prop change and does not check reduced motion. It is used for downloads (`download-progress.tsx`, `online/[key].tsx`, `import.tsx`, `media-card.tsx`), where updates arrive repeatedly.
- **`SegmentedControl`** fires a haptic in `ElasticPressable`'s `onPressIn` and again in `onPress` via `triggerHaptic("selection")`. Every segment tap buzzes twice.
- **`AppDock`** conditionally renders `DockPlayer` and the seam. The panel's height is content-driven, so the dock snaps by one 58 pt row when playback starts or stops. The nav row then shifts, which is exactly the kind of geometry the one-panel design was meant to end.
- **`MiniPlayerRow` / `TransportControls`** swap `play` ↔ `pause` by changing the `name` prop. The glyph changes in one frame with no cross-fade.
- **`AnnotationMarker`** changes `top`, `width`, `height`, and `borderRadius` in the style array when selected. It snaps.
- **`AnnotationList`** uses `Reveal` for entrance but has no exit/layout animation when a note is deleted.
- **`DockPlayer`** has a drag-up preview and a tap-to-open; both are fine. The commit uses `spring.snappy`, which carries `ReduceMotion.System`, but not the app preference.

### Settings

- `src/lib/settings.ts` holds `themePreference`, `defaultSpeed`, `historySort`.
- `src/services/SettingsService.ts` persists three keys through `LocalDBService`.
- `src/store/settingsStore.ts` exposes the values and setters.
- There is no motion or haptics key. `useMotionEnabled()` reads only `useReducedMotion()`.

### Performance hotspots

| Hotspot | Why | Action |
|---|---|---|
| `AmbientWash` under `GlassBlurTarget` | Continuous transform + Android blur | Static (D2). |
| `AnimatedSplashOverlay` glow | 240 s rotation on the first screen | Remove (D3). |
| `GlassProgress` spring per update | JS-thread spring on every download event | Timing + threshold; no spring. |
| `Reveal` on long lists | Reanimated entering per row | Already bounded by `limit`; keep. Do not add `layout` to every list row. |
| `CrossfadeArtwork` two image layers | Two `expo-image` instances during a 400 ms change | Keep; it is the correct way to avoid a blank frame. |

---

# 3. Icon system plan

## 3.1 The one-family rule

`src/components/ui/icon.tsx` becomes the **only** file allowed to import an icon family. Screens continue to ask for semantic names (`"play"`, `"history"`, `"trash"`), so the family can change again in one place.

```ts
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ComponentProps } from "react";

type MciName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/** Exported for `iconCatalog.test.ts`; screens never read it directly. */
export const ICON_GLYPHS = {
  play: "play",
  // …
} as const satisfies Record<string, MciName>;

export type IconName = keyof typeof ICON_GLYPHS;

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
};

export function Icon({ name, size = 20, color, style }: IconProps) {
  return (
    <MaterialCommunityIcons
      name={ICON_GLYPHS[name]}
      size={size}
      color={color}
      style={style}
    />
  );
}
```

No `family` field, no second component, no branching.

## 3.2 Semantic mapping

All 63 names, verified against the installed MaterialCommunityIcons glyph map. `*Filled` names are the selected-state pair for the dock and the favourite/bookmark controls.

| Semantic | MCI glyph | Semantic | MCI glyph |
|---|---|---|---|
| `play` | `play` | `pause` | `pause` |
| `previous` | `skip-previous` | `next` | `skip-next` |
| `rewind` | `rewind-30` | `forward` | `fast-forward-30` |
| `chevronDown` | `chevron-down` | `chevronUp` | `chevron-up` |
| `chevronLeft` | `chevron-left` | `chevronRight` | `chevron-right` |
| `arrowUp` | `arrow-up` | `arrowDown` | `arrow-down` |
| `add` | `plus` | `minus` | `minus` |
| `edit` | `pencil-outline` | `trash` | `delete-outline` |
| `close` | `close` | `check` | `check` |
| `alert` | `alert-circle-outline` | `search` | `magnify` |
| `more` | `dots-horizontal` | `refresh` | `refresh` |
| `playlistAdd` | `playlist-plus` | `playlistAddCheck` | `playlist-check` |
| `library` | `library-outline` | `libraryFilled` | `library` |
| `folder` | `folder-outline` | `folderOpen` | `folder-open-outline` |
| `history` | `clock-outline` | `historyFilled` | `clock` |
| `stats` | `chart-box-outline` | `statsFilled` | `chart-box` |
| `playlists` | `playlist-music-outline` | `playlistsFilled` | `playlist-music` |
| `settings` | `cog-outline` | `notes` | `note-text-outline` |
| `compass` | `compass` | `compassOutline` | `compass-outline` |
| `globe` | `web` | `radio` | `radio` |
| `bookmark` | `bookmark-outline` | `bookmarkFilled` | `bookmark` |
| `heart` | `heart-outline` | `heartFilled` | `heart` |
| `stream` | `cloud-outline` | `cloudDownload` | `cloud-download-outline` |
| `cloudOffline` | `cloud-off-outline` | `cloudDone` | `cloud-check-outline` |
| `playCircle` | `play-circle` | `stopCircle` | `stop-circle-outline` |
| `checkCircle` | `check-circle` | `external` | `open-in-new` |
| `layers` | `layers-outline` | `speed` | `speedometer` |
| `moon` | `moon-waning-crescent` | `sunny` | `white-balance-sunny` |
| `autoTheme` | `theme-light-dark` | `share` | `share-variant-outline` |
| `music` | `music-note-outline` | `download` | `download-outline` |
| `person` | `account-outline` | `logout` | `logout` |
| `sparkle` | `auto-fix` | | |

### Notes on two choices

- **`history` → `clock-outline` / `clock`.** MCI's `history` glyph has no filled partner. The destination needs a filled-vs-outlined swap, and a clock is a legitimate "history" mark. If the pair is not worth the semantic drift, use `history` for both and accept that the circle alone carries the selected state. **Recommendation:** use the clock pair; the accessibility label and the dock's position carry the meaning.
- **`globe` → `web`.** MCI's `web` is the meridian globe. If it reads too technical, `earth` is the alternative; both exist. **Recommendation:** `web`.

## 3.3 Icon sizes

Add one ramp to `src/theme/tokens.ts`:

```ts
/** Optical sizes for the single icon family. */
export const iconSize = {
  xs: 13,
  sm: 15,
  md: 18,
  lg: 22,
  xl: 26,
  hero: 44,
} as const;
```

Migrate only the high-traffic surfaces in this overhaul:
- Dock: `layout.dock.icon` / `iconActive` stay where they are (22 / 20), because the dock's geometry test pins them.
- Transport: previous/next `iconSize={22}`, rewind/forward `24`, play `32`; these are already sensible. Replace the literals with `iconSize` entries only where the value matches, otherwise leave them and revisit after the family swap.
- Rows and chips: 15/16/18 become `iconSize.sm/md` where the visual result is identical.

Do **not** do a global find-and-replace of every numeric size. The family swap changes optical weight; measure on a device first.

## 3.4 Font loading

`MaterialCommunityIcons.font` must be loaded before the first `Icon` renders, or the first frame shows blank boxes. In `src/app/_layout.tsx`:

```ts
import { useFonts } from "expo-font";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

const [fontsLoaded] = useFonts(MaterialCommunityIcons.font);
```

Hide the native splash only when `fontsLoaded` **and** the auth store is no longer `loading`. This replaces the current `AnimatedSplashOverlay`'s `onLayout` hook.

## 3.5 Lint guard

In `eslint.config.js`, add a restricted-import rule so a future screen cannot import a family directly:

```js
{
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          { name: "@expo/vector-icons/Ionicons", message: "Use <Icon> from @/components/ui/icon." },
          { name: "@expo/vector-icons/MaterialIcons", message: "Use <Icon> from @/components/ui/icon." },
        ],
        patterns: ["@expo/vector-icons/*"],
      },
    ],
  },
},
{
  files: ["src/components/ui/icon.tsx"],
  rules: { "no-restricted-imports": "off" },
},
```

`expo-symbols` is not an `@expo/vector-icons` import, so the template files do not fail the rule. They are still cleanup candidates (see Task 4).

## 3.6 Tests

`src/components/ui/__tests__/iconCatalog.test.ts`:

- Every key of `ICON_GLYPHS` maps to a glyph present in the installed MaterialCommunityIcons glyph map.
- Every `*Filled` name has a base name (`library` / `libraryFilled`, `history` / `historyFilled`, etc.).
- The map has no duplicate glyph for two unrelated semantics (allow the intentional `history`/`clock` exception explicitly).
- `src/components/ui/icon.tsx` imports `MaterialCommunityIcons` and does not mention `Ionicons` or `MaterialIcons` (read the file text, the same technique `segmented-control.test.ts` uses).

---

# 4. Motion system plan

## 4.1 Personality

Calm, precise, premium. Motion confirms an action; it does not perform. The rules:

1. **Physical where the finger is.** Presses, drags, scrubs use springs.
2. **Deliberate where the eye is.** Cross-fades, screen changes, surface resizes use curves.
3. **Short.** Press feedback is felt in ~70 ms. Exits are ~70% of the matching entrance. A reveal is not a wait.
4. **Interruptible.** A spring never blocks touches; a gesture can reverse mid-flight.
5. **One loop.** Only the playback wave runs unbounded.
6. **Never animate text per glyph.** Persian is cursive; per-character motion breaks joins. Animate the container, not the letters.
7. **Numbers stay tabular.** Timing changes, not digit widths.

## 4.2 Token changes

Extend `src/theme/motion.ts`; do not replace it.

```ts
export const duration = {
  instant: 120,
  /** Exits: ~70% of the matching entrance. */
  exit: 130,
  quick: 180,
  base: 260,
  toggle: 120,
  crossfade: 400,
  screen: 420,
  ambient: 9000, // retained for any future one-shot ambience; no infinite loop
} as const;

export const spring = {
  // …existing presets unchanged…
  /** Marker selection: small travel, no visible wobble. */
  marker: springSpec(0.78, 520, 0.8),
  /** Dock surface resize: firm, no overshoot on a panel edge. */
  dock: springSpec(0.9, 300, 0.9),
} as const;
```

Keep `springSpec`'s `reduceMotion: ReduceMotion.System` as a second guard, but never rely on it for the in-app preference. Components call `useMotionEnabled()` and choose an instant value when false.

## 4.3 Motion preference

```ts
// src/lib/motionPreference.ts
export type MotionPreference = "system" | "full" | "reduced";

/**
 * Resolve the effective motion setting.
 * - "system"  → follow the OS.
 * - "full"    → animate even when the OS asks for reduced motion.
 * - "reduced" → never animate, regardless of the OS.
 */
export function resolveMotionEnabled(
  preference: MotionPreference,
  osReduced: boolean,
): boolean {
  if (preference === "reduced") return false;
  if (preference === "full") return true;
  return !osReduced;
}
```

`useMotionEnabled()` in `src/theme/motion.ts` becomes:

```ts
export function useMotionEnabled(): boolean {
  const osReduced = useReducedMotion();
  const preference = useSettingsStore((state) => state.motionPreference);
  return resolveMotionEnabled(preference, osReduced);
}
```

**Circular-import check:** `settingsStore` imports `lib/settings` and `SettingsService`; neither imports `theme/motion`. The direction is one-way, so this is safe. If a cycle appears, move the resolver into `theme/motion.ts` and keep the pure function exported from there.

## 4.4 Settings chain

`src/lib/settings.ts`:

```ts
export type MotionPreference = "system" | "full" | "reduced";
export const MOTION_PREFERENCES: MotionPreference[] = ["system", "full", "reduced"];

export type AppSettings = {
  themePreference: ThemePreference;
  defaultSpeed: number;
  historySort: HistorySort;
  motionPreference: MotionPreference;
  hapticsEnabled: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  themePreference: "system",
  defaultSpeed: 1,
  historySort: "newest",
  motionPreference: "system",
  hapticsEnabled: true,
};

export function parseMotionPreference(value: string | null): MotionPreference;
export function parseBoolean(value: string | null, fallback: boolean): boolean;
```

`src/services/SettingsService.ts` adds keys `motion` and `haptics`, loads them in the same `Promise.all`, and adds `setMotionPreference` / `setHapticsEnabled`.

`src/store/settingsStore.ts` adds:

```ts
motionPreference: MotionPreference;
hapticsEnabled: boolean;
setMotionPreference: (preference: MotionPreference) => Promise<void>;
setHapticsEnabled: (enabled: boolean) => Promise<void>;
```

## 4.5 Haptics

Replace the raw style union with named intents:

```ts
export type HapticIntent =
  | "none"
  | "tap"
  | "select"
  | "press"
  | "success"
  | "warning"
  | "error"
  | "scrub";

export function triggerHaptic(intent: HapticIntent = "tap"): void;
```

| Intent | Expo Haptics | Used for |
|---|---|---|
| `tap` | `impactAsync(Light)` | Icon buttons, rows, links |
| `select` | `selectionAsync()` | Tabs, chips, segments, marker selection |
| `press` | `impactAsync(Medium)` | The play button, a primary action |
| `success` | `notificationAsync(Success)` | Note saved, added to playlist, download complete |
| `warning` | `notificationAsync(Warning)` | A retryable failure |
| `error` | `notificationAsync(Error)` | A destructive failure |
| `scrub` | `selectionAsync()` | Timeline ticks (throttled) |
| `none` | — | Gesture-driven sheets, haptic already fired elsewhere |

Behavior:
- Read `useSettingsStore.getState().hapticsEnabled`; if false, return immediately.
- Keep the `Platform.OS === "web"` guard and the `try/catch`.
- Apply a **40 ms floor for `scrub` only**, so a fast drag cannot buzz continuously. The `Scrubber` keeps its own 50 ms step throttle as the primary guard.
- Do not haptic on `onPressIn` for controls that live inside a scroll view if the press is cancelled by a drag. `ElasticPressable` uses `onPressIn`; change it to haptic on `onPress` (a completed press) and keep the scale on `onPressIn`. This removes the "buzz while scrolling" class of bug. The visual press remains immediate because the scale is independent of the haptic.

Call-site migration (34 occurrences across `src/components/**` and `src/app/**`):

| Old | New |
|---|---|
| `"light"` | `"tap"` |
| `"medium"` | `"press"` |
| `"selection"` | `"select"` |
| `"success"` | `"success"` |
| `"none"` | `"none"` |
| `triggerHaptic("light")` in `Scrubber.commitSeek` | `triggerHaptic("tap")` |
| `triggerHaptic("selection")` at scrub start | `triggerHaptic("select")` |
| Per-tick `triggerHaptic("selection")` | `triggerHaptic("scrub")` |
| Explicit `triggerHaptic("selection")` in `SegmentedControl.onPress` | **delete** (ElasticPressable already fires) |

## 4.6 Per-surface choreography

| Surface | Today | After |
|---|---|---|
| **App launch** | Expo overlay, 240 s rotating glow | Native splash until fonts + auth are ready; 180 ms fade into the app. No loop. |
| **Ambient wash** | 9 s infinite drift | Static two-blob gradient. |
| **Tab switch** | None | None. Preserve. |
| **Screen push** | `slide_from_right`, 420 ms | Preserve. Do not add a custom shared-element transition. |
| **Screen header/reveals** | `FadeInUp`, 420 ms, 45 ms stagger, cap 320 | Preserve. Optional later: 40 ms stagger / 280 cap if it feels slow on device. Not part of this plan. |
| **Press** | Two-spring scale + haptic on press-in | Same scale; haptic on completed press; reduced motion sets scale instantly. |
| **Dock appear/collapse** | Height snaps by 58 pt | Animate the inner column height from `navHeight` to `playerHeight + navHeight + hairline` with `withTiming(220, easing.emphasized)`; fade the player half in/out over 180/130 ms. No new clearance token. |
| **Play/pause glyph** | Instant swap | 120 ms cross-fade + 0.92→1 scale via `SwapIcon`. |
| **Scrubber** | Wave + thumb + bubble; haptics | Preserve. Use `select`/`scrub`/`tap` intents; marker selection springs. |
| **Annotation marker** | Selected geometry snaps | Spring scale/height with `spring.marker`; new markers fade in. |
| **Notes list** | Reveal in; delete snaps | `LinearTransition` + `FadeOut` on rows. Keep `Reveal` for entrance. |
| **Download progress** | Spring per update | `withTiming(200, outQuint)` when the change is >0.5%; instant below that; no animation under reduced motion. |
| **Sheets** | `GlassSheet` springs; scrim presence varies | Keep the sheet spring. If a scrim snaps, bind its opacity to the same open value. Do not animate the sheet's content text per glyph. |
| **Chips/segments** | Press + thumb spring | Preserve; remove the double haptic. |
| **Splash/empty states** | Static | Static. No shimmer. |

---

# 5. Phased implementation tasks

Each task is an independently reviewable change. Run the listed verification before moving on.

---

### Task 0: Approval gate

- [ ] Read §1.3 and reply with accepted/changed decisions.
- [ ] Do not edit code before approval.

---

### Task 1: Settings — motion and haptics preference

**Files:**
- Create: `src/lib/motionPreference.ts`
- Modify: `src/lib/settings.ts`
- Modify: `src/services/SettingsService.ts`
- Modify: `src/store/settingsStore.ts`
- Modify: `src/theme/motion.ts`
- Test: `src/lib/__tests__/settings.test.ts`
- Test: `src/lib/__tests__/motionPreference.test.ts`

**Interfaces:**
- Produces: `MotionPreference`, `MOTION_PREFERENCES`, `parseMotionPreference`, `parseBoolean`, `resolveMotionEnabled`, `AppSettings.motionPreference`, `AppSettings.hapticsEnabled`, `useSettingsStore.setMotionPreference`, `useSettingsStore.setHapticsEnabled`.
- Consumes: existing `LocalDBService.getSetting` / `setSetting`.

- [ ] **Step 1: Write the failing settings test.**

Add to `settings.test.ts`:

```ts
it("defaults to system motion and haptics on", () => {
  expect(DEFAULT_SETTINGS).toEqual({
    themePreference: "system",
    defaultSpeed: 1,
    historySort: "newest",
    motionPreference: "system",
    hapticsEnabled: true,
  });
});

it("parses only known motion preferences", () => {
  expect(parseMotionPreference("reduced")).toBe("reduced");
  expect(parseMotionPreference("full")).toBe("full");
  expect(parseMotionPreference("cinematic")).toBe("system");
  expect(parseMotionPreference(null)).toBe("system");
});

it("parses booleans without treating every string as true", () => {
  expect(parseBoolean("true", false)).toBe(true);
  expect(parseBoolean("false", true)).toBe(false);
  expect(parseBoolean(null, true)).toBe(true);
  expect(parseBoolean("yes", false)).toBe(false);
});
```

Add `motionPreference.test.ts`:

```ts
it("system follows the OS", () => {
  expect(resolveMotionEnabled("system", true)).toBe(false);
  expect(resolveMotionEnabled("system", false)).toBe(true);
});
it("full overrides the OS", () => {
  expect(resolveMotionEnabled("full", true)).toBe(true);
});
it("reduced never animates", () => {
  expect(resolveMotionEnabled("reduced", false)).toBe(false);
});
```

- [ ] **Step 2: Run the new tests and verify they fail.**

Run: `npm test -- settings.test.ts motionPreference.test.ts`
Expected: FAIL — `parseMotionPreference`/`resolveMotionEnabled` are not exported; `DEFAULT_SETTINGS` lacks the new keys.

- [ ] **Step 3: Implement the pure settings module and resolver.**

Add the types/parsers to `src/lib/settings.ts`; create `src/lib/motionPreference.ts` with the resolver. Keep both pure (no React, no store, no DB).

- [ ] **Step 4: Wire persistence.**

`SettingsService.load` reads `motion` and `haptics` in the existing `Promise.all`; `setMotionPreference` and `setHapticsEnabled` write them. `settingsStore.load` spreads the loaded object and adds both setters. No new DB table, no migration.

- [ ] **Step 5: Wire `useMotionEnabled`.**

Import the resolver and `useSettingsStore` into `src/theme/motion.ts`; replace the body of `useMotionEnabled`. Keep the exported signature unchanged.

- [ ] **Step 6: Run tests and typecheck.**

Run: `npm test -- settings.test.ts motionPreference.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit (only if asked).**

```bash
git add src/lib/settings.ts src/lib/motionPreference.ts src/lib/__tests__/settings.test.ts src/lib/__tests__/motionPreference.test.ts src/services/SettingsService.ts src/store/settingsStore.ts src/theme/motion.ts
git commit -m "feat(settings): add motion and haptics preferences"
```

---

### Task 2: Haptics — named intents, master switch, no double-fire

**Files:**
- Modify: `src/components/ui/haptics.ts`
- Modify: `src/components/motion/ElasticPressable.tsx`
- Modify: `src/components/motion/BouncyIconButton.tsx`
- Modify: `src/components/ui/card/segmented-control.tsx`
- Modify: all call sites listed in §4.5 (`TransportControls`, `Scrubber`, `PrimaryButton`, `GlassChip`, `CardRow`, `MediaCard`, `AddToPlaylistSheet`, `ContextHistorySheet`, `SessionDetailSheet`, `annotation-list`, `app-dock`, `settings`, `online/*`, `stats`, `stat-cell`, `collection-card`, `language-row`, `online-track-row`, `smart-playlist-row`, `stretch-card`, `session-card`, `context-play-card`, `MembershipBadge` if applicable)
- Test: `src/components/ui/__tests__/haptics.test.ts`

**Interfaces:**
- Produces: `HapticIntent`, `triggerHaptic(intent?: HapticIntent): void`.
- Consumes: `useSettingsStore.getState().hapticsEnabled`.

- [ ] **Step 1: Write the failing haptics test.**

Mock `expo-haptics` and the settings store. Assert:
- `triggerHaptic("select")` calls `selectionAsync` once.
- `triggerHaptic("press")` calls `impactAsync(Medium)`.
- `success`/`warning`/`error` map to `notificationAsync`.
- `hapticsEnabled: false` → no native call.
- Two `scrub` calls within 40 ms → one native call.
- `web` platform → no call.

- [ ] **Step 2: Run it and verify it fails.**

Run: `npm test -- haptics.test.ts`
Expected: FAIL — the intent union and switch do not exist.

- [ ] **Step 3: Implement the intent map and master switch.**

Keep the `try/catch` and the web guard. Import the store lazily inside the function (`useSettingsStore.getState()`) so the module stays safe in tests and outside the React tree.

- [ ] **Step 4: Move the press haptic from `onPressIn` to `onPress`.**

In `ElasticPressable`, keep `onPressIn` for the scale spring and call `triggerHaptic(haptic)` from `onPress`, only when not disabled. This prevents a scroll that begins on a card from buzzing. Keep the scale animation on press-in so the visual response stays immediate.

- [ ] **Step 5: Remove the duplicate segment haptic.**

Delete `triggerHaptic("selection")` from `SegmentedControl.onPress`; `ElasticPressable` owns it.

- [ ] **Step 6: Migrate call sites mechanically.**

Map `light→tap`, `medium→press`, `selection→select`; leave `success`/`none`. Remove imports that become unused.

- [ ] **Step 7: Run tests, lint, typecheck.**

Run: `npm test -- haptics.test.ts && npm run lint && npm run typecheck`
Expected: PASS. Lint must report no unused `triggerHaptic` imports.

- [ ] **Step 8: Commit (only if asked).**

```bash
git add src/components/ui/haptics.ts src/components/ui/__tests__/haptics.test.ts src/components/motion/ElasticPressable.tsx src/components/motion/BouncyIconButton.tsx src/components/ui/card/segmented-control.tsx
git commit -m "feat(haptics): add named intents and a master switch"
```

Add the remaining call-site files to the same commit.

---

### Task 3: Icon family consolidation

**Files:**
- Modify: `src/components/ui/icon.tsx`
- Modify: `eslint.config.js`
- Create: `src/components/ui/__tests__/iconCatalog.test.ts`
- Modify: `src/app/_layout.tsx` (font preload; coordinated with Task 4)
- Modify: `src/theme/tokens.ts` (add `iconSize`)

**Interfaces:**
- Produces: `ICON_GLYPHS`, `IconName`, `Icon`, `iconSize`.
- Consumes: `MaterialCommunityIcons` from `@expo/vector-icons/MaterialCommunityIcons`.

- [ ] **Step 1: Write the failing catalog test.**

```ts
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { ICON_GLYPHS } from "@/components/ui/icon";

it("maps every semantic name to a real MaterialCommunityIcons glyph", () => {
  for (const [semantic, glyph] of Object.entries(ICON_GLYPHS)) {
    expect(MaterialCommunityIcons.glyphMap[glyph]).toBeDefined();
  }
});

it("has a filled pair for every dock destination", () => {
  for (const base of ["library", "history", "stats", "playlists", "compass"]) {
    expect(ICON_GLYPHS[base as keyof typeof ICON_GLYPHS]).toBeDefined();
  }
});

it("imports only MaterialCommunityIcons", () => {
  const source = readFileSync("src/components/ui/icon.tsx", "utf8");
  expect(source).toContain("MaterialCommunityIcons");
  expect(source).not.toContain("Ionicons");
  expect(source).not.toContain("@expo/vector-icons/MaterialIcons");
});
```

If `MaterialCommunityIcons.glyphMap` is not exposed in this version, import the installed glyph map JSON directly:
`@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json`.

- [ ] **Step 2: Run it and verify it fails.**

Run: `npm test -- iconCatalog.test.ts`
Expected: FAIL — `ICON_GLYPHS` is not exported and the file still imports Ionicons.

- [ ] **Step 3: Replace the wrapper with the single family.**

Use the mapping in §3.2. Delete the `family` union and the branching render. Export `ICON_GLYPHS` for the test.

- [ ] **Step 4: Add the icon-size ramp.**

Add `iconSize` to `src/theme/tokens.ts`. Do not change `layout.dock.icon` / `iconActive`; the dock's geometry test depends on them.

- [ ] **Step 5: Add the lint guard.**

Add the `no-restricted-imports` rule and the `icon.tsx` override from §3.5. Run `npm run lint` and fix any direct import the audit missed.

- [ ] **Step 6: Run the catalog test, lint, typecheck.**

Run: `npm test -- iconCatalog.test.ts && npm run lint && npm run typecheck`
Expected: PASS. If `IconName` is used in a place that relied on the old union, the compiler will name it.

- [ ] **Step 7: Device check.**

Run the app on Android and verify: every icon renders (no blank boxes); the dock's selected glyphs read at 20 pt; the 30-second skip glyphs are the correct MCI variants; no glyph looks visibly heavier than its neighbours. Adjust only the sizes that are wrong; do not redo the ramp.

- [ ] **Step 8: Commit (only if asked).**

```bash
git add src/components/ui/icon.tsx src/components/ui/__tests__/iconCatalog.test.ts eslint.config.js src/theme/tokens.ts
git commit -m "refactor(ui): consolidate icons on MaterialCommunityIcons"
```

---

### Task 4: Splash, ambient wash, and template cleanup

**Files:**
- Modify: `src/app/_layout.tsx`
- Modify: `src/components/motion/AmbientWash.tsx`
- Modify: `src/components/motion/Screen.tsx` only if the `AmbientWash` API changes
- Delete: `src/components/animated-icon.tsx`
- Delete: `src/components/animated-icon.web.tsx`
- Review: `src/components/ui/collapsible.tsx`, `src/components/web-badge.tsx`, `src/components/hint-row.tsx`, `src/components/app-tabs.web.tsx`

**Interfaces:**
- Produces: no new public API. `AmbientWash` keeps its props; it simply stops animating.

- [ ] **Step 1: Remove the Expo splash overlay.**

Delete the `AnimatedSplashOverlay` import and element from `_layout.tsx`. Keep `SplashScreen.preventAutoHideAsync()`. Hide the native splash when `fontsLoaded` (Task 3) and `status !== "loading"`:

```ts
useEffect(() => {
  if (fontsLoaded && status !== "loading") {
    void SplashScreen.hideAsync();
  }
}, [fontsLoaded, status]);
```

Do not add a replacement animation. The native splash already shows the configured image. If a fade is desired, use a 180 ms opacity wrapper — no logo, no loop.

- [ ] **Step 2: Delete the template files.**

Remove `animated-icon.tsx` and `animated-icon.web.tsx`. Verify with `rg "animated-icon" src` that nothing imports them. Leave the image assets in place; deleting assets is a separate brand decision.

- [ ] **Step 3: Make AmbientWash static.**

Remove the `useEffect`, `withRepeat`, `withTiming`, `useSharedValue`, `useAnimatedStyle`, and `useMotionEnabled` imports. Render the two blobs at fixed transforms (the midpoint of the old drift, e.g. `drift = 0.5`). Keep the gradients, sizes, positions, and `pointerEvents="none"`.

- [ ] **Step 4: Verify no other continuous loops.**

Run: `rg "withRepeat" src` — the only remaining match should be `WavyProgress.tsx`. If a match is intentional, document it in the file.

- [ ] **Step 5: Device check.**

Cold start twice: no Expo logo, no blue flash beyond the configured splash, no blank icon frame. Navigate between screens: the ambient blobs are still visible but motionless; scrolling under the dock feels smoother than before.

- [ ] **Step 6: Run lint, typecheck, tests.**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit (only if asked).**

```bash
git add src/app/_layout.tsx src/components/motion/AmbientWash.tsx
git rm src/components/animated-icon.tsx src/components/animated-icon.web.tsx
git commit -m "refactor(motion): remove the template splash and the ambient loop"
```

---

### Task 5: Reduced-motion correctness

**Files:**
- Modify: `src/components/motion/ElasticPressable.tsx`
- Modify: `src/components/motion/CrossfadeArtwork.tsx`
- Modify: `src/components/ui/glass/GlassProgress.tsx`
- Modify: `src/components/player/NowPlayingSheet.tsx`
- Review: `src/components/motion/use-crossfade.ts`

- [ ] **Step 1: Make `ElasticPressable` respect the setting.**

`const motionEnabled = useMotionEnabled();`
- `onPressIn`: `scale.value = motionEnabled ? withSpring(scaleTo, spring.press) : scaleTo;`
- `onPressOut`: `scale.value = motionEnabled ? withSequence(...) : press.rest;`

- [ ] **Step 2: Guard the artwork skip kick.**

In `CrossfadeArtwork`, read `useMotionEnabled()` and return early from the `skipNonce` effect when false. The cross-fade itself can remain (it is a fade, not motion), but it should also degrade to an instant swap when reduced motion is on. Audit `use-crossfade.ts`: if it uses `withTiming` with `curve()`, the spec already carries `ReduceMotion.System`, but it does not know the app preference. Pass an `enabled` flag or set the shared value directly.

- [ ] **Step 3: Make `GlassProgress` cheap and conditional.**

Replace `withSpring(clamped, spring.snappy)` with:
- If `!motionEnabled` or `Math.abs(clamped - value.value) < 0.005`: `value.value = clamped`.
- Else: `value.value = withTiming(clamped, curve(easing.outQuint, 200));`

This removes a spring per download event and keeps seeks smooth.

- [ ] **Step 4: Disable the sheet's drag under reduced motion.**

In `NowPlayingSheet`, when `!motionEnabled`, do not attach the pan gesture to the header (`headerGesture` becomes `undefined` in `PlayerContent`) or make the gesture's `onUpdate` a no-op. The close button still dismisses. The initial open is already instant.

- [ ] **Step 5: Test the matrix.**

On a device with OS "Remove animations" on:
- Press a card: no scale spring.
- Open the player: no frame morph; content is present.
- Drag the player header: it does not move; the close button works.
- Skip tracks: artwork swaps without the rotation kick.
- Download: the bar updates without a spring overshoot.

Then set the in-app preference to **Reduced** with OS animations on: the same behavior. Then set **Full** with OS reduced: motion returns. Document that this is intentional.

- [ ] **Step 6: Run lint, typecheck, tests.**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit (only if asked).**

```bash
git add src/components/motion/ElasticPressable.tsx src/components/motion/CrossfadeArtwork.tsx src/components/motion/use-crossfade.ts src/components/ui/glass/GlassProgress.tsx src/components/player/NowPlayingSheet.tsx src/components/player/PlayerContent.tsx
git commit -m "fix(motion): honour reduced motion everywhere"
```

---

### Task 6: Dock appear/collapse and the play/pause glyph

**Files:**
- Create: `src/components/motion/SwapIcon.tsx`
- Modify: `src/components/motion/BouncyIconButton.tsx`
- Modify: `src/components/app-dock.tsx`
- Modify: `src/components/player/DockPlayer.tsx`
- Modify: `src/components/player/MiniPlayerRow.tsx`
- Modify: `src/components/player/TransportControls.tsx` only if it needs a size tweak
- Test: `src/components/ui/__tests__/dockGeometry.test.ts` (should pass unchanged; extend only if a new invariant is added)

**Interfaces:**
- Produces: `SwapIcon({ name, size, color, style })`. It renders the current glyph and cross-fades from the previous one when `name` changes.
- Consumes: `Icon`, `useMotionEnabled`, `duration.toggle`, `spring.snappy`.

- [ ] **Step 1: Build `SwapIcon`.**

Keep the previous name in a ref. On change:
- If motion is off: render only the new glyph.
- Else: keep the outgoing glyph mounted for `duration.toggle` (120 ms), fading it out and scaling 1→0.92; fade the incoming 0.92→1. Use absolute layers so the button does not resize. `pointerEvents="none"`.

- [ ] **Step 2: Use `SwapIcon` inside `BouncyIconButton`.**

Replace `<Icon name={name} … />` with `<SwapIcon name={name} … />`. This gives the play/pause toggle for free in the transport and the mini-player, and is a no-op for buttons whose name never changes.

- [ ] **Step 3: Animate the dock's height.**

The dock's two halves are both 58 pt, so the panel height is deterministic:

```ts
const expandedHeight =
  layout.dock.playerHeight + layout.dock.navHeight + hairline;
const collapsedHeight = layout.dock.navHeight;

const height = useSharedValue(playing ? expandedHeight : collapsedHeight);
useEffect(() => {
  height.value = motionEnabled
    ? withTiming(playing ? expandedHeight : collapsedHeight, curve(easing.emphasized, 220))
    : playing ? expandedHeight : collapsedHeight;
}, [playing, motionEnabled, height]);

const contentStyle = useAnimatedStyle(() => ({ height: height.value }));
```

Wrap the panel's children in an `Animated.View` with `contentStyle`, `overflow: "hidden"`, `justifyContent: "flex-end"`. Keep the shadow on `GlassSurface` so the wrapper's clipping does not cut it. The nav row stays at the bottom while the player half grows above it.

- [ ] **Step 4: Fade the player half and the seam.**

Wrap `DockPlayer` and the seam in an `Animated.View` with `entering={FadeIn.duration(duration.quick)}` and `exiting={FadeOut.duration(duration.exit)}`. Keep the `key={trackId ?? "player"}` on `DockPlayer` so a track change still re-measures the anchor. Do not animate the nav row; it must not move.

- [ ] **Step 5: Verify the geometry test and the device.**

Run: `npm test -- dockGeometry.test.ts`
Expected: PASS (the constants are unchanged).

On device:
- Start playback from the Library: the dock grows by one row, the nav stays put, the now-playing row fades in, no overlap.
- Pause and stop: the row fades out, the dock collapses, the nav stays put.
- Rapidly play/stop: the height animation reverses without a jump (it is interruptible).
- While playing, switch tabs: no motion in the nav (preserved).

- [ ] **Step 6: Run lint, typecheck, tests.**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit (only if asked).**

```bash
git add src/components/motion/SwapIcon.tsx src/components/motion/BouncyIconButton.tsx src/components/app-dock.tsx src/components/player/DockPlayer.tsx src/components/player/MiniPlayerRow.tsx
git commit -m "feat(dock): animate the player half and cross-fade play/pause"
```

---

### Task 7: Annotation markers, notes, downloads, sheet scrims

**Files:**
- Modify: `src/components/annotation-marker.tsx`
- Modify: `src/components/annotation-list.tsx`
- Modify: `src/components/online/download-progress.tsx`
- Review: `src/components/ui/glass/GlassSheet.tsx`, `src/components/add-to-playlist/AddToPlaylistSheet.tsx`, `src/components/context-history/ContextHistorySheet.tsx`, `src/components/session-detail/SessionDetailSheet.tsx`

- [ ] **Step 1: Spring the marker selection.**

Wrap the marker in `Animated.View` with `useAnimatedStyle` scaling to 1.25 and translating up 2 pt when `selected`. Use `withSpring(spring.marker)` when motion is enabled, otherwise set the value. Keep the `Pressable` hit slop and accessibility label unchanged. Do not animate `left` (the percentage position); scale from the marker's own centre.

- [ ] **Step 2: Animate note removal.**

In `AnnotationList`, add `layout={LinearTransition}` and `exiting={FadeOut.duration(duration.exit)}` to each row. Keep `Reveal` for the initial entrance. Verify that deleting a note closes the gap smoothly and that adding one does not replay the whole list's stagger.

- [ ] **Step 3: Use `SwapIcon` for the download state.**

Replace the state `Icon` in `DownloadControl` with `SwapIcon`. The headline text stays static; only the glyph cross-fades. The `GlassProgress` change from Task 5 already handles the bar.

- [ ] **Step 4: Audit the sheet scrims.**

Open each sheet and confirm the backdrop appears/disappears with the sheet rather than snapping. If a scrim is a plain `View` with a hardcoded opacity, bind it to the sheet's `open` state with a 180 ms timing (or the same spring). Do not add a new sheet primitive.

- [ ] **Step 5: Device check.**

- Create a note: it appears, the marker is added, selecting it springs.
- Delete a note: the row fades/collapses; the marker disappears.
- Download a collection: the bar eases; the icon cross-fades between downloading/paused/complete.
- Open/close each sheet: no scrim snap; the sheet still dismisses by drag where it did before.

- [ ] **Step 6: Run lint, typecheck, tests.**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit (only if asked).**

```bash
git add src/components/annotation-marker.tsx src/components/annotation-list.tsx src/components/online/download-progress.tsx
git commit -m "feat(motion): polish markers, notes, downloads, and sheets"
```

---

### Task 8: Settings UI, documentation, and full validation

**Files:**
- Modify: `src/app/settings.tsx`
- Modify: `AGENTS.md` (mobile) — add the one-family rule and the motion/haptics preference contract
- Modify: `docs/MOTION_AND_ICON_PLAN.md` — mark tasks complete and record decisions

`CardRow` already accepts a `trailing` slot (verified in `src/components/ui/card/card-row.tsx`), so no primitive change is needed.

- [ ] **Step 1: Add the Motion card.**

Insert a `CardSection title="MOTION"` after Appearance:

```tsx
<CardSection
  title="MOTION"
  index={10}
  footer="System follows your device's animation setting.">
  <View style={styles.control}>
    <SegmentedControl
      accessibilityLabel="Motion"
      options={MOTION_OPTIONS}
      value={motionPreference}
      onChange={(value) => void setMotionPreference(value)}
    />
  </View>
</CardSection>
```

`MOTION_OPTIONS` labels: `System`, `Full`, `Reduced`.

- [ ] **Step 2: Add the haptics row.**

Add a row with a leading glyph and a trailing `Switch`. `CardRow` already has `trailing?: React.ReactNode`; confirm it suppresses the chevron when present (it renders the chevron only for `onPress`, so a non-pressable row with `trailing` is correct). Use the native `Switch` with `trackColor={{ true: theme.accent }}`; do not import `@expo/ui` for this.

```tsx
<CardRow
  position="last"
  icon="sparkle"
  label="Haptics"
  detail="A light tap on controls and selections."
  trailing={
    <Switch
      accessibilityLabel="Haptics"
      value={hapticsEnabled}
      onValueChange={(value) => void setHapticsEnabled(value)}
    />
  }
/>
```

- [ ] **Step 3: Re-number the section indices.**

The current indices are `1, 4, 7, 10, 13`. Adding Motion makes them `1, 4, 7, 10, 13, 16` for Account, Playback, Appearance, Motion, Storage & Sync, and the sign-out Reveal. Verify the stagger still reads top-to-bottom; do not refactor the numbering scheme in this task.

- [ ] **Step 4: Update the mobile `AGENTS.md`.**

Add a short section under "Card system" or "Testing and validation":

- One icon family: `MaterialCommunityIcons`, behind `Icon`; no direct `@expo/vector-icons` imports elsewhere.
- Motion is governed by `useMotionEnabled()`, which combines the OS setting and the in-app preference.
- Haptics go through `triggerHaptic(intent)`; never call `expo-haptics` directly.
- The only unbounded animation is `WavyProgress`.

- [ ] **Step 5: Run the full suite.**

```bash
npm run lint
npm run typecheck
npm test
```

Expected: all pass. If `npm test` is slow, run it once at the end rather than per task.

- [ ] **Step 6: Run the manual acceptance matrix.**

| Check | Expected |
|---|---|
| Cold start, twice | No Expo logo; no blank glyphs; splash hides once, no flash |
| OS reduced motion + app System | No press springs, no morph, no ambient drift, no skip kick |
| App Reduced + OS animations on | Same as above |
| App Full + OS reduced | Motion returns (documented override) |
| Haptics off | No buzz on press, tab, segment, scrub, success |
| Scroll a long library from a card | No haptic on scroll start |
| Tap a segment once | Exactly one haptic |
| Play a track | Dock grows smoothly; nav does not move; no overlap |
| Pause/stop | Dock collapses; nav does not move |
| Play/pause | Glyph cross-fades; button does not resize |
| Scrub | Bubble, wave, thumb, and scrub ticks still work |
| Create/select/delete a note | Marker springs; row fades out; list closes the gap |
| Download a collection | Bar eases; state glyph cross-fades; cancel/delete still work |
| Open each sheet | Sheet springs; scrim does not snap |
| Persian titles | No per-glyph motion; numbers stay tabular |
| Low-end device | Scrolling under the dock is smoother than before (ambient static) |

- [ ] **Step 7: Commit (only if asked).**

```bash
git add src/app/settings.tsx AGENTS.md docs/MOTION_AND_ICON_PLAN.md
git commit -m "feat(settings): expose motion and haptics controls"
```

---

# 6. Testing, risks, and acceptance

## 6.1 Automated tests to add or extend

| Test | File | Pins |
|---|---|---|
| Settings defaults/parsers | `src/lib/__tests__/settings.test.ts` | New keys, `parseMotionPreference`, `parseBoolean` |
| Motion resolver | `src/lib/__tests__/motionPreference.test.ts` | System/full/reduced behavior |
| Icon catalog | `src/components/ui/__tests__/iconCatalog.test.ts` | Every semantic name resolves; one family; filled pairs |
| Haptics | `src/components/ui/__tests__/haptics.test.ts` | Intent mapping, master switch, scrub throttle, web guard |
| Dock geometry | `src/components/ui/__tests__/dockGeometry.test.ts` | Existing invariants unchanged |
| Segmented control | `src/components/ui/card/__tests__/segmented-control.test.ts` | Existing worklet guard still passes |
| Palette contract | `src/theme/__tests__/tokens.test.ts` | Unchanged; no palette edits in this plan |

Do not add render tests for the visual layer; the project deliberately has none. The pure functions and the catalog are the contract.

## 6.2 Risks and mitigations

| Risk | Mitigation |
|---|---|
| MCI glyphs look heavier than Ionicons at the same size | Device check in Task 3; adjust only the sizes that are visibly wrong; the `iconSize` ramp is the escape hatch. |
| A glyph mapping is wrong (`globe` → `web`, `history` → `clock`) | The catalog test proves the glyph exists; the device check proves it reads correctly. Both are cheap to change because the mapping is in one file. |
| Font preload delays the first frame | Hide the splash only after `fontsLoaded` and auth restore; the native splash covers the gap. |
| Dock height animation clips the panel shadow | Keep the shadow on `GlassSurface`; animate only the inner content wrapper with `overflow: hidden`. If the shadow still clips, animate `layout` instead of a fixed height. |
| Removing the ambient loop flattens the visual | The two-blob gradient remains; only the drift stops. If it feels dead, add a one-shot 900 ms settle on mount, never a repeat. |
| Removing the Expo splash overlay exposes a blank frame | The native splash is still configured; hide it in the same effect that waits for fonts/auth. Test a cold start twice. |
| Haptics migration touches many files | It is a mechanical rename (`light→tap`, etc.); `tsc` catches every missed union member. Do it in one commit so a revert is one action. |
| Reduced-motion "Full" override surprises accessibility users | Default is **System**; "Full" is an explicit opt-in. The settings footer says so. |
| `SwapIcon` adds a layer to every `BouncyIconButton` | It renders one glyph when the name is stable; two only during a 120 ms change. No list-row cost for static icons. |
| `History` filled pair changes the dock's meaning | The accessibility label stays "History"; the clock is a conventional history mark. If rejected, use `history` for both and accept the weaker selected swap. |

## 6.3 Acceptance criteria

A listener can tell this is one app, not a parts bin:

- Every icon in the app comes from one family and one optical weight.
- Press feedback is immediate and quiet; nothing bounces for the sake of bouncing.
- The dock never jumps, overlaps, or animates on a tab switch.
- The only thing that moves forever is the playback wave.
- Turning motion off (OS or in-app) actually turns it off.
- Turning haptics off actually turns them off.
- No screen drops frames because a gradient is drifting under a blur.
- `npm run lint`, `npm run typecheck`, and `npm test` pass.

## 6.4 Rollback

Each task is a separate commit. To abandon the overhaul after approval:

- Icons: revert `src/components/ui/icon.tsx` and the lint rule; the semantic names are unchanged, so no screen changes.
- Motion: revert the token/component commit; no data or schema changes.
- Settings: the new keys are additive; reverting the store/service leaves two unused rows in the settings table, which is harmless. `SettingsService.load` ignores unknown keys.

No database migration is required by any task.

---

## Appendix A — Files touched (summary)

**Create**
- `src/lib/motionPreference.ts`
- `src/components/motion/SwapIcon.tsx`
- `src/components/ui/__tests__/iconCatalog.test.ts`
- `src/components/ui/__tests__/haptics.test.ts`
- `src/lib/__tests__/motionPreference.test.ts`
- `docs/MOTION_AND_ICON_PLAN.md` (this file)

**Modify**
- `src/components/ui/icon.tsx`
- `src/components/ui/haptics.ts`
- `src/components/motion/ElasticPressable.tsx`
- `src/components/motion/BouncyIconButton.tsx`
- `src/components/motion/AmbientWash.tsx`
- `src/components/motion/CrossfadeArtwork.tsx`
- `src/components/motion/use-crossfade.ts`
- `src/components/app-dock.tsx`
- `src/components/player/DockPlayer.tsx`
- `src/components/player/MiniPlayerRow.tsx`
- `src/components/player/NowPlayingSheet.tsx`
- `src/components/player/PlayerContent.tsx`
- `src/components/player/TransportControls.tsx`
- `src/components/player/Scrubber.tsx`
- `src/components/annotation-marker.tsx`
- `src/components/annotation-list.tsx`
- `src/components/online/download-progress.tsx`
- `src/components/ui/glass/GlassProgress.tsx`
- `src/components/ui/card/segmented-control.tsx`
- `src/lib/settings.ts`
- `src/services/SettingsService.ts`
- `src/store/settingsStore.ts`
- `src/theme/motion.ts`
- `src/theme/tokens.ts`
- `src/app/_layout.tsx`
- `src/app/settings.tsx`
- `eslint.config.js`
- `AGENTS.md`

**Delete**
- `src/components/animated-icon.tsx`
- `src/components/animated-icon.web.tsx`

**Review / possibly clean up (not required for acceptance)**
- `src/components/ui/collapsible.tsx`
- `src/components/web-badge.tsx`
- `src/components/hint-row.tsx`
- `src/components/app-tabs.web.tsx`

---

## Appendix B — Commands

```bash
cd mobile

# Per-task verification
npm run lint
npm run typecheck
npm test -- <test-file>

# Full suite before claiming completion
npm run lint && npm run typecheck && npm test
```

Do not start `npm start`, `npm run android`, a watcher, or an emulator as part of this plan unless the user asks.
