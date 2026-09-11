# TracePlay — Advanced Audiobook & Music Player with Deep History & Annotations

> **For OpenCode / AI Agents**: This is the single source of truth. Read this entire document before writing any code. Follow the structure, naming, conventions, and priorities exactly. Prefer incremental, testable steps. Always generate TypeScript-first code. Never invent APIs that contradict Lesan patterns.

---

## 1. Vision & Problem Statement

**TracePlay** is a cross-platform (primary focus: Android) offline-first audio player optimized for **audiobooks**, long-form content, and music.

### Core Pain Points Solved
- Users lose track of *when*, *how long*, and *which parts* of a file they listened to (especially downloaded audiobooks).
- No way to leave timestamped notes/annotations that survive across devices and reinstalls.
- Existing players give only a single “last position”. We want a full **audit trail** of every listening session + rich annotations.

### Unique Selling Points
1. **Per-file Listening History** — every play session is recorded with:
   - Start/end timestamps (wall-clock)
   - Exact start position → end position (in milliseconds)
   - Duration listened
   - Playback speed used
   - Device info (optional)
   - Whether it was completed / interrupted
2. **Second-level Annotations** — user can drop a note at any millisecond. Each annotation stores:
   - Exact timestamp in the file
   - Text / rich text / tags
   - Creation time + last edit time
   - Optional audio snippet or screenshot
   - How many times the file has been played *up to that point*
3. **Cloud Sync + Offline-first** — history & notes live on the device and sync to a Lesan backend.
4. **Playlists, Collections, Smart Filters** based on listening stats.
5. Full TypeScript end-to-end (React Native + Lesan).

---

## 2. High-Level Architecture

```
TracePlay/
├── apps/
│   └── mobile/                 # React Native (Expo recommended) — Android primary, iOS secondary
├── packages/
│   ├── shared/                 # Shared types, Zod schemas, constants, pure utils
│   └── api-client/             # Auto-generated Lesan client + custom hooks
├── services/
│   └── backend/                # Lesan (Deno / Node / Bun) + MongoDB
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.backend
├── .env.mobile
├── AGENTS.md                   # ← this file
└── README.md
```

**Inspired by**:
- https://github.com/hemedani/nejat-lesan (monorepo layout, Docker, AGENTS.md style)
- https://github.com/hemedani/ziwound
- Lesan itself: https://github.com/MiaadTeam/lesan

**Tech Stack Decisions** (do not change without strong reason):

| Layer              | Choice                                      | Why |
|--------------------|---------------------------------------------|-----|
| Mobile             | React Native + Expo (SDK 52+)               | User knows TypeScript well |
| Playback           | `expo-audio` (SDK 57 first-party)           | Background, lock-screen, media controls |
| Local DB           | WatermelonDB or Drizzle + SQLite            | Offline-first, reactive |
| State              | Zustand + standard Lesan fetch client (`lesanApi`) | Simple + typed server data |
| Backend            | **Lesan** (creator’s own framework)         | GraphQL-like projections, extreme speed, TypeScript |
| Database           | MongoDB                                     | Native to Lesan |
| Auth               | JWT (jose) + refresh tokens                 | Same pattern as other Lesan projects |
| File Storage       | Local first + optional S3 / MinIO for covers & note attachments | |
| Validation         | Superstruct (Lesan) + Zod on mobile         | Consistency |

---

## 3. Core Domain Models (Lesan Schemas)

All models live under `services/backend/models/`.

### 3.1 User
```ts
{
  email: string,
  username: string,
  displayName: string,
  avatar?: string,
  settings: {
    defaultSpeed: number,          // 1.0
    sleepTimerMinutes?: number,
    theme: "system" | "dark" | "light",
    // ...
  },
  createdAt: Date,
  updatedAt: Date
}
```

### 3.2 MediaFile (the audio file itself)
- Can be local-only or synced.
- Hash (SHA-256 of file content) is the true identity → same file on different devices = same logical entity.

```ts
{
  hash: string,                    // content hash (primary key for dedup)
  title: string,
  artist?: string,
  album?: string,
  durationMs: number,
  coverUrl?: string,
  localPath?: string,              // device-specific
  mimeType: string,
  sizeBytes: number,
  metadata: Record<string, any>,   // year, genre, chapters, etc.
  owner: ObjectId,                 // User
  isPublic: boolean,
  createdAt, updatedAt
}
```

### 3.3 ListeningSession (the heart of the product)
Every time the user presses play → pause/stop/complete, a session is created/updated.

```ts
{
  mediaFile: ObjectId,             // or hash
  user: ObjectId,
  startedAt: Date,                 // wall clock
  endedAt?: Date,
  startPositionMs: number,
  endPositionMs: number,
  durationListenedMs: number,      // actual time the audio was playing
  playbackSpeed: number,
  completed: boolean,
  interrupted: boolean,            // app killed, call, etc.
  deviceInfo?: {
    platform: "android" | "ios",
    model: string,
    osVersion: string
  },
  // optional: battery, network type, etc.
}
```

### 3.4 Annotation
```ts
{
  mediaFile: ObjectId,
  user: ObjectId,
  positionMs: number,              // exact second (or millisecond)
  text: string,                    // markdown supported
  tags: string[],
  color?: string,                  // for UI markers
  createdAt: Date,
  updatedAt: Date,
  // denormalized for convenience
  timesPlayedBefore: number,       // how many full plays existed when this note was written
  sessionId?: ObjectId             // which session it was created in
}
```

### 3.5 Playlist
```ts
{
  title: string,
  description?: string,
  owner: ObjectId,
  items: [{
    mediaFile: ObjectId,
    order: number,
    addedAt: Date
  }],
  isPublic: boolean,
  coverUrl?: string
}
```

### 3.6 UserMediaProgress (derived / cached)
One document per user + mediaFile for fast “continue listening”:

```ts
{
  user: ObjectId,
  mediaFile: ObjectId,
  lastPositionMs: number,
  totalListenedMs: number,         // sum of all sessions
  playCount: number,
  lastPlayedAt: Date,
  firstPlayedAt: Date,
  completedCount: number,
  // latest annotation count, etc.
}
```

**Relations** (Lesan style):
- User → many MediaFiles, Sessions, Annotations, Playlists
- MediaFile → many Sessions, Annotations
- Use Lesan’s one-directional relation definition + automatic reverse embedding where useful (e.g. keep last 20 sessions on MediaFile).

---

## 4. Key Features & User Flows

### 4.1 Library
- Scan device storage (or specific folders) for audio files.
- Extract metadata + generate hash.
- Show progress bars, play count, last listened, annotation count on each card.

### 4.2 Player Screen
- Standard controls + speed (0.5x–3.0x), sleep timer, chapter support if available.
- **Timeline with markers**: every annotation appears as a colored pin. Tap → show note.
- Long-press on timeline → create new annotation at that position.
- “History” button → list of all ListeningSessions for this file (grouped by day).

### 4.3 Annotation UX
- Floating action or long-press.
- Modal with timestamp, text area, tags, color picker.
- Ability to jump back to any annotation.
- Export all annotations of a book as Markdown / PDF.

### 4.4 History Dashboard
- Global timeline of everything listened in the last 7/30/90 days.
- Stats: total hours, most listened files, longest sessions, streaks.
- Filter by file / playlist / date range.

### 4.5 Sync
- On app start / foreground → pull new sessions & annotations.
- After each session ends → push.
- Conflict resolution: last-write-wins for annotations; sessions are append-only.

### 4.6 Playlists & Collections
- Manual + smart playlists (“Unfinished”, “Annotated”, “Listened > 3 times”, etc.).

---

## 5. Backend (Lesan) Implementation Guidelines

Location: `services/backend/`

Follow the exact patterns from Lesan examples and the user’s previous projects (nejat-lesan, lesanSatek):

1. One `mod.ts` (or `main.ts`) that creates `coreApp = lesan()`.
2. Models registered with `coreApp.odm.newModel(name, pure, relations)`.
3. Acts registered with `coreApp.acts.setAct({ schema, actName, validator, fn })`.
4. Validators use `object({ set: ..., get: coreApp.schemas.selectStruct(...) })`.
5. Always support deep projections via `get`.
6. Generate types (`typeGeneration: true`) so the mobile client gets perfect TypeScript.
7. Auth middleware / context: inject `userId` into every request that needs it.
8. Playground enabled in development.

### Suggested Acts (minimum viable)

**Auth**
- `register`, `login`, `refreshToken`, `me`

**Media**
- `upsertMediaFile` (by hash)
- `getMyLibrary` (with progress + annotation counts)
- `getMediaFile`

**Sessions**
- `createListeningSession`
- `updateListeningSession` (when pause/stop)
- `getSessionsByMedia`
- `getMyListeningHistory` (paginated, filterable)

**Annotations**
- `createAnnotation`
- `updateAnnotation`
- `deleteAnnotation`
- `getAnnotationsByMedia`
- `getAnnotationsInRange`

**Playlists**
- CRUD + `addToPlaylist`, `reorder`

**Progress**
- `getContinueListening`
- `syncProgress` (batch)

All acts must be typed and validated.

---

## 6. Mobile App Guidelines (React Native + Expo)

### Recommended Libraries
- `expo-audio`
- `expo-file-system`, `expo-media-library`, `expo-document-picker`
- `react-native-mmkv` or WatermelonDB for local persistence
- `zustand` + the standard generated Lesan fetch client (`lesanApi`)
- `react-native-reanimated` + `gesture-handler` for nice timeline
- `date-fns` or `dayjs`
- `react-native-markdown-display` for annotation rendering

### Offline-first Strategy
1. All writes go to local DB first.
2. A background sync worker pushes/pulls using the generated Lesan client.
3. Optimistic UI everywhere.

### Player Architecture
- Service that owns the TrackPlayer instance.
- Emits events → ListeningSession recorder listens and writes to local DB.
- On pause/stop/complete → finalize session and enqueue for sync.

### Key Screens
1. Home / Continue Listening
2. Library (grid/list with filters)
3. Player (full screen + mini player)
4. File Detail (history + annotations timeline)
5. Annotation Editor
6. Global History & Stats
7. Playlists
8. Settings / Account

---

## 7. Development Workflow for Agents

### Phase 0 — Bootstrap (do this first)
1. Create monorepo structure exactly as shown in section 2.
2. Initialize Lesan backend with a minimal “hello” model + playground.
3. Initialize Expo app with TypeScript.
4. Set up Docker Compose (MongoDB + backend).
5. Create shared types package.
6. Generate first Lesan client types.

### Phase 1 — Core Backend
- User + Auth
- MediaFile
- ListeningSession
- Annotation
- Basic CRUD acts + projections

### Phase 2 — Mobile Skeleton
- Auth flow
- Local library scanner (hash + metadata)
- Basic player that records sessions locally
- Sync of sessions

### Phase 3 — Annotations & Timeline UI
- Create / edit / delete annotations
- Visual markers on progress bar
- Jump-to-annotation

### Phase 4 — Polish
- Playlists
- Stats dashboard
- Offline queue robustness
- Android Auto / lock screen polish
- Export features

### Coding Conventions (strict)
- Prefer pure functions.
- Every act must have a clear validator.
- Use Lesan relations correctly (define from one side).
- Mobile: no `any`. Strict TypeScript.
- Commit style (when agent is asked to commit): Conventional Commits + Gitmoji (same as lesanSatek AGENTS.md).
- Never use `git reset`.
- Put temporary scripts in `ignore-scripts/`.

### Testing Priorities
1. ListeningSession creation & duration calculation correctness.
2. Annotation position accuracy.
3. Sync conflict scenarios.
4. Offline → online recovery.

---

## 8. Future Ideas (do not implement yet)
- AI-generated chapter summaries from annotations
- Collaborative annotations (share a book with friends)
- Web player (Next.js) that reuses the same Lesan backend
- Voice notes as annotations
- Automatic “highlight” detection via silence / energy
- Integration with Audiobookshelf / Plex / Emby as media sources

---

## 9. Getting Started Commands (for humans & agents)

```bash
# Backend
cd services/backend
deno task dev          # or the equivalent in package.json

# Mobile
cd apps/mobile
npx expo start

# Full stack
docker compose -f docker-compose.dev.yml up --build
```

---

## 10. Success Metrics for Agents

A feature is “done” only when:
- Types are correct end-to-end (Lesan generated types used on mobile).
- Offline works without network.
- History and annotations survive app reinstall (after login).
- The timeline UI feels precise (ms accuracy).
- Code follows the structure of nejat-lesan / lesanSatek.

---

**End of Specification**

When in doubt, re-read this file. Prefer small, verifiable PRs / commits. Ask clarifying questions only if a requirement is truly ambiguous.
