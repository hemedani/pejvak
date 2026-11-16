# Prompt 01 — Native Android Rewrite

> **Purpose of this folder:** a faithful record of the user's instructions and intent, so any agent
> can recover the *why* behind the code without re-asking. Prompts are append-only history — they are
> not edited to match later changes; later decisions are appended as new dated entries.
>
> Companion: [`../summary.md`](../summary.md) (what exists), [`../plans/01-native-rewrite.md`](../plans/01-native-rewrite.md) (what's next).

---

## 1. Original brief (2026-11-14, verbatim intent)

The user wants to **rewrite the entire Pejvak mobile app from React Native to fully native Android**,
moving from `mobile/` into a new top-level folder **`android/`**. Key points, preserved faithfully:

- **Native only, state-of-the-art.** "I want to use the latest native technologies instead of cross
  platform solutions like Flatter or React Native."
- **Why rewrite:** "The current app is decent, but it's increasingly running into bugs—especially
  since we rely heavily on native modules, which is making compatibility with React Native
  progressively worse. In some places, the app has become very sluggish; in others, it encounters
  bugs and crashes unexpectedly. The app's file size is also quite large."
- **From scratch, step-by-step.** "I want to rewrite the project from scratch, step-by-step, using a
  fully native approach and the latest, best-in-class technologies."
- **Research inspiration:** "Please search GitHub for top-tier audio playback projects and use them
  for inspiration."
- **Reference implementation:** the user's own native app at **`/Users/syd/work/Hawraa`**
  (Kotlin + Jetpack Compose Quran app; its `mobile/android/` is a verified-working build on this
  machine — AGP 9 built-in Kotlin, Hilt, Room, Media3, Ktor, WorkManager, Aliyun mirror ordering).
- **Feature parity, one by one.** "Please pay close attention to all the details and add every
  feature we have—one by one—to the plan file, so that the entire software can be completely
  rewritten."
- **Documentation discipline.** "Please create these files first, and update it after finished every
  small task: `android/docs/plans/01-(a proper name).md`, `android/docs/prompts/01-(a proper name).md`."
- **Redesign.** "Please also create comprehensive `DESING.md` file under `/android/DESING.md` based
  on this image: `/Users/syd/work/Pejvak/ignoreAssets/sample.jpg` and when redesigning, build the UI
  based on this new design." (Filename spelled `DESING.md` exactly as requested.)
- **Project context lives in the `AGENTS.md` files** — root, `back/`, `mobile/` — read them to
  understand the product; the new sector gets its own `android/AGENTS.md`.

## 2. Clarifying decisions (2026-11-14)

| Question | Answer |
|---|---|
| UI language for the new native app (current app is English LTR; mockup is RTL-oriented) | **Keep English LTR.** Persian stays first-class for *content*: search folding, RTL text detection, per-text direction. No i18n framework needed; strings still live in resources. |

## 3. Derived understanding (agent's reading of the brief + repo)

- The product is an **offline-first Android audio player** whose differentiators are exhaustive
  playback history (sessions/stretches/runs) and timestamped annotations, plus online streaming /
  downloading from free sources. All product invariants in root `AGENTS.md` and `mobile/AGENTS.md`
  carry over unchanged (integer seconds, contentHash identity, wall-clock listened time, 10 s
  checkpoints, append-only sessions, LWW annotations, idempotent clientId sync, `token` header
  without Bearer, `{success, body}` envelope).
- The **backend does not change**. The native app speaks the same Lesan wire protocol to the same
  acts (`register`, `login`, `getMe`, `registerTrack`, `getMyTracks`, `syncLocalData`, …).
- The design mockup (`ignoreAssets/sample.jpg`) is a **glassmorphism** language: frosted translucent
  panels with bright hairline borders over an ambient colorful canvas, circular outlined icon
  buttons, large radii, floating mini-player dock, full-screen Now Playing with hero artwork.
  `DESING.md` adapts it to English LTR and to every existing Pejvak screen.
- GitHub inspiration (researched 2026-11-14): **Voice** (PaulWoitaschek/Voice — Media3 + Compose
  audiobook player: resume, bookmarks, sleep-timer fade, silence skipping, auto-rewind, Android
  Auto), **Auxio** (OxygenCobalt/Auxio — rational Media3 playback-service architecture),
  **Gramophone** (FoedusProgramme/Gramophone — Media3 + Material You), **InnerTune/Kreate**
  (Compose + Media3 streaming UI patterns). Patterns are inspiration; no GPL code is copied.
- The old `mobile/` app stays in the repo untouched until the user decides to retire it.

## 4. Rename + side-by-side install (2026-11-14, verbatim intent)

> "Please also change to FlowCast. I'll find another good name later, and we can change it again. For
> now, I want to have both versions on my phone—the React Native version as well as the native version."

Decisions derived:
- The native app's **display name is "FlowCast"** (temporary; the owner will pick a final name later).
- **Both versions must coexist on the device.** Install identity is the `applicationId`, so the native
  app uses **`com.flowcast.app`**, distinct from the RN app's `com.pejvak.app`. This supersedes decision
  D4's original "same applicationId replaces the RN install" — they now install side by side.
- The **internal code package stays `com.pejvak.app`** for now to avoid a large rename the owner would
  undo when the final name is chosen. Only `applicationId` + label change. Both apps talk to the same
  Lesan backend / account, so they share the same synced history.