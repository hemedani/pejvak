# UI review — what the phone had, what the web now has, and what to do next

_Written 2026-11-02, alongside the commit that ported the wave, the listening
timeline and the motion layer to `front/`._

> 2026-11-04: Phase 1 of the rebrand resolved §3.1.1, §3.1.3, §3.2.4, §3.2.5, §3.2.6, §3.3.7,
> §3.4.11, §3.6.16 and added the route transition from §2.3. The remaining §3 items are
> Phase 2–5 work; the token values in this document are superseded by `docs/DESIGN.md`.

The phone app's identity is not its palette (that was already ported, token for
token). It is three things the browser was missing: **the wave**, **the listen
drawn as a bar**, and **the sense that a screen belongs to the track that is
playing**. This document records what was ported, what is still only on the
phone, and the changes I would make next — in that order of confidence.

---

## 1. What was ported

| Phone | Web | Note |
|---|---|---|
| `player/WavyProgress.tsx` | `components/player/wavy-progress.tsx` | Same geometry, drawn by `requestAnimationFrame` + two `<path>` writes instead of Reanimated. |
| `lib/waveform.ts` | `lib/waveform.ts` | Ported verbatim, `"worklet"` directives removed. Tests copied. |
| `player/Scrubber.tsx` | `components/player/scrubber.tsx` | Radix still owns the interaction and the ARIA; only its paint is switched off. |
| `session-detail/ListeningTimeline.tsx` | `components/domain/listening-timeline.tsx` | |
| `lib/listeningTimeline.ts` | `lib/listeningTimeline.ts` | Adapted to the web's flat `HistorySession`. |
| `session-detail/SessionDetailSheet.tsx` | `components/domain/session-detail.tsx` | A `Dialog` sheet, opened from a named control on the row. |
| `motion/AmbientWash` + `DynamicCanvas` | `components/player/ambient-wash.tsx` | A tint, not a canvas: the web has copy to keep readable. |
| `lib/palette.ts` | `lib/palette.ts` | One ramp table, one hash. Also adopted by `TrackArtwork`. |
| `motion/Reveal.tsx` | `components/motion/reveal.tsx` | CSS only — no observer, nothing to re-run on scroll. |
| `motion/ElasticPressable` | `button.tsx` base classes | `active:scale-[0.97]`, disabled under reduced motion. |

### The four decisions worth arguing about

**The wave is the bar, not a decoration above it.** Radix's `Slider` is still
there and still invisible: it is what gives the control `role="slider"`, the
keyboard model (arrows, Page Up/Down, Home/End), pointer capture and
`aria-valuetext`. Hand-rolling the drag to get the wave would have cost all of
that. The wave is drawn in the track's own box, with the played segment ending
`gap` px before the thumb and the unplayed one starting `gap` px after it, so the
thumb reads as cut out of the track — the detail that makes it look designed
rather than animated.

**The wave is `--accent`, not the track's palette.** The phone tints its scrubber
from the track ramp; the web does not, and this is deliberate. The plan's rule is
that accent means *state and action* — and "heard" is state. The per-track colour
lives in the ambient wash instead, so a blue track gets a blue room and a teal
wave, and "the teal one" means the same thing on every screen.

**The wash is a tint, never a surface.** On the phone the now-playing canvas is a
full-bleed gradient. Here it is two radial glows at 26% / 18% over the canvas,
`aria-hidden`, `pointer-events-none`. It is behind the content (`-z-10` inside
`isolate`) and it cross-fades on track change by interpolating two registered
`<color>` custom properties — `background-image` cannot transition, but a typed
custom property can, so the cross-fade needs no second layer and no state.

**The timeline opens from a named control, not from the row.** The history row
already contains two links and a button. Wrapping it in a third interactive
element would nest `<a>` inside `<button>`, which is invalid and makes the tab
order a guess. A `size="iconSm"` ghost button labelled "Timeline for …" costs the
row one 36 px slot and is reachable, named and honest.

### Two bugs fixed on the way

- `annotation-markers.tsx` translated each note dot `+50%` of its own width, so
  every marker sat 16 px **after** the second it names. The wave made it visible:
  a note that does not line up with the playhead is a note that lies.
- The scrub time bubble had the same `translate-x-1/2`, so it hung off the right
  of the thumb instead of sitting over it, and ran off the row at 0:00. It is now
  `-translate-x-1/2` and clamped with `clamp(2rem, N%, calc(100% - 2rem))`.

---

## 2. What is still only on the phone

Ranked by what a returning listener notices first.

### 2.1 There is no "continue listening" — the biggest gap

The dashboard opens on four totals and a bar chart. Those answer *what have I
done*; nothing on the web answers *what was I doing*. The phone's dock player and
its Continue card are why it feels like an app you come back to.

The act already exists and is **unused**: `actions/online/get-my-contexts.ts`
(`getMyPlaybackContexts`), which returns the listener's runs newest-first, with
`contextTitle`, `lastIndex`, `lastPositionSec`, `finishedCount`, `completed`. The
`lib/online/continue.ts` module that turns a run into a resume target is ported
and tested. So this is a card, not a feature: one read, one `ResumeListenButton`
reused from the history row, and it should sit **above** the four stat cells.

### 2.2 A collection's own history (the phone's `ContextHistorySheet`)

"Every play-through of this folder or playlist, newest first, including the one in
progress." The same unused act returns exactly that when filtered by
`contextType`/`contextKey`. The natural home on the web is a link from the
collection page (`/browse/collection/...`) and from the player's context chip,
opening the same `Sheet` the history row now uses.

### 2.3 Route transitions

There is no `template.tsx` and no transition on `<main>`, so a navigation is an
instant swap. Everything else in the app now eases; the page itself does not. A
160 ms fade with a 4 px rise on the route's own content — CSS only, `key`ed by
pathname — would make the app feel of a piece with its own controls.

### 2.4 Smaller things the phone has and the web does not

- **A palette tile** wherever a track appears without artwork (`PaletteTile` on
  the phone). `TrackArtwork` covers the player; the library table and the
  top-tracks table still show a grey glyph.
- **A buffering ring** — covered by the wave's sweep; no work needed.
- **Haptics** — not applicable.

---

## 3. Optimizations

### 3.1 Correctness — these are wrong, not merely plain

1. **`track-table.tsx:96` — the "Added" column does not show when it was added.**
   The header sorts by `createdAt` and the cell renders
   `{playCount} · {duration}`. Either the header becomes "Plays · length" and the
   sort link goes, or the cell shows `formatDateTime(createdAt)`. Today the column
   promises one fact and prints two others.
2. **The dashboard's "of N in your library" was a page, not a total.** `tracks`
   is capped at `JOIN_LIMIT = 200`, so a 900-track library read "of 200". Fixed in
   this change: the phrase only claims a total when the page did not hit the cap.
3. **`formatSpan` on the history row's day total and on the row's own figure**
   are both `type-numeric` — correct — but the row's *duration* is
   `text-secondary` while the *time range* beside it is `text-tertiary`. The
   figure people scan (when) is quieter than the figure they don't (how long).
   Swap them.

### 3.2 Hierarchy

4. **In a stat card the number is the label.** `StatCell` renders the label in
   `text-text` and the value in `text-secondary` — the tier table applied
   literally. But that table assumes a row whose *label* is the thing you read;
   in a card whose entire purpose is the figure, the figure is the label. The
   four numbers on the dashboard should be `text-text` at `type-figure`, with the
   caption above them in `text-secondary`. Right now the eye lands on "Total
   listening time" and then has to go looking for the number.
5. **The history row is three lines of caption for one listen.** Title +
   verdict, then time/tracks/collection, then position/speed. The third line is
   almost always "from 3:12 to 41:07" — which the timeline sheet now says far
   better. Keep it in the sheet, drop it from the row, and let the row be two
   lines.
6. **The library table centres its numeric column.** "Listening time" is
   `text-center` while the rest of the row starts at the inline-start edge. With
   tabular figures, numbers should end-align so the decimal positions line up down
   the column.

### 3.3 Motion — the rules the new layer should follow

7. **Reveal is on two surfaces out of eight.** The dashboard and the history day
   cards stagger; the library table, the playlists grid, the browse grid and the
   track page do not. Either apply it to every first paint (cheap: the same
   `<Reveal index>` around the rows) or to none — half is the state that reads as
   a bug when you notice it.
8. **Never animate a value that is also a fact.** The wave animates a *stroke*,
   never the number beside it; the reveal animates opacity and 10 px of travel,
   never a layout property. Worth writing down because the next person will want
   to animate a bar's height.
9. **`prefers-reduced-motion` must collapse the delay, not just the duration.**
   Already done in `globals.css` — with `animation-fill-mode: backwards` a
   staggered item holds its opacity-0 frame for the whole delay, so a collapsed
   duration alone leaves a reduced-motion listener looking at nothing.

### 3.4 Density and touch

10. **The player's control row is five ghost buttons in a line** (speed, jump,
    sleep, note, volume). On the phone they are split: transport-adjacent
    controls beside the transport, utilities behind a menu. On the web, `Speed`
    belongs next to the transport; `Jump to time` and `Sleep timer` are a
    `More` menu on narrow viewports; `Volume` is already hidden below `md` in the
    bar and should behave the same here.
11. **The scrubber's hit band is 36 px.** The phone reserves 44 pt. On a touch
    viewport the extra 8 px is the difference between grabbing the playhead and
    scrubbing by accident. `h-9` → `h-11` on coarse pointers only
    (`@media (pointer: coarse)`).
12. **`Badge` at `h-6` with 13 px text is below the 44 px target when it is
    interactive.** It isn't today — but the moment a chip becomes a filter, it
    needs `hit-area` padding rather than a taller chip.

### 3.5 Colour and contrast

13. **`--outline-strong` on `--surface` is about 3.6:1.** Fine for a border,
    below AA for text. It is only used as a border today; keep it that way and
    note it.
14. **The seeked segment in the timeline is the accent at `opacity 0.55`.** It
    is legible and it is distinguishable from the empty segment — but it borrows
    the same channel ("less of the accent") that already means "not heard". A
    dashed end cap, or a hatch, would say *span* without competing with *empty*.
    Worth a try; not a defect.

### 3.6 Accessibility

15. The wave is `aria-hidden` and the slider carries the value — good. The
    timeline strip is `role="img"` with the caption as its label — good. What is
    missing is **the timeline's per-segment information for a screen reader**:
    the caption says "3 tracks" but not which. A `<details>` under the bar
    listing "Chapter one — 0:00 to 10:00, heard" would cost nothing and make the
    best thing on the page reachable.
16. **The history detail sheet's title can be two chapters long** and
    `Dialog.Title` does not clamp. Two lines is fine; five is not. `line-clamp-2`
    on the title, full string in `title`.

---

## 4. If only three things get done

| # | Change | Why | Cost |
|---|---|---|---|
| 1 | Continue card on the dashboard (§2.1) | The act is written, the resume logic is ported and tested, and nothing on the web currently answers "what was I doing". | Small |
| 2 | Fix the "Added" column (§3.1.1) | A column that prints two facts under a third heading is the kind of thing that erodes trust in every other number. | Trivial |
| 3 | Route transition (§2.3) | The app now eases everywhere except the one place a user changes context. | Small |

Everything else in §3 is worth doing and none of it is urgent.
