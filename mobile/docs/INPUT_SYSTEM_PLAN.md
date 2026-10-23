# Input System Overhaul — Phase 0 Audit and Implementation Plan

> **Status:** Approved (D1–D12). WP1–WP12 complete. Automated matrix is green (1227/1227); the Expo Go check passed.
>
> **For agentic workers:** The decisions in section 2 are approved. Each work package is the implementation contract; work in order, one package per commit (and only when the user has explicitly asked for a commit).

**Goal:** Replace the app's ad-hoc text inputs with one field system — a shared shell, one text primitive, and six specialised fields — so every input in Pejvak has the same anatomy, focus treatment, keyboard behaviour, RTL handling, and accessibility, and so notes can finally carry the tags and colour the data model already stores.

**Architecture:** A presentational `FieldShell` owns the label row, the inset track, the focus/error ring, and the message row. `TextField` composes the shell with a single RN `TextInput` and owns focus state, reveal registration, label association, cursor/selection colour, and counter. `TextArea`, `PasswordField`, `SearchField`, `TimeField`, `NumberField`, and `TagInput` are thin wrappers over that primitive; `ColorField` shares the label/spacing language but is a swatch row, not a track. Pure parsing lives in `src/lib` (`time`, `tags`, `color`), so it is testable without rendering. Existing public import paths (`@/components/ui/text-field`, `@/components/ui/search-field`) stay stable.

**Tech Stack:** Expo SDK 57, React Native 0.86.3, React 19.2.3, Reanimated 4.5.1, Jest + React Native Testing Library, `expo-sqlite`, `lib/search.ts`. No new dependencies.

**Spec:** `../AGENTS.md` (root, authoritative), `AGENTS.md` (mobile), `docs/MOTION_AND_ICON_PLAN.md` (the approved visual/motion vocabulary this plan reuses). Where they disagree, the root `AGENTS.md` wins.

## Execution status

| WP | Result |
|---|---|
| 1 — Field tokens + contrast contract | Complete |
| 2 — `FieldShell` + `TextField` | Complete |
| 3 — `TextArea` + `PasswordField` | Complete |
| 4 — `SearchField` on the shared shell | Complete |
| 5 — `TimeField` + timecode parsing | Complete |
| 6 — `NumberField` + `TagInput` + `ColorField` | Complete |
| 7 — Annotation service tags/colour | Complete |
| 8 — Annotation composer | Complete |
| 9 — Sleep timer + jump to time | Complete |
| 10 — Auth migration | Complete |
| 11 — Library / playlists / discover / add-to-playlist | Complete |
| 12 — Dev gallery, docs, full verification | Complete |

---

## Global Constraints

- **Android only.** Every `eas.json` profile and build script is `--platform android`. Expo Go is how this app is tested. `borderCurve: "continuous"` is a no-op; do not spend a build on it.
- **A field is an opaque inset track, never glass.** It is a `Card variant="inset"` (fill `surfaceSunken`), one step below the card it sits in. Glass is for things that float.
- **No hard-coded corners or colours.** Use `radius`, `spacing`, and the semantic palette from `src/theme/tokens.ts`. A new visual decision goes into tokens, not into a screen.
- **Three content tiers, in order:** label (`body`/`title` in `text`), value (`numeric`/`figure` in `textSecondary`), detail (`caption` in `textTertiary`). A field label is `label` in `textSecondary`; the typed value is `body` in `text`; a hint/error is `caption`.
- **Keyboard avoidance is `KeyboardScrollView` / `KeyboardAwareFlatList`.** Never pair with `KeyboardAvoidingView`; never add `react-native-keyboard-controller` (not bundled by Expo Go). No tween on a keyboard event.
- **A `ListHeaderComponent` that holds a `TextInput` must be an element, not an inline component function.**
- **Fold Persian before comparing.** Use `lib/search.ts` (`foldText`, `createSearchIndex`); never write an `includes()` filter over user-visible text. A field with no value reports `null`, not `""`.
- **Offline-first.** Notes write to SQLite first and sync later. Tags and colour already flow through `LocalDBService`, `SyncService`, and the backend `syncLocalData` act; do not add a second path.
- **Integer seconds only.** Time fields store and emit integer seconds; never floats.
- **Strict TypeScript, no `any`.** Derive API types from the backend declarations.
- **React Compiler lint is on.** Focus state is `useState` updated from event handlers, not a ref read during render. Do not write state from an effect.
- **No new dependencies.** Everything here is RN, Reanimated, Jest, and RNTL.
- **Verification commands:** `npm run lint`, `npm run typecheck`, `npm test`. Do not start a dev server, emulator, watcher, or build unless explicitly asked.
- **Commits:** only when the user says `git commit`. Never use `git reset`.
- **Baseline test failures:** `audioInfo.test.ts` (7), `embeddedArtwork.test.ts` (5), and one `audioTags.test.ts` v2.2 case fail on a clean `HEAD` as well. They are in the media-byte parsers and are not caused by this work. Compare against that baseline; do not fix unrelated failures.

---

## Review Focus

These are the five failure modes most likely to reach a listener. Each has a test or a manual check in the owning work package.

1. **A field the listener cannot see they are in.** The current palette's `outline` measures **1.63:1** (light) / **2.00:1** (dark) against the field fill, and `outlineVariant` measures **1.14:1** / **1.20:1**. Any focus treatment that reuses either is invisible. The focus ring must be accent (6.27:1 / 8.13:1) and the resting boundary must be a new `outlineStrong` (3.15:1 / 3.16:1).
2. **The field is visible but the action under it is not.** Playlist rename measures only the input, not the Cancel/Save row; the composer already learned this lesson with `revealTargetRef`. Every field whose completion depends on a control below it must reveal the group.
3. **Password reveal destroys the text or the caret.** Toggling `secureTextEntry` on Android has historically reset the font or the selection. The value must survive, the toggle must be announced, and the field must be tested on a device, not only in Jest.
4. **A screen-reader user hears the placeholder, not the label or the error.** No input in the app currently associates its visible label, and auth's error is one form-level line. RN 0.86 has no `aria-invalid`; expose the error through `accessibilityHint` and a polite live region.
5. **Persian tags and search stop matching because they were compared raw.** The same word can arrive with Arabic yeh/kaf, Persian yeh/kaf, ZWNJ, Arabic-Indic digits, or harakat. Tag de-duplication must use `foldText`; search already does.

---

# 1. Current-state audit

## 1.1 Every input in the app

There are **12 field call sites** across **8 files**. Only two components render a raw `TextInput`: `src/components/ui/text-field.tsx:61` and `src/components/ui/search-field.tsx:64`.

| # | Site | Component | Label | Placeholder | Keyboard / autofill | Submit | Reveal target | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | `src/app/(auth)/login.tsx:61` | `TextField` | Email | `you@example.com` | `email-address`, `autoComplete="email"`, `textContentType="emailAddress"` | `returnKeyType="next"`, no handler | field | Next key does nothing |
| 2 | `src/app/(auth)/login.tsx:72` | `TextField` | Password | `••••••••` | `secureTextEntry`, `autoComplete="current-password"` | `returnKeyType="go"`, submits | field | No reveal |
| 3 | `src/app/(auth)/register.tsx:71` | `TextField` | Username | `listener` | `autoComplete="username"`, `autoCapitalize="none"` | `next`, no handler | field | Next key does nothing |
| 4 | `src/app/(auth)/register.tsx:80` | `TextField` | Display name (optional) | `Your name` | none | `next`, no handler | field | No `autoComplete="name"` |
| 5 | `src/app/(auth)/register.tsx:87` | `TextField` | Email | `you@example.com` | as row 1 | `next`, no handler | field | Next key does nothing |
| 6 | `src/app/(auth)/register.tsx:98` | `TextField` | Password | `••••••••` | `secureTextEntry`, `autoComplete="new-password"` | `go`, submits | field | No reveal |
| 7 | `src/app/(tabs)/playlists.tsx:95` | `TextField` | New playlist | `Name` | default | `done`, creates | field | Row with Create button; `style={{flex:1}}` is applied to the inner input |
| 8 | `src/app/playlist/[id].tsx:98` | `TextField` | Playlist name | none | default | none | field only | Cancel/Save below are not revealed; no submit key |
| 9 | `src/app/(tabs)/discover.tsx:304` | `TextField` | Find a language | `Persian, فارسی…` | `autoCorrect={false}`, `autoCapitalize="none"` | `search`, no handler | field | A search rendered as a form field; `clearButtonMode` is iOS-only |
| 10 | `src/app/player.tsx:239` | `TextField` (`multiline`) | `Note at 12:34` / `Edit at 12:34` | `What stood out here?` | default | none | composer group | No tags, no colour, no counter; `maxHeight: 220`; label doubles as a title |
| 11 | `src/components/add-to-playlist/AddToPlaylistSheet.tsx:341` | `TextField` | New playlist | `Name` | default | `done`, creates | composer group | The correct reveal pattern already exists here |
| 12 | `src/app/(tabs)/index.tsx:433` | `SearchField` | none (a11y `Search your library`) | `Search titles, folders, files…` | `autoCorrect={false}`, `autoCapitalize="none"`, `returnKeyType="search"` | none | container | Pill; hint below; no `onSubmit`; no live region |

Non-text controls that belong to the same surface:

| # | Site | Control | Current behaviour |
|---|---|---|---|
| 13 | `src/app/player.tsx:153-166` | Sleep timer | `Alert.alert` with **5 presets + Cancel = 6 buttons**. Android's `Alert` supports at most 3, so most choices never appear. |
| 14 | `src/app/player.tsx:24,145-149` | Playback speed | A tap cycles through `SPEEDS` (`0.5 … 3`). There is no direct choice and no text entry. |
| 15 | `src/services/AnnotationService.ts:9-17` | Annotation tags/colour | The DB columns, `LocalDBService.updateAnnotation`, `SyncService`, the backend `annotation` model, and `updateAnnotation` act all support `tags` and `color`; the service accepts only `text`, and there is no UI. |
| 16 | `src/app/player.tsx:34` | Position | `parsePositionParam` reads `positionSec` from the route. There is no field to type a time. |

## 1.2 What already works and should be kept

- **Keyboard avoidance is correct and tested.** `keyboardOverlapFor` and `revealTargetY` (`src/components/ui/keyboard-scroll-view.tsx:85,110`) derive the overlap from the keyboard height *and* the viewport shrink; the focused field is re-revealed when the keyboard finishes appearing and when the viewport resizes. `KeyboardScrollView` and `KeyboardAwareFlatList` are the only avoidance in the tree. `keyboard-scroll-view.test.ts` pins the pure parts.
- **A field is already an opaque inset card.** `TextField` uses `Card variant="inset"` (`text-field.tsx:60`), not glass. Keep this.
- **The three tiers are already right.** Label is `type="label"` in `textSecondary`; placeholder is `textTertiary` (4.92:1 light / 5.02:1 dark on the fill); the value is `text`.
- **Search already folds Persian.** `lib/search.ts` (`fold`, `foldText`, `createSearchIndex`, `searchIndex`) handles yeh/kaf/ZWNJ/digits/harakat, and the library screen builds its indexes in `useMemo` per data load, not per keystroke.
- **The composer reveal pattern is correct.** `player.tsx:235-247` measures the whole group (`composerGroupRef`) so Cancel/Save stay visible; `AddToPlaylistSheet.tsx:337-347` does the same.
- **The annotation data path is ready.** `LocalDBService.insertAnnotation` accepts `tags` and `color` (`LocalDBService.ts:901`), `updateAnnotation` updates both (`:1042`), `SyncService` sends both (`SyncService.ts:157-160`), and the backend model defaults `tags` to `[]` and accepts `color` (`../back/models/annotation.ts:9-10`).
- **`ANNOTATION_COLORS` and `pickAnnotationColor` are pure and tested** (`src/lib/annotations.ts:6,27`).

## 1.3 Findings

**F1 (high) — There is no focus indicator.** Neither field tracks focus. The only cue is the platform cursor. The palette's `outline` is 1.63:1 (light) / 2.00:1 (dark) against the field fill, and `outlineVariant` is 1.14:1 / 1.20:1, so a focus style reusing either is still invisible. The fill is only 1.13:1 from `surface`. **A field the listener cannot see they are in.**

**F2 (high) — Labels are not programmatically associated.** `TextField` renders a `ThemedText` above an input with no `nativeID` and no `accessibilityLabelledBy`/`accessibilityLabel`. TalkBack reads the placeholder (or `••••••••` for a password), not the label.

**F3 (high) — Errors are not attached to fields.** Auth renders one form-level line below the form (`login.tsx:84-88`, `register.tsx:110-114`). A field has no invalid state, no error message, no `accessibilityHint`, and no live region.

**F4 (high) — The sleep timer is broken on Android.** `Alert.alert` is given six buttons (`player.tsx:153-166`). Android's `Alert` supports at most three; the rest are dropped. Four of the five durations are unreachable.

**F5 (medium) — "Next" does nothing.** Username, display name, and both email fields declare `returnKeyType="next"` but pass no `onSubmitEditing` and no input ref. The key blurs the field instead of moving to the next one.

**F6 (medium) — A password cannot be revealed.** There is no eye toggle. A typo in a long password means retyping it.

**F7 (medium) — Discover uses a form field for a search.** `TextField` at `discover.tsx:304` carries `clearButtonMode="while-editing"`, which is iOS-only; on Android there is no clear affordance. It is a filter, so it belongs to `SearchField`.

**F8 (medium) — The two field implementations duplicate the shell.** `TextField` and `SearchField` each own label, placeholder, padding, reveal, and font size. A focus ring, error state, or disabled treatment added to one would not reach the other. This is the root cause of the inconsistency.

**F9 (medium) — There is no text-area primitive.** The note composer uses the single-line field with `multiline`. It has no top alignment, no line limits, no counter, and a `maxHeight` applied as an input style. The label is a position string (`Note at 12:34`) doing double duty as a title.

**F10 (medium) — Notes cannot carry tags or colour in the UI.** The columns, service, sync payload, and backend all support them; `AnnotationService` accepts only text. A data-model feature has no way to be set.

**F11 (low) — The cursor and selection use the platform accent.** Neither field sets `selectionColor`/`cursorColor`, so Android draws its own blue/purple in a teal app.

**F12 (low) — Autofill metadata is inconsistent.** Display name has neither `autoComplete="name"` nor `textContentType="name"`. Playlist title fields do not opt out of credential autofill, so Android may offer a saved password for a playlist name.

**F13 (low) — Nothing bounds a paste.** No field sets `maxLength`, and no field shows a counter. A 10,000-character note makes the composer a wall and the annotation list unreadable.

**F14 (low) — Playlist rename reveals only the input.** `playlist/[id].tsx:98-103` passes no `revealTargetRef`, so the Cancel/Save row below can sit under the keyboard. This is the same class of bug the composer comment describes.

**F15 (low) — `style` conflates text style and layout.** Screens pass `flex: 1` and `maxHeight` as `TextField`'s `style`, which is applied to the inner `TextInput`. The shell is the layout box. The new API must separate `containerStyle` (the shell, for `flex`) from `style` (the text).

**F16 (low) — Auth fields stay editable while a request is in flight.** `isSubmitting` disables the button but not the fields, so a second edit can race the request.

**F17 (low) — Search has no submit and no live region.** `SearchField` has no `onSubmit`, so the search key only blurs. The hint/count below the field is not announced when the query changes.

**F18 (low) — RTL is unverified in fields.** The app does not force RTL; rows that show Persian titles set `textAlign: "right"` and `writingDirection: "rtl"`. Fields set neither. Android's natural bidi usually does the right thing, but this must be checked with a Persian keyboard, not assumed.

## 1.4 Measured contrast and the token gap

| Pair | Light | Dark | Threshold | Verdict |
|---|---:|---:|---:|---|
| Field fill (`surfaceSunken`) vs card (`surface`) | 1.13 | 1.13 | visual step | Correct: the field is a subtle inset |
| `outlineVariant` vs field fill | 1.14 | 1.20 | 3:1 | **Fails** |
| `outline` vs field fill | 1.63 | 2.00 | 3:1 | **Fails** |
| `accent` vs field fill | 6.27 | 8.13 | 3:1 | Passes — use for the focus ring |
| `danger` vs field fill | 5.55 | 5.91 | 3:1 | Passes — use for the error ring |
| `textTertiary` vs field fill | 4.92 | 5.02 | 4.5:1 | Passes — placeholder and disabled text |
| Proposed `outlineStrong` vs field fill | **3.15** | **3.16** | 3:1 | Passes — the resting boundary |
| Proposed `outlineStrong` vs card | 3.57 | 3.59 | 3:1 | Passes |

The palette has no token that can draw a visible field boundary. The plan adds exactly one colour (`outlineStrong`) and one token group (`field`). It does **not** add a placeholder or disabled colour: `textTertiary` already clears AA on the fill, and a lighter placeholder would be a contrast regression for no gain.

## 1.5 Out of scope

- A general visual redesign of cards, typography, the dock, or the player.
- Changing the search engine, its ranking, or its index lifecycle.
- A new navigation animation or a new sheet system.
- Reworking playback speed into a picker (see D10 for the sleep timer; speed stays a cycle).
- Persisting an unsent note draft across an app kill. This is a real gap, but it is a session/DB concern, not a field concern; see section 7.
- Backend changes. The annotation model and update act already accept `tags` and `color`.

---

# 2. Decisions requiring approval

| # | Decision | Recommendation | Why |
|---|---|---|---|
| **D1** | Primitive | **Keep React Native `TextInput`.** Do not adopt `@expo/ui`'s Jetpack Compose `TextField`. | One cross-platform API, full control of the inset shell/ring/label, and the existing `useFieldRegistrar` reveal contract. `@expo/ui`'s Android field is Compose-only, carries its own Material styling, and has a separate state model; wrapping it would mean two field systems, not one. |
| **D2** | Resting boundary | **Add `outlineStrong`** (light `#7C8996`, dark `#6B7A87`) and draw the field with a 1px border of it. | It is the only palette value that clears 3:1 against the sunken fill (3.15/3.16). `outline` (1.63/2.00) and `outlineVariant` (1.14/1.20) do not. |
| **D3** | Focus / error ring | **A 2px accent ring on focus, 2px danger on invalid, faded over `duration.toggle` (120 ms) and gated by `useMotionEnabled()`.** Draw it as an absolutely-positioned overlay so nothing shifts. | The fill is too close to the card to signal focus; the ring is the signal. An overlay avoids animating `borderWidth` and avoids a 1px layout jump. |
| **D4** | Labels | **Every form field has a visible label. Search is the one exception** (magnifier + placeholder + `accessibilityLabel`). Never use the placeholder as the label. | A placeholder disappears on the first keystroke, and a screen reader reads it instead of the name. Search is a known affordance, not a form field. |
| **D5** | Password | **Add a reveal toggle** (`eye-outline` / `eye-off-outline`), announced as "Show password" / "Hide password". | Typing a long password blind is the most common avoidable auth failure. |
| **D6** | Focus chain | **Add `inputRef` and `submitBehavior`; chain the auth fields** (username → display name → email → password → submit). | `returnKeyType="next"` currently lies. `submitBehavior="submit"` keeps the keyboard up for Next; `"blurAndSubmit"` for the last field. |
| **D7** | Length limits | **No new hard limits on existing text.** `maxLength`/counter are opt-in. Tags are limited to **10 tags × 24 characters**. | Existing notes and titles can exceed any limit we invent; a hard `maxLength` would silently truncate server data on edit. Tags are new, so a bound is safe and keeps the composer scannable. |
| **D8** | Time entry | **Digits from the right:** the last two digits are seconds, the next two minutes, the rest hours. Raw digits while focused; formatted `m:ss`/`h:mm:ss` on blur. Store integer seconds, clamp to `maxSec`. | A number pad has no colon. `1234` → `12:34`, `90` → `1:30`, `123456` → `1:23:45` is the timecode entry everyone already knows. Formatting on blur avoids caret jumps. |
| **D9** | Note tags/colour | **Yes — add `TagInput` and `ColorField` to the composer** and extend `AnnotationService`. | The DB, sync, and backend already support both; this is the missing UI, not a schema change. |
| **D10** | Sleep timer | **Replace the six-button `Alert` with a sheet:** the five presets as a `SegmentedControl` plus a custom `NumberField` (1–180 min). **Also add a "Jump to time" sheet** using `TimeField` and `seekTo`. | The `Alert` is broken on Android (F4), and `TimeField` otherwise has no home. This is the only new user-facing capability in the plan. |
| **D11** | Playlist create layout | **Keep the row** (field + Create), bottom-aligned, but move `flex: 1` from the input's `style` to the shell's `containerStyle`. | The row already uses `alignItems: "flex-end"`; the only bug is that the flex is on the wrong box. Stacking would waste vertical space for a one-line action. |
| **D12** | Dev gallery | **Add a dev-only `src/app/dev/fields.tsx`** showing every field in every state, both themes, and both motion settings; link it from Settings only under `__DEV__`. | The visual layer has no render tests. The human partner must see the ring, the error, the disabled state, and the RTL result before twelve call sites are migrated. A new route requires regenerating `.expo/types/router.d.ts`; that is a one-off `npx expo start --offline` run, explicitly approved, then stopped. |

**Approval gate:** reply with the decision numbers you accept or change (for example `D1–D12 as recommended`, or `D7: no tag limit`, `D10: sleep timer only`). No code will be written until then.

---

# 3. The field system

## 3.1 Anatomy

```
Label                         Optional        12/120
┌──────────────────────────────────────────────────┐
│ [leading]   typed value                 [trailing]│
└──────────────────────────────────────────────────┘
Hint, or the error that replaces it
```

- **Label row.** `ThemedText type="label"` in `textSecondary`; an optional `Optional` suffix in `caption`/`textTertiary`; an optional counter in `numeric`/`textTertiary` (in `textSecondary` at the limit). The label carries `nativeID`; the input points at it with `accessibilityLabelledBy`.
- **Track.** `Card variant="inset" bordered={false}` with `surfaceSunken`, `radius.md` (`16`), `minHeight` 52 (`48` for search), horizontal padding `spacing.lg`, vertical padding `spacing.md`, and `gap: spacing.md` between leading/input/trailing. The field is a row for single-line inputs and a stretch column for a text area.
- **Ring.** An absolutely-positioned overlay inside the track (section 3.4). The Card's own border is off so the two cannot compete.
- **Message row.** One line of `caption` under the track: the error in `danger` when present, otherwise the hint in `textTertiary`. The error is a polite live region.
- **Text area.** Same track, but `alignItems: "stretch"`, `textAlignVertical="top"`, `minHeight` 96, `maxHeight` 220, and the input scrolls inside after the maximum. The label row and message row are unchanged.

## 3.2 States

| State | Track fill | Ring | Label | Text | Message | Cursor |
|---|---|---|---|---|---|---|
| Rest | `surfaceSunken` | 1px `outlineStrong` | `textSecondary` | `text` | hint `textTertiary` | `accent` |
| Focused | `surfaceSunken` | 2px `accent` | `textSecondary` | `text` | hint `textTertiary` | `accent` |
| Filled | `surfaceSunken` | 1px `outlineStrong` | `textSecondary` | `text` | hint `textTertiary` | `accent` |
| Disabled | `surfaceSunken` | 1px `outlineVariant` | `textTertiary` | `textTertiary` | hint `textTertiary` | none |
| Invalid | `surfaceSunken` | 2px `danger` | `textSecondary` | `text` | error `danger` | `accent` |
| Invalid + focused | `surfaceSunken` | 2px `danger` | `textSecondary` | `text` | error `danger` | `accent` |

Invalid wins over focused for the ring colour; the cursor still shows focus. A disabled field is not focusable (`editable={false}`) and exposes `accessibilityState={{ disabled: true }}`. There is no separate "valid" state: a field is either at rest or invalid.

## 3.3 Tokens

Add to `src/theme/tokens.ts`:

```ts
export const field = {
  /** Single-line track floor. Large font scales grow it; this is not a fixed height. */
  minHeight: 52,
  /** Search is compact: it is a filter, not a form row. */
  searchMinHeight: 48,
  radius: radius.md,
  searchRadius: radius.pill,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  /** The resting boundary. */
  borderWidth: 1,
  /** The focus/error ring. */
  ringWidth: 2,
  labelGap: spacing.sm,
  messageGap: spacing.xs,
  gap: spacing.md,
  textareaMinHeight: 96,
  textareaMaxHeight: 220,
  chipHeight: 28,
  swatch: 36,
  swatchRing: 2,
} as const;
```

Add one semantic colour to `SemanticColors` and both palettes:

```ts
/** A boundary that must clear 3:1 against a sunken field fill. */
outlineStrong: string;
// light: "#7C8996"  (3.15:1 on surfaceSunken, 3.57:1 on surface)
// dark:  "#6B7A87"  (3.16:1 on surfaceSunken, 3.59:1 on surface)
```

No placeholder, disabled, warning, or success colour is added. Placeholder and disabled text use `textTertiary` (4.92/5.02 on the fill); the error uses `danger`; the focus uses `accent`.

`tokens.test.ts` gains assertions, and no existing threshold is weakened:

```ts
it("draws a field boundary you can see against its own fill", () => {
  expect(contrast(c.outlineStrong, c.surfaceSunken)).toBeGreaterThanOrEqual(AA_NON_TEXT);
});
it("keeps the field boundary visible on the card it sits on", () => {
  expect(contrast(c.outlineStrong, c.surface)).toBeGreaterThanOrEqual(AA_NON_TEXT);
});
it("keeps the focus ring and the error ring visible on the fill", () => {
  expect(contrast(c.accent, c.surfaceSunken)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  expect(contrast(c.danger, c.surfaceSunken)).toBeGreaterThanOrEqual(AA_NON_TEXT);
});
it("keeps placeholder and disabled text at AA", () => {
  expect(contrast(c.textTertiary, c.surfaceSunken)).toBeGreaterThanOrEqual(AA_TEXT);
});
it("gives every field a 48pt floor", () => {
  expect(field.minHeight).toBeGreaterThanOrEqual(48);
  expect(field.searchMinHeight).toBeGreaterThanOrEqual(48);
});
it("keeps the ring heavier than the resting border", () => {
  expect(field.ringWidth).toBeGreaterThan(field.borderWidth);
});
```

## 3.4 The focus ring

The ring is **two overlays**, not a changing border:

1. A rest ring: `position: "absolute"`, `inset: 0`, `borderWidth: field.borderWidth`, `borderColor: theme.outlineStrong`, `borderRadius` matching the track.
2. A focus/error ring: the same box with `borderWidth: field.ringWidth`, `borderColor: invalid ? theme.danger : theme.accent`, and an animated `opacity` (`0` at rest, `1` on focus/invalid).

`useMotionEnabled()` decides between `withTiming(target, { duration: duration.toggle })` and assigning `target` directly. The overlays are `pointerEvents="none"` and the track clips them (`overflow: "hidden"`). Nothing animates `borderWidth`, so there is no layout pass per frame and no 1px jump when focus lands.

The ring is inside the track's radius. For a pill search field the radius is `radii.pill`; for a text area it is `radii.md`.

## 3.5 Text, RTL, and Persian

- **Type.** `fontSize: typeScale.body.fontSize` (16), `lineHeight: typeScale.body.lineHeight` (23), `fontWeight: "500"` to match `ThemedText` body. The value is `text`; the placeholder is `textTertiary`.
- **Direction.** Do **not** force `textAlign` or `writingDirection` on prose fields. Android's bidi resolves a Persian value naturally; the app's shell is LTR and a forced right alignment would look wrong for a Latin playlist name. Time and number fields are explicitly `textAlign: "left"` because their content is a timecode or an integer, not prose.
- **Autocapitalise.** `none` for email, username, password, search, and tags; `words` for display name; `sentences` for playlist titles and notes.
- **Autocorrect/spellcheck.** Off for email, username, password, search, and tags; on for prose.
- **Autofill.** Credential fields set `autoComplete` (`email`, `username`, `current-password`, `new-password`) and `importantForAutofill="yes"`. Non-credential fields set `autoComplete="off"` and `importantForAutofill="no"` so Android does not offer a saved password for a playlist name.
- **Cursor and selection.** `selectionColor={theme.accent}`, `cursorColor={theme.accent}`, `underlineColorAndroid="transparent"`.
- **Font padding.** Leave `includeFontPadding` at its default. Disabling it clips Persian descenders; the line height already gives the text room.
- **Placeholder.** Never the only label. For search it is the affordance, backed by `accessibilityLabel`.

## 3.6 Keyboard and focus chaining

- Fields inside a scrollable get their registrar from `KeyboardScrollView` or `KeyboardAwareFlatList`. `FieldShell` measures the **whole field** (label + track + message) by default, because a label or error left under the keyboard is just as unusable as the input.
- A composer or a field whose action row is part of the same task passes `revealTargetRef` for the **group** (field + actions), as the player composer and add-to-playlist sheet already do.
- `inputRef` is an explicit prop (React 19 allows `ref` as a prop, but an explicit name keeps the two refs — input and reveal target — unambiguous).
- `submitBehavior="submit"` keeps the keyboard open and fires `onSubmitEditing` for a Next field; `"blurAndSubmit"` dismisses it for the last field.
- Tag entry uses `submitBehavior="submit"`; `onSubmitEditing` adds the tag, clears the draft, and keeps focus.
- No `KeyboardAvoidingView`; no `react-native-keyboard-controller`.

## 3.7 Accessibility

- **Label association.** `const labelId = useId()`; the label `ThemedText` gets `nativeID={labelId}`; the input gets `accessibilityLabelledBy={labelId}`. The app is Android-only, so this is reliable. `SearchField` has no visible label and sets `accessibilityLabel` instead.
- **Errors.** RN 0.86 has no `aria-invalid`. Set `accessibilityHint={error ?? hint ?? undefined}` on the input, and put `accessibilityLiveRegion="polite"` on the error `ThemedText` so it is announced when it appears.
- **Disabled.** `accessibilityState={{ disabled }}` and `editable={false}`.
- **Password.** The toggle is a button labelled "Show password"/"Hide password"; it does not change the field's own label.
- **Tags.** Each chip's remove control is labelled `Remove tag <tag>`.
- **Colour.** Each swatch is `accessibilityRole="radio"` with `accessibilityState={{ checked }}` and a human name from `ANNOTATION_COLOR_NAMES` ("Blue", "Red", "Green", "Amber", "Purple", "Teal").
- **Search.** The hint/count below the field gets `accessibilityLiveRegion="polite"` so a query's result count is announced.
- **Touch targets.** Trailing controls keep a 44pt target via `hitSlop`, but the hit area must not overlap the input's text; the shell's `paddingRight` and a smaller horizontal hit slop are set deliberately.

## 3.8 Component APIs

### `FieldShell`

`src/components/ui/field/field-shell.tsx`

```ts
export type FieldShellProps = {
  children: ReactNode;
  /** Omit only for SearchField, which has no visible label. */
  label?: string;
  hint?: string | null;
  error?: string | null;
  counter?: { value: number; max: number } | null;
  optional?: boolean;
  disabled?: boolean;
  focused?: boolean;
  invalid?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Pill track for search; rounded track for form fields. */
  pill?: boolean;
  /** The nativeID drawn on the label; the input points at it with accessibilityLabelledBy. */
  labelId?: string;
  /** The shell is the layout box: put flex/width here. */
  containerStyle?: StyleProp<ViewStyle>;
  /** The track itself, for a text area's stretch layout. */
  shellStyle?: StyleProp<ViewStyle>;
};
```

Responsibilities: label row, track, ring, leading/trailing layout, message row, disabled/invalid styling. It does not own focus state; the field does.

### `useFieldFocus`

`src/components/ui/field/use-field-focus.ts`

```ts
export function useFieldFocus(options: {
  containerRef: RefObject<View | null>;
  onFocus?: TextInputProps["onFocus"];
  onBlur?: TextInputProps["onBlur"];
  revealTargetRef?: RefObject<View | null>;
}): {
  focused: boolean;
  handleFocus: NonNullable<TextInputProps["onFocus"]>;
  handleBlur: NonNullable<TextInputProps["onBlur"]>;
};
```

It sets focus state (for the ring), calls the registrar's `reveal` with `revealTargetRef?.current ?? containerRef.current`, and forwards the caller's handlers. `containerRef` is passed in by `TextField` so the shell is measurable (`collapsable={false}`).

### `TextField`

`src/components/ui/text-field.tsx` (public path stays)

```ts
export type TextFieldProps = Omit<
  TextInputProps,
  "style" | "placeholderTextColor" | "underlineColorAndroid"
> & {
  /** Required for form fields; optional only because SearchField wraps this. */
  label?: string;
  /** Text style. Layout belongs in containerStyle. */
  style?: TextInputProps["style"];
  containerStyle?: StyleProp<ViewStyle>;
  hint?: string | null;
  error?: string | null;
  optional?: boolean;
  /** Shown only when maxLength is set and showCounter is not false. */
  showCounter?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  pill?: boolean;
  /** Text area defaults; TextArea sets these. */
  minLines?: number;
  maxLines?: number;
  revealTargetRef?: RefObject<View | null>;
  inputRef?: Ref<TextInput>;
};
```

- `disabled = rest.editable === false`.
- `invalid = error != null`.
- Counter value is `value?.length ?? 0`; counters require a controlled value.
- `onFocus`/`onBlur` are merged through `useFieldFocus`.
- `label` is `undefined` only for search; a development-time warning fires when a non-pill field omits it.
- `multiline` switches the shell to stretch, sets `textAlignVertical="top"`, and applies the min/max line heights.

### `TextArea`

`src/components/ui/field/text-area.tsx`

```ts
export type TextAreaProps = Omit<
  TextFieldProps,
  "multiline" | "minLines" | "maxLines"
> & {
  minLines?: number; // default 3
  maxLines?: number; // default 8
};
```

Defaults: `multiline`, `minLines={3}`, `maxLines={8}`, `textAlignVertical="top"`, `scrollEnabled` true beyond the max height. No hard `maxLength` unless the caller passes one.

### `PasswordField`

`src/components/ui/field/password-field.tsx`

```ts
export type PasswordFieldProps = Omit<TextFieldProps, "secureTextEntry" | "trailing"> & {
  /** Defaults to autoComplete="current-password"; register passes "new-password". */
  autoComplete?: TextInputProps["autoComplete"];
};
```

Adds `eye-outline` / `eye-off-outline` to `ICON_GLYPHS`. The toggle preserves the value; the component test asserts `secureTextEntry` flips and the value is unchanged. Device test: toggle mid-word and confirm the caret does not jump to the start or the text does not disappear.

### `SearchField`

`src/components/ui/search-field.tsx` (public path stays)

```ts
export type SearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  hint?: string | null;
  autoFocus?: boolean;
  accessibilityLabel?: string;
  onSubmit?: (value: string) => void;
  inputRef?: Ref<TextInput>;
};
```

A thin wrapper over `TextField` with `pill`, no label, a leading `search` icon that switches from `textTertiary` to `text` when the field holds something, and a trailing clear `BouncyIconButton` that only exists when the value is non-empty. `returnKeyType="search"`, `inputMode="search"`, `autoCorrect={false}`, `autoCapitalize="none"`, `submitBehavior="blurAndSubmit"`.

### `TimeField`

`src/components/ui/field/time-field.tsx`

```ts
export type TimeFieldProps = {
  label: string;
  valueSec: number;
  onChangeSec: (seconds: number) => void;
  maxSec?: number;
  hint?: string | null;
  error?: string | null;
  autoFocus?: boolean;
  inputRef?: Ref<TextInput>;
};
```

Pure helpers in `src/lib/time.ts`:

```ts
/** Last two digits are seconds, next two minutes, the rest hours. */
export function digitsToSeconds(digits: string): number;
export function clampSeconds(value: number, maxSec?: number): number;
```

Behaviour: `keyboardType="number-pad"`, `inputMode="numeric"`, `maxLength={6}`, `textAlign="left"`, tabular figures. While focused the draft is the raw digits, and `onChangeSec(clamped)` fires on every valid change so a Go button never reads a stale value. On blur/submit the display is reformatted to `formatClock(clamped)`. An external `valueSec` change updates the display only when the field is not focused. The hint reads "Type digits: 1234 becomes 12:34".

### `NumberField`

`src/components/ui/field/number-field.tsx`

```ts
export type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number; // default 1
  unit?: string;
  hint?: string | null;
  disabled?: boolean;
};
```

A `TextField` with `textAlign="center"`, `inputMode="numeric"`, a leading minus `BouncyIconButton` and a trailing plus. Buttons disable at the bounds. Empty input reverts to the current value on blur; values are clamped with `clampInteger`. The unit is rendered in the label row or the hint, not inside the input.

### `TagInput`

`src/components/ui/field/tag-input.tsx`

```ts
export type TagInputProps = {
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  maxTags?: number;   // default 10
  maxLength?: number; // per tag, default 24
  hint?: string | null;
  disabled?: boolean;
};
```

Pure helpers in `src/lib/tags.ts`:

```ts
export type AddTagResult =
  | { tags: string[]; added: true }
  | { tags: string[]; added: false; reason: "empty" | "duplicate" | "limit" | "too-long" };

export function addTag(
  tags: readonly string[],
  draft: string,
  limits?: { maxTags?: number; maxLength?: number },
): AddTagResult;

export function removeTag(tags: readonly string[], index: number): string[];
```

`addTag` trims and collapses internal whitespace, rejects empty, rejects over-length, rejects duplicates by `foldText` (Persian yeh/kaf/ZWNJ/digits/harakat), and enforces the tag count. The shell is set to `flexDirection: "row"`, `flexWrap: "wrap"`, `alignItems: "center"`; the inline input has `flexGrow: 1` and `minWidth: 80`. The input commits on Enter/comma, not on space (multi-word tags are valid). Backspace on an empty draft removes the last chip. At `maxTags` the input is disabled and the hint says "Up to 10 tags". Chips are `TagChip` (a value, not a filter): `surface` fill, `outlineVariant` border, `text` text, a `close` control with `textTertiary`.

### `ColorField`

`src/components/ui/field/color-field.tsx`

```ts
export type ColorFieldProps = {
  label?: string; // default "Colour"
  value: string | null;
  onChange: (color: string) => void;
  disabled?: boolean;
};
```

A label row using the same `label` tier and `spacing.sm` gap as `FieldShell`, plus a row of six swatches from `ANNOTATION_COLORS`, each 36pt with a 2pt ring when selected and a `check` in the readable foreground. Pure helper in `src/lib/color.ts`:

```ts
export function readableOn(hex: string): "#000000" | "#FFFFFF";
```

Add `ANNOTATION_COLOR_NAMES` to `src/lib/annotations.ts` for the accessibility labels.

### What is deliberately not a component

- **No `FieldGroup`.** The screens already control their own vertical rhythm with `gap`; a group that clones children or injects refs is more fragile than the four lines it would save.
- **No `Form` abstraction.** Validation is screen-specific; the field exposes `error` and the screen decides when to set it.
- **No raw `TextInput` outside `src/components/ui/text-field.tsx`, `src/components/ui/search-field.tsx`, and `src/components/ui/field/`.** After WP12 those are the only field implementation sites, and the lint guard can be extended to reject raw `TextInput` elsewhere.

## 3.9 File responsibilities

```
src/components/ui/
  text-field.tsx              # public TextField (implementation stays here)
  search-field.tsx            # public SearchField (thin wrapper)
  field/
    field-shell.tsx           # label + track + ring + message
    use-field-focus.ts        # focus state + reveal + handler merging
    text-area.tsx
    password-field.tsx
    time-field.tsx
    number-field.tsx
    tag-input.tsx
    color-field.tsx
    index.ts                  # re-exports the specialised fields
src/lib/
  time.ts                     # digitsToSeconds, clampSeconds (plus existing formatClock)
  tags.ts                     # addTag, removeTag
  color.ts                    # readableOn
  annotations.ts              # ANNOTATION_COLORS, ANNOTATION_COLOR_NAMES, pickAnnotationColor
```

`src/components/ui/text-field.tsx` and `search-field.tsx` stay where they are so the eight existing import sites do not churn. The new files are additive.

---

# 4. Screen-by-screen migration

## 4.1 Auth (`login.tsx`, `register.tsx`)

- Replace the password `TextField` with `PasswordField` (`autoComplete="current-password"` on login, `"new-password"` on register).
- Add `inputRef`s and chain: username → display name → email → password → submit. Use `submitBehavior="submit"` on the Next fields and `"blurAndSubmit"` on the password.
- Email: `inputMode="email"`, `keyboardType="email-address"`, `autoComplete="email"`, `textContentType="emailAddress"`, `autoCapitalize="none"`, `autoCorrect={false}`, `spellCheck={false}`.
- Username: `autoComplete="username"`, `autoCapitalize="none"`, `autoCorrect={false}`, `spellCheck={false}`.
- Display name: `autoComplete="name"`, `textContentType="name"`, `autoCapitalize="words"`.
- `editable={!isSubmitting}` on every field; the form-level error stays (the backend message is not field-specific).
- The footer/Link and the `KeyboardScrollView` layout stay unchanged.

## 4.2 Library search (`(tabs)/index.tsx`)

- Keep `SearchField` and the element-not-function header rule.
- Add `onSubmit` (blur only; the results are already live) and `inputRef` if the screen ever needs to focus it.
- The hint/count becomes a polite live region.
- No folding change: the indexes stay in `useMemo` keyed on the data.

## 4.3 Discover (`(tabs)/discover.tsx`)

- Replace the `TextField` at line 304 with `SearchField` (`placeholder="Persian, فارسی…"`, `accessibilityLabel="Find a language"`).
- Remove `clearButtonMode` (iOS-only) and the `TextField` import.
- The `GlassChip` row stays; it is a filter, which is the correct use of a chip.

## 4.4 Playlists (`(tabs)/playlists.tsx`)

- Keep the field + Create row with `alignItems: "flex-end"`.
- Move `flex: 1` from the field's `style` to `containerStyle` (D11).
- Add `autoComplete="off"`, `importantForAutofill="no"`, `returnKeyType="done"`, `submitBehavior="submit"` (create without dismissing the keyboard), and clear the draft after a successful create.
- The create action is already a `PrimaryButton` outside the field; the field's reveal covers the label and the input, and the button is on the same row, so it is visible when the field is.

## 4.5 Playlist detail (`playlist/[id].tsx`)

- Wrap the rename block's `TextField` and the Cancel/Save row in a measured group and pass `revealTargetRef` (F14).
- Add `returnKeyType="done"`, `submitBehavior="blurAndSubmit"`, `onSubmitEditing` = save when non-empty.
- `autoFocus` stays; `selectTextOnFocus` is added so a rename can be typed over immediately (decision inside the WP; no new API).
- `autoComplete="off"`, `importantForAutofill="no"`.

## 4.6 Add to playlist (`AddToPlaylistSheet.tsx`)

- Keep the group reveal pattern; switch to the new `TextField` API (`containerStyle` for the composer's flex/width, `style` for text).
- Add `autoComplete="off"`, `importantForAutofill="no"`.
- The Cancel/Create row stays inside the measured group.

## 4.7 Player note composer (`player.tsx` + new `AnnotationComposer.tsx`)

- Extract the composer from the route into `src/components/player/AnnotationComposer.tsx`; the route keeps `composerOpen`, `editingId`, `selectedId` and the `create/update/remove` calls.
- The composer owns `text`, `tags`, and `color`. It renders:
  - a `TextArea` labelled `Note at 12:34` / `Edit note at 12:34` (the position is a label, not a title),
  - `TagInput` (max 10 × 24),
  - `ColorField` initialized with `pickAnnotationColor(existing.length)` on create and the annotation's `color` on edit,
  - Cancel / Save actions.
- The measured group includes the text area, tags, colour, and actions; `revealTargetRef` is passed to the `TextArea`.
- Save is disabled while the trimmed text is empty. Tags and colour are optional.
- Extend `AnnotationService`:
  - `CreateAnnotationArgs` gains `tags?: string[]`, `color?: string | null`; pass them to `insertAnnotation`.
  - `UpdateAnnotationArgs` gains `tags?: string[]`, `color?: string | null`; pass them to `updateAnnotation`.
  - `useTrackAnnotations` types flow through unchanged.
- Sync needs no change: `SyncService` already sends both fields and the backend update act accepts both.

## 4.8 Sleep timer and jump to time (`player.tsx`)

- Replace `Alert.alert` with `SleepTimerSheet`:
  - five presets (`SLEEP_TIMER_CHOICES`) as a `SegmentedControl` (single choice),
  - a `NumberField` for a custom 1–180 minutes,
  - Start / Cancel; Start calls `sleep.start(minutes)`; Cancel calls `sleep.cancel()` when a timer is active.
  - The trigger button keeps showing `formatRemaining(sleep.remainingMs)` when active.
- Add `JumpToTimeSheet` (D10): a `TimeField` with `maxSec={durationSec}`, a Go button that calls `TrackPlayerService.seekTo(seconds)` and closes. The sheet is opened from the player's timeline area (a small "Go to time" control beside the note chip) and is not a replacement for the scrubber.
- Both sheets are `GlassSheet`s inside `PlayerContent`'s existing `KeyboardScrollView` (they float, so glass is correct), and both reveal their action rows.

## 4.9 Settings (`settings.tsx`)

- No text inputs today.
- Under `__DEV__` only, add a "Field gallery" row that pushes `/dev/fields`. It is removed from production builds by the `__DEV__` guard (the route itself remains but is unreachable; see WP12).

---

# 5. Work packages

Each WP ends with `npm run typecheck` and `npm run lint`. Run tests with `npm test -- <path>`. Commit only when the user has asked for commits; the commit step is shown for completeness.

### WP1 — Field tokens and contrast contract

**Files:** Modify `src/theme/tokens.ts`, `src/theme/__tests__/tokens.test.ts`.

**Interfaces produced:** `field` token group; `SemanticColors.outlineStrong`.

- [ ] **Step 1: Write the failing tests** in `tokens.test.ts` using the six assertions in section 3.3. Use the existing `contrast`, `AA_TEXT`, and `AA_NON_TEXT` helpers.
- [ ] **Step 2: Run** `npm test -- src/theme/__tests__/tokens.test.ts`; expect failures for `outlineStrong` and `field`.
- [ ] **Step 3: Implement** `outlineStrong` in both palettes and the `field` group exactly as specified.
- [ ] **Step 4: Run** the same command; expect pass.
- [ ] **Step 5: Run** `npm run typecheck && npm run lint`.
- [ ] **Step 6: Commit** (only if asked): `git add src/theme/tokens.ts src/theme/__tests__/tokens.test.ts && git commit -m "feat(theme): add field tokens and a 3:1 field boundary"`.

**Exit criteria:** tokens tests pass; no existing threshold changed; `field.minHeight >= 48`.

### WP2 — `FieldShell` + `TextField`

**Files:** Create `src/components/ui/field/field-shell.tsx`, `src/components/ui/field/use-field-focus.ts`, `src/components/ui/field/index.ts`; modify `src/components/ui/text-field.tsx`; create `src/components/ui/__tests__/text-field.test.tsx`.

**Interfaces consumed:** `field` tokens, `outlineStrong`, `useMotionEnabled`, `duration.toggle`, `useFieldRegistrar`.

**Interfaces produced:** `FieldShell`, `useFieldFocus`, the `TextFieldProps` in section 3.8. The existing `label`, `style`, and `revealTargetRef` props keep their meaning.

- [ ] **Step 1: Write failing tests:**
  - renders the label and links it (`nativeID` on the label, `accessibilityLabelledBy` on the input);
  - renders a hint; renders an error instead of the hint and marks it as a polite live region;
  - renders `12/120` when `maxLength={120}` and `value.length === 12`;
  - `onFocus` calls the registrar's `reveal` with the shell node; `onBlur` clears the focused state;
  - `editable={false}` exposes `accessibilityState.disabled` and `accessibilityHint`;
  - a caller's `onFocus`/`onBlur` still fire.
- [ ] **Step 2: Run** `npm test -- src/components/ui/__tests__/text-field.test.tsx`; expect failures.
- [ ] **Step 3: Implement** `FieldShell` (label row, track, two ring overlays, leading/input/trailing, message row), `useFieldFocus`, and the `TextField` rewrite. Keep the public import path.
- [ ] **Step 4: Run** the test; expect pass.
- [ ] **Step 5: Run** `npm run typecheck && npm run lint` and confirm every existing call site still compiles.
- [ ] **Step 6: Commit** (only if asked).

**Exit criteria:** `TextField` renders the same visible field as before plus the ring; existing call sites compile unchanged; the tests above pass.

### WP3 — `TextArea` + `PasswordField`

**Files:** Create `src/components/ui/field/text-area.tsx`, `src/components/ui/field/password-field.tsx`; modify `src/components/ui/icon.tsx`; create `src/components/ui/__tests__/password-field.test.tsx`, `src/components/ui/__tests__/text-area.test.tsx`.

**Interfaces consumed:** `TextField`, `ICON_GLYPHS`.

- [ ] **Step 1: Add `eye: "eye-outline"` and `eyeOff: "eye-off-outline"`** to `ICON_GLYPHS`; `iconCatalog.test.ts` pins them.
- [ ] **Step 2: Write failing tests:**
  - `TextArea` renders `multiline`, `textAlignVertical="top"`, and the min/max height from `minLines`/`maxLines`;
  - `PasswordField` starts with `secureTextEntry`, toggling flips it, the value is unchanged, and the toggle's label changes between "Show password" and "Hide password".
- [ ] **Step 3: Run** the two test files; expect failures.
- [ ] **Step 4: Implement** both wrappers.
- [ ] **Step 5: Run** the tests; expect pass. Run typecheck and lint.
- [ ] **Step 6: Manual device check:** toggle the password mid-word; confirm the value and caret survive.
- [ ] **Step 7: Commit** (only if asked).

**Exit criteria:** both components tested; the eye glyphs are in the catalog; the manual password toggle behaves.

### WP4 — `SearchField` on the shared shell

**Files:** Modify `src/components/ui/search-field.tsx`; create `src/components/ui/__tests__/search-field.test.tsx`.

**Interfaces consumed:** `TextField`, `FieldShell` (through `TextField`), `BouncyIconButton`, `Icon`.

- [ ] **Step 1: Write failing tests:**
  - the clear control is absent when `value` is empty and present when it is not;
  - pressing clear calls `onChangeText("")`;
  - the hint renders and is a polite live region;
  - `accessibilityLabel` is on the input;
  - `onSubmit` fires with the current value;
  - `returnKeyType="search"`.
- [ ] **Step 2: Run** `npm test -- src/components/ui/__tests__/search-field.test.tsx`; expect failures.
- [ ] **Step 3: Implement** the wrapper with `pill`, leading search icon, trailing clear, no visible label.
- [ ] **Step 4: Run** the test; expect pass. Run typecheck and lint.
- [ ] **Step 5: Commit** (only if asked).

**Exit criteria:** the library search looks the same (pill, magnifier, clear) and the new accessibility/submit behaviour is tested.

### WP5 — `TimeField` + timecode parsing

**Files:** Modify `src/lib/time.ts`, `src/lib/__tests__/time.test.ts`; create `src/components/ui/field/time-field.tsx`, `src/components/ui/__tests__/time-field.test.tsx`.

**Interfaces produced:** `digitsToSeconds`, `clampSeconds`, `TimeFieldProps`.

- [ ] **Step 1: Write failing pure tests:** `""` → 0; `"5"` → 5; `"90"` → 90; `"1234"` → 754; `"123456"` → 45296; `"000090"` → 90; non-digits are stripped; `clampSeconds(500, 300)` → 300; `clampSeconds(0, 300)` → 0.
- [ ] **Step 2: Write failing component tests:** typing digits shows raw digits while focused; each valid change calls `onChangeSec` with the clamped integer; blur formats to `m:ss`/`h:mm:ss`; an external `valueSec` change updates the formatted text when not focused.
- [ ] **Step 3: Run** both test files; expect failures.
- [ ] **Step 4: Implement** the helpers and the component.
- [ ] **Step 5: Run** the tests; expect pass. Run typecheck and lint.
- [ ] **Step 6: Commit** (only if asked).

**Exit criteria:** every timecode case in the tests passes; no float ever leaves the field.

### WP6 — `NumberField` + `TagInput` + `ColorField`

**Files:** Create `src/lib/tags.ts`, `src/lib/__tests__/tags.test.ts`, `src/lib/color.ts`, `src/lib/__tests__/color.test.ts`, `src/components/ui/field/number-field.tsx`, `tag-input.tsx`, `color-field.tsx`, and their tests.

**Interfaces produced:** `addTag`, `removeTag`, `readableOn`, `NumberFieldProps`, `TagInputProps`, `ColorFieldProps`.

- [ ] **Step 1: Write failing pure tests:**
  - `addTag([], "  ")` → `{ added: false, reason: "empty" }`;
  - `addTag([], "Persian  history")` → one tag `"Persian history"`;
  - duplicate by Persian fold: `"كتاب"` vs `"کتاب"` → `duplicate`; `"می‌رود"` vs `"میرود"` → `duplicate`; Arabic-Indic `"۱۲۳"` vs `"123"` → `duplicate`;
  - 10 tags → `limit`; 25 characters → `too-long`;
  - `removeTag` removes only the requested index;
  - `ANNOTATION_COLOR_NAMES` has exactly one name per `ANNOTATION_COLORS` entry;
  - `readableOn` returns black for `#F5A623` and white for `#8E4EC6`, and is defined for every `ANNOTATION_COLORS` entry.
- [ ] **Step 2: Write failing component tests:** NumberField steps/clamps and disables at bounds; TagInput commits on submit, removes on backspace, dedupes, and disables at 10; ColorField exposes six radios and reports the selected colour.
- [ ] **Step 3: Run** the tests; expect failures.
- [ ] **Step 4: Implement** the helpers and components.
- [ ] **Step 5: Run** the tests; expect pass. Run typecheck and lint.
- [ ] **Step 6: Commit** (only if asked).

**Exit criteria:** Persian de-duplication is pinned by tests; the tag limit and colour contrast are pinned.

### WP7 — Annotation service tags/colour

**Files:** Modify `src/services/AnnotationService.ts`; create or extend `src/services/__tests__/AnnotationService.test.ts`.

**Interfaces produced:** `CreateAnnotationArgs` and `UpdateAnnotationArgs` gain `tags?: string[]` and `color?: string | null`.

- [ ] **Step 1: Write failing tests:** create with `tags: ["chapter"]` and `color: "#208AEF"` passes both to `LocalDBService.insertAnnotation`; update passes both to `LocalDBService.updateAnnotation`; `syncPending` is called after each; omitted tags/colour keep the current defaults.
- [ ] **Step 2: Run** the service test; expect failures.
- [ ] **Step 3: Implement** the pass-through. Do not add a second sync path.
- [ ] **Step 4: Run** the test; expect pass. Run typecheck and lint.
- [ ] **Step 5: Commit** (only if asked).

**Exit criteria:** tags/colour reach SQLite and the existing sync queue unchanged.

### WP8 — Annotation composer

**Files:** Create `src/components/player/AnnotationComposer.tsx`, `src/components/player/__tests__/annotation-composer.test.tsx`; modify `src/app/player.tsx`.

**Interfaces consumed:** `TextArea`, `TagInput`, `ColorField`, `PrimaryButton`, `GlassSheet`, `AnnotationService` types.

**Interfaces produced:** `AnnotationComposerProps`:

```ts
type AnnotationComposerProps = {
  positionSec: number;
  annotation: LocalAnnotation | null;
  creating: boolean;
  onCancel: () => void;
  onSave: (input: { text: string; tags: string[]; color: string }) => Promise<boolean>;
};
```

- [ ] **Step 1: Write failing tests:** Save is disabled while the trimmed text is empty; a create starts with `pickAnnotationColor(existing.length)`; editing pre-fills text/tags/colour; save passes all three; Cancel does not save.
- [ ] **Step 2: Run** the composer test; expect failures.
- [ ] **Step 3: Implement** the composer and move the draft state out of the route. Keep the route's `create/update/remove` calls and the selected-note sheet.
- [ ] **Step 4: Run** the test; expect pass. Run typecheck and lint.
- [ ] **Step 5: Manual device check:** open the composer, type a Persian note, add two tags, pick a colour, save; confirm the note and its markers appear and the keyboard reveals the action row.
- [ ] **Step 6: Commit** (only if asked).

**Exit criteria:** notes can carry tags and colour; the route is thinner; the composer group is revealed.

### WP9 — Sleep timer + jump to time

**Files:** Create `src/components/player/SleepTimerSheet.tsx`, `src/components/player/JumpToTimeSheet.tsx`, tests; modify `src/app/player.tsx`, `src/components/player/PlayerContent.tsx`.

**Interfaces consumed:** `SLEEP_TIMER_CHOICES`, `SegmentedControl`, `NumberField`, `TimeField`, `GlassSheet`, `TrackPlayerService.seekTo`.

- [ ] **Step 1: Write failing tests:** selecting a preset calls `sleep.start(15)`; a custom 20 calls `sleep.start(20)`; Cancel calls `sleep.cancel()` only when active; JumpToTime clamps to `durationSec` and calls `seekTo`.
- [ ] **Step 2: Run** the tests; expect failures.
- [ ] **Step 3: Implement** both sheets and replace the `Alert.alert` path.
- [ ] **Step 4: Run** the tests; expect pass. Run typecheck and lint.
- [ ] **Step 5: Manual device check:** the five presets are all reachable on Android; a custom duration starts and the button counts down; JumpToTime seeks and closes.
- [ ] **Step 6: Commit** (only if asked).

**Exit criteria:** no `Alert.alert` remains for the sleep timer; every preset is reachable on Android.

### WP10 — Auth migration

**Files:** Modify `src/app/(auth)/login.tsx`, `src/app/(auth)/register.tsx`; create `src/app/(auth)/__tests__/login.test.tsx` and `register.test.tsx` if the existing store can be mocked cleanly.

**Interfaces consumed:** `PasswordField`, `inputRef`, `submitBehavior`.

- [ ] **Step 1: Write failing tests:** the password input is a `PasswordField` (reveal control present); the last field's `submitBehavior` is `blurAndSubmit`; submitting calls the store's `login`/`register` with the trimmed values; fields are `editable={false}` while `isSubmitting`.
- [ ] **Step 2: Run** the tests; expect failures.
- [ ] **Step 3: Implement** the focus chain and autofill metadata.
- [ ] **Step 4: Run** the tests; expect pass. Run typecheck and lint.
- [ ] **Step 5: Manual device check:** Next moves through the form; the last Go submits; the password reveal works; autofill fills email/password.
- [ ] **Step 6: Commit** (only if asked).

**Exit criteria:** the auth form is fully keyboard-navigable and the reveal works.

### WP11 — Library / playlists / discover / add-to-playlist

**Files:** Modify `src/app/(tabs)/index.tsx`, `src/app/(tabs)/playlists.tsx`, `src/app/(tabs)/discover.tsx`, `src/app/playlist/[id].tsx`, `src/components/add-to-playlist/AddToPlaylistSheet.tsx`.

- [ ] **Step 1: Discover** — replace the `TextField` with `SearchField`; remove `clearButtonMode`; confirm the chip row is unchanged.
- [ ] **Step 2: Playlists** — move `flex: 1` to `containerStyle`; add `autoComplete="off"`, `importantForAutofill="no"`, `submitBehavior="submit"`; clear the draft after create.
- [ ] **Step 3: Playlist detail** — measure the rename group; pass `revealTargetRef`; add `returnKeyType="done"`, `submitBehavior="blurAndSubmit"`, save-on-submit.
- [ ] **Step 4: Add to playlist** — switch to the new API; keep the group reveal; add autofill opt-out.
- [ ] **Step 5: Library search** — add the polite live region and `onSubmit`; confirm the header is still an element.
- [ ] **Step 6: Run** `npm run typecheck && npm run lint`.
- [ ] **Step 7: Manual device check:** the playlist rename Save is visible with the keyboard up; the create row aligns; Discover has a working clear button; the library header does not remount on the first keystroke.
- [ ] **Step 8: Commit** (only if asked).

**Exit criteria:** no screen renders a raw `TextInput`; the five call sites use the new API; the rename/composer reveals include their actions.

### WP12 — Dev gallery, docs, full verification

**Files:** Create `src/app/dev/fields.tsx`; modify `src/app/settings.tsx` (dev-only row), `AGENTS.md`, this document; regenerate `.expo/types/router.d.ts`.

- [ ] **Step 1: Build the gallery** with every field in every state (rest, focused, filled, disabled, invalid, text area, password revealed, time, number, tags, colour) in both themes, plus a motion toggle.
- [ ] **Step 2: Add the `__DEV__` Settings row** that pushes `/dev/fields`.
- [ ] **Step 3: Regenerate the router types.** Ask the human partner to run `npx expo start --offline`, wait for `.expo/types/router.d.ts` to include `/dev/fields`, then stop it. Do not leave a server running. If the human prefers, skip the route and use an existing dev-only screen instead; the gallery is a review aid, not a product feature.
- [ ] **Step 4: Update `AGENTS.md`** with the field rules: one system, no raw `TextInput` outside the three implementation sites, visible label except search, `outlineStrong` boundary, accent focus ring, `containerStyle` vs `style`, `inputRef` + `submitBehavior`, fold Persian tags.
- [ ] **Step 5: Update this document's status table** to record the approved decisions and the results.
- [ ] **Step 6: Run** `npm run lint`, `npm run typecheck`, and `npm test`. Compare the full suite to the baseline failures listed in Global Constraints; no new failure is acceptable.
- [ ] **Step 7: Manual matrix** (section 6.2) on an Android device in Expo Go or a dev build.
- [ ] **Step 8: Commit** (only if asked).

**Exit criteria:** the gallery shows every state; the docs match the code; lint/typecheck pass; the test suite has no new failures; the manual matrix is signed off.

---

# 6. Verification matrix

## 6.1 Automated

| Check | Command | Owns |
|---|---|---|
| Field boundary, ring, text contrast | `npm test -- src/theme/__tests__/tokens.test.ts` | WP1 |
| Shell, label association, error, counter, focus | `npm test -- src/components/ui/__tests__/text-field.test.tsx` | WP2 |
| Text area and password reveal | `npm test -- src/components/ui/__tests__/text-area.test.tsx src/components/ui/__tests__/password-field.test.tsx` | WP3 |
| Search clear/hint/submit | `npm test -- src/components/ui/__tests__/search-field.test.tsx` | WP4 |
| Timecode parsing and formatting | `npm test -- src/lib/__tests__/time.test.ts src/components/ui/__tests__/time-field.test.tsx` | WP5 |
| Tag folding, limits, colour readability | `npm test -- src/lib/__tests__/tags.test.ts src/lib/__tests__/color.test.ts src/components/ui/__tests__/tag-input.test.tsx` | WP6 |
| Annotation tags/colour persistence | `npm test -- src/services/__tests__/AnnotationService.test.ts` | WP7 |
| Composer behaviour | `npm test -- src/components/player/__tests__/annotation-composer.test.tsx` | WP8 |
| Sleep timer / jump to time | `npm test -- src/components/player/__tests__/sleep-timer-sheet.test.tsx src/components/player/__tests__/jump-to-time-sheet.test.tsx` | WP9 |
| Auth form | `npm test -- src/app/\(auth\)/__tests__` | WP10 |
| Sync idempotency (unchanged) | `npm test -- src/lib/__tests__/syncEngine.test.ts src/lib/__tests__/syncRetry.test.ts` | WP7 |
| Types | `npm run typecheck` | all |
| Lint | `npm run lint` | all |
| Full suite | `npm test` | all; compare to baseline |

## 6.2 Manual Android checklist

Run in Expo Go (foreground) and, for anything that touches lock-screen/background, a dev build. Do not start the server unless asked.

| # | Check | Expected |
|---|---|---|
| 1 | Light and dark, every state in the gallery | The field is a visible inset; the rest boundary is visible; focus is an accent ring; invalid is a danger ring; disabled is quieter and unfocusable |
| 2 | Auth: tap Email, then Next through to Password | Focus moves field to field; the keyboard stays up until the last field; Go submits |
| 3 | Auth: reveal a password mid-word | The value and caret survive; the toggle is announced as "Show/Hide password" |
| 4 | Playlist rename with the keyboard up | The Cancel/Save row is visible; the group is revealed, not just the input |
| 5 | Player note composer with the keyboard up | The text area, tags, colour row, and Save are all reachable; the sheet scrolls rather than clipping |
| 6 | Add-to-playlist composer | Same group reveal; Create & add is visible |
| 7 | Discover language search | The clear button appears on Android; tapping it clears; the results update |
| 8 | Library search | Typing does not remount the header; the hint/count is announced; the clear button is inside the pill |
| 9 | Persian typing (Gboard Persian) | A note, title, and tag accept Persian; text is not reversed or clipped; the caret stays where it is typed |
| 10 | Persian search and tag de-dupe | Searching with Arabic yeh/kaf or ZWNJ finds the same item; adding `كتاب` then `کتاب` is rejected as a duplicate |
| 11 | Time entry | `1234` becomes `12:34` on blur; `90` becomes `1:30`; a value above the track duration is clamped |
| 12 | Number entry | The minus/plus buttons stop at the bounds; an empty value reverts; a pasted value is clamped |
| 13 | Sleep timer | All five presets are reachable; a custom duration starts; the button counts down; Cancel stops |
| 14 | Jump to time | The value is clamped to the track; Go seeks and closes |
| 15 | Screen reader (TalkBack) | The label, hint, error, disabled state, password toggle, tag removal, and colour swatches are all announced |
| 16 | Autofill | Email/password offer saved credentials; the playlist title does not |
| 17 | Reduced motion | The focus ring appears immediately; no fade; the rest of the app still honours the preference |
| 18 | Large font scale | Labels and messages wrap; the field grows from `minHeight`; no text is clipped |
| 19 | App kill during a note | The session is unaffected; the unsent draft is lost (documented, out of scope) |
| 20 | Offline note with tags/colour | The note appears immediately; sync later sends tags/colour; a reinstall + login restores them |

## 6.3 Baseline

The 13 failures that predated this work were real bugs, not noise, and are now fixed:

- `audioInfo` treated the MPEG sync word as a signed 32-bit mask, so every MP3 frame was rejected; MP4 sample-entry fields were written little-endian in the fixture although ISO base media is big-endian; a three-character brand was not space-padded.
- `mediaBytes.findDescendant` skipped the four version/flag bytes of a `meta` full box from the wrong origin, so `moov/udta/meta/ilst` never resolved.
- The v2.2 tag fixture wrote v2.3 frame headers, and the artwork fixture omitted the two frame-flag bytes.

The suite is now **1227/1227** green.

---

# 7. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Toggling `secureTextEntry` on Android resets the font, clears the text, or moves the caret | Medium | Keep the value in React state (it already is), do not remount the input on toggle, and verify mid-word on a device. If the caret still jumps, restore it with `inputRef.current?.setSelection(start, end)` from the tracked selection. |
| Controlled time formatting jumps the caret | Medium | Raw digits while focused, formatting only on blur/submit (D8). Do not rewrite the value on every keystroke. |
| `accessibilityLabelledBy` does not resolve in Jest | High (test-only) | Assert the prop (`nativeID` / `accessibilityLabelledBy`) rather than relying on RNTL's label query; the device check covers the real announcement. |
| A focus ring animated per field causes a Reanimated cost | Low | Only `opacity` animates, on two overlays, and only while focus changes. Reduced motion assigns the value. |
| `maxHeight` on a text area creates a nested scroll inside `KeyboardScrollView` | Low | `keyboardShouldPersistTaps="handled"`; the text area scrolls only after its maximum; the outer scroll still reveals the group. |
| Adding `outlineStrong` changes the palette contract | Low | Add tests; do not weaken existing thresholds. The new colour is used only by the field boundary. |
| Existing notes/titles longer than a new limit are truncated | High if limits are added | D7: no new hard limits on existing text; tags are the only bounded input. |
| Sleep timer sheet state drifts from `sleep.active` | Low | The sheet reads the same `sleep` hook the button uses; it does not keep a second timer. |
| Tags/colour sync diverges from the backend | Low | The path already exists end-to-end; WP7 only widens the service args. Verify `syncLocalData` with a tag/colour note. |
| A colour swatch's check is invisible on a light swatch | Medium | `readableOn` picks black or white by luminance; the test covers every `ANNOTATION_COLORS` entry. |
| A new route breaks `tsc` because `.expo/types/router.d.ts` is stale | High if forgotten | WP12 regenerates it with a one-off `npx expo start --offline`, or skips the route in favour of an existing dev screen. |
| The plan becomes a second design system | Medium | One shell, one text primitive, no screen-level `TextInput`; the lint guard is extended in WP12. |

---

# 8. Approval gate

Approved: **D1–D12 as recommended.** WP1–WP12 are complete: tokens, fields, service, composer, sheets, auth, screens, gallery, docs, lint, typecheck, and the full suite (1227/1227). The Expo Go check passed. The 13 pre-existing media-parser failures were diagnosed and fixed.
