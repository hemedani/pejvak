# Project Specification: Audiobook & Music Player with Deep Playback History

## 1. Project Overview

**Project Name:** Replay (working title)

**Core Purpose:** A mobile audio player built for audiobook listeners and music enthusiasts who want an **exhaustive, queryable history of every listening session**. Unlike standard players that only track a single "current position," this app records every play event with start time, end time, duration listened, the exact range played, and supports **per-second annotations** that persist across sessions.

**Target Platform:** Android (via React Native / Expo), with an offline-first architecture that syncs to a Lesan-powered backend.

**Key Differentiators:**

- **Session-level history** — every play, pause, seek, and completion is logged with timestamps and position ranges.
- **Per-second annotations** — users can attach notes to any playback position; each note stores when it was written, the file position, and the annotation text.
- **Play-count per file** — the system knows how many times a file has been started, completed, or partially played.
- **Offline-first with cloud sync** — all history and annotations are stored locally in SQLite and synced to the server when connectivity is available.
- **Lesan backend** — uses the user's own Lesan framework (TypeScript/Deno + MongoDB) for models, actions, and type generation.


## 2. Architecture Overview

The system follows a **three-tier offline-first architecture** modeled after the user's `ziwound` project structure:

```
replay/
├── back/                    # Lesan backend (Deno + MongoDB)
│   ├── models/              # Lesan model definitions (one file per model)
│   ├── src/                 # API acts and business logic
│   │   ├── auth/            # JWT authentication acts
│   │   ├── user/            # User-related acts
│   │   ├── track/           # Track/file-related acts
│   │   ├── session/         # Playback session acts
│   │   ├── annotation/      # Annotation acts
│   │   └── playlist/        # Playlist acts
│   ├── declarations/        # Generated type declarations (typeGeneration: true)
│   ├── utils/               # Shared utilities (JWT, validation)
│   ├── mod.ts               # Entry point: lesan(), setDb, register models, runServer
│   └── deno.json            # Tasks + import aliases
│
├── front/                   # React Native (Expo) app
│   ├── src/
│   │   ├── audio/           # Audio player engine & session tracking
│   │   ├── db/              # SQLite local database layer
│   │   ├── sync/            # Sync engine (local ↔ server)
│   │   ├── screens/         # UI screens
│   │   ├── components/      # Reusable UI components
│   │   ├── hooks/           # Custom React hooks
│   │   └── api/             # Lesan client wrapper
│   ├── app.json             # Expo config
│   └── package.json
│
├── docker-compose.yml       # Production Docker config
├── docker-compose.dev.yml   # Development Docker config
└── AGENTS.md                # OpenCode agent rules & workflow
```

This mirrors the `ziwound` structure: `back/` contains `models/`, `src/` (API routes), `declarations/`, and `utils/`; `front/` contains application source. The backend runs on Deno with Lesan, the frontend on Expo/React Native with TypeScript.


## 3. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Backend runtime** | Deno 1.x+ | Lesan's primary target; cross-platform, secure by default |
| **Backend framework** | Lesan (`jsr:@hemedani/lesan`) | User's own framework; client-driven projections, automatic relations, type generation |
| **Database (server)** | MongoDB 7+ | Native Lesan compatibility; flexible schema for history data |
| **Authentication** | JWT (jose/djwt) | Same pattern as `ziwound` |
| **Frontend framework** | React Native + Expo (SDK 52+) | User knows TypeScript; Expo simplifies Android builds |
| **Audio engine** | `expo-audio` | Expo SDK 57 first-party; background playback + lock-screen controls via config plugin. Selected over `react-native-track-player`/`react-native-audio-pro` for Expo Go + New-Architecture compatibility on RN 0.86. |
| **Local database** | `expo-sqlite` | Offline-first storage for sessions, annotations, and tracks |
| **Local filesystem** | `expo-file-system` | Store downloaded audio files locally |
| **State management** | Zustand + React Context | Lightweight; same pattern as `ziwound` |
| **HTTP client** | Standard generated Lesan fetch client (`lesanApi`) | End-to-end type safety via `typeGeneration: true` |
| **AI coding agents** | OpenCode (multi-agent) | User's chosen agent framework |


## 4. Data Models (Lesan Backend)

Lesan models are defined with `coreApp.odm.newModel(name, pureFields, relations)`. Pure fields use Superstruct validators (`string()`, `number()`, `boolean()`, etc.). Relations are defined as `inrelation` (embedded, ≤100 objects) or `outrelation` (referenced, unlimited).

### 4.1 User Model

```typescript
// models/user.ts
import { string, number, boolean, optional, array } from "superstruct";

const userPure = {
  username: string(),
  email: string(),
  passwordHash: string(),
  createdAt: number(),        // Unix timestamp
  lastActiveAt: number(),
};

const userRelations = {
  // outrelation: user can have many sessions
  // defined in session model as inrelation to user
};

export const users = coreApp.odm.newModel("user", userPure, userRelations);
```

### 4.2 Track Model (Audio File)

The Track represents a single audio file (a song or an audiobook chapter). It is **owned by a user** and **may belong to a playlist**.

```typescript
// models/track.ts
const trackPure = {
  title: string(),
  fileName: string(),           // local filename
  filePath: string(),           // device-local path (nullable on server)
  duration: number(),           // total duration in seconds
  fileSize: number(),           // bytes
  mimeType: string(),
  contentHash: string(),        // SHA-256 for dedup & sync
  isAudiobook: boolean(),
  author: optional(string()),
  narrator: optional(string()),
  artworkUrl: optional(string()),
  // Aggregate stats (denormalized for quick reads)
  totalPlayCount: number(),     // incremented on every play event
  totalListenedSeconds: number(),
  lastPlayedAt: number(),       // Unix timestamp
};

const trackRelations = {
  // inrelation to user (track belongs to one user)
  user: { schemaName: "user", type: "one" },
};
```

**Why `contentHash` matters:** When the user downloads an audiobook on another device, the sync engine can match files by hash rather than filename, ensuring history and annotations follow the file even if it's renamed.

### 4.3 PlaybackSession Model

A **PlaybackSession** represents a single continuous period of listening. It records **where the user started, where they stopped, and how long they listened in real time**.

```typescript
// models/session.ts
const sessionPure = {
  startedAt: number(),          // Unix timestamp (when play was pressed)
  endedAt: optional(number()),  // Unix timestamp (when paused/stopped)
  startPosition: number(),      // position in seconds where playback began
  endPosition: number(),        // position in seconds where playback ended
  listenedSeconds: number(),    // actual wall-clock time spent playing
  playbackRate: number(),       // 1.0, 1.25, 1.5, etc.
  wasCompleted: boolean(),      // true if user reached end of track
  deviceId: string(),           // to distinguish devices
};

const sessionRelations = {
  track: { schemaName: "track", type: "one" },
  user:  { schemaName: "user",  type: "one" },
};
```

**Calculation example:** If a user starts at position 120s and stops at position 300s, but paused twice for a total of 45 seconds, then `startPosition = 120`, `endPosition = 300`, and `listenedSeconds = 135` (actual wall-clock). This distinction matters — a user may have "skipped ahead" from 120s to 300s but only listened to 60 seconds of content.

### 4.4 Annotation Model

Annotations are **per-second notes**. Each annotation is tied to a specific position in a track and records when it was created.

```typescript
// models/annotation.ts
const annotationPure = {
  positionSeconds: number(),    // the exact second in the track
  text: string(),               // the note content
  color: optional(string()),    // for UI categorization (hex color)
  createdAt: number(),          // Unix timestamp
  updatedAt: number(),
};

const annotationRelations = {
  track: { schemaName: "track", type: "one" },
  user:  { schemaName: "user",  type: "one" },
};
```

**Query pattern:** "Show me all annotations I've made in chapter 3 of this audiobook" → Lesan's client-driven projections let the frontend request `{ positionSeconds, text, createdAt }` for all annotations where `trackId = X` and `positionSeconds BETWEEN 3600 AND 7200`, sorted by position.

### 4.5 Playlist Model

```typescript
// models/playlist.ts
const playlistPure = {
  name: string(),
  description: optional(string()),
  createdAt: number(),
  updatedAt: number(),
  trackOrder: array(string()),  // ordered array of track IDs
};

const playlistRelations = {
  user: { schemaName: "user", type: "one" },
};
```

### 4.6 Relation Strategy

Following Lesan's guidance: relations with **fewer than 100 embedded documents** use `inrelation` (stored as embedded objects). Relations that can grow unbounded (e.g., all sessions for a user over years) use `outrelation`.

| Relation | Type | Reason |
|---|---|---|
| Track → User | `inrelation: one` | Each track belongs to exactly one user |
| Session → Track | `inrelation: one` | Each session is tied to one track |
| Session → User | `inrelation: one` | Each session belongs to one user |
| Annotation → Track | `inrelation: one` | Each annotation is tied to one track |
| Annotation → User | `inrelation: one` | Each annotation belongs to one user |
| Playlist → User | `inrelation: one` | Each playlist belongs to one user |
| User → Sessions | `outrelation` | A user can have thousands of sessions (unbounded) |
| User → Tracks | `outrelation` | A user can have many tracks (unbounded) |
| User → Annotations | `outrelation` | A user can have many annotations (unbounded) |


## 5. API Contracts (Lesan Acts)

Lesan acts are defined with `coreApp.acts.setAct({ schema, actName, fn, validator, preAct })`. Each act has a **validator** (Superstruct schema for input) and a **fn** (implementation).

### 5.1 Auth Acts

```typescript
// src/auth/signup.fn.ts
export const signupFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const user = await users.insertOne({
    doc: {
      username: set.username,
      email: set.email,
      passwordHash: await hashPassword(set.password),
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    },
  });
  const token = await createJWT({ _id: user._id, username: set.username });
  return { token, user: { _id: user._id, username: set.username } };
};

// src/auth/signup.val.ts
export const signupValidator = () => ({
  set: object({
    username: string(),
    email: string(),
    password: string(),
  }),
  get: object({
    token: string(),
    user: object({ _id: string(), username: string() }),
  }),
});
```

### 5.2 Session Acts

| Act | Input (`set`) | Output (`get`) | Purpose |
|---|---|---|---|
| `startSession` | `{ trackId, startPosition, playbackRate, deviceId }` | `{ sessionId }` | Begin a new playback session |
| `endSession` | `{ sessionId, endPosition, listenedSeconds, wasCompleted }` | `{ session }` | Finalize a session with actual end data |
| `getTrackSessions` | `{ trackId, limit, offset }` | `[{ session }]` | Paginated history for a track |
| `getUserSessions` | `{ userId, since, limit }` | `[{ session }]` | All sessions for a user in a time range |

### 5.3 Annotation Acts

| Act | Input (`set`) | Output (`get`) | Purpose |
|---|---|---|---|
| `createAnnotation` | `{ trackId, positionSeconds, text, color? }` | `{ annotation }` | Add a note at a position |
| `updateAnnotation` | `{ annotationId, text?, color? }` | `{ annotation }` | Edit an existing note |
| `deleteAnnotation` | `{ annotationId }` | `{ success }` | Remove a note |
| `getTrackAnnotations` | `{ trackId, fromSeconds?, toSeconds? }` | `[{ annotation }]` | Annotations for a track (optionally filtered by position range) |
| `getAnnotationPlayCount` | `{ annotationId }` | `{ playCount }` | How many times the user played back this annotation's position |

### 5.4 Track & Playlist Acts

| Act | Input (`set`) | Output (`get`) | Purpose |
|---|---|---|---|
| `registerTrack` | `{ title, fileName, duration, fileSize, contentHash, ... }` | `{ trackId }` | Register a new audio file |
| `getUserTracks` | `{ userId, isAudiobook?, limit, offset }` | `[{ track }]` | List user's tracks |
| `updateTrackStats` | `{ trackId, playCountDelta, listenedSecondsDelta }` | `{ track }` | Increment aggregate stats |
| `createPlaylist` | `{ name, description?, trackOrder }` | `{ playlist }` | Create a playlist |
| `getUserPlaylists` | `{ userId }` | `[{ playlist }]` | List user's playlists |
| `updatePlaylistOrder` | `{ playlistId, trackOrder }` | `{ playlist }` | Reorder tracks |


## 6. Frontend Architecture (React Native)

### 6.1 Audio Engine Layer

The audio engine wraps Expo SDK 57 first-party `expo-audio` and is responsible for **emitting session events** that the history tracker consumes. (The sample below is illustrative; the real implementation is `mobile/src/services/TrackPlayerService.ts`, which drives the pure `mobile/src/lib/sessionTracking.ts` state machine from `playbackStatusUpdate` events.)

```typescript
// src/audio/AudioEngine.ts
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

export interface PlaybackEvent {
  type: 'play' | 'pause' | 'seek' | 'complete' | 'progress';
  trackId: string;
  positionSeconds: number;
  timestamp: number;
}

class AudioEngine {
  private sessionId: string | null = null;
  private sessionStartPosition: number = 0;
  private sessionStartWallTime: number = 0;
  private listenedSeconds: number = 0;
  private lastPosition: number = 0;

  async play(track: Track, startPosition: number = 0) {
    // End any previous session
    if (this.sessionId) await this.endSession(false);

    // Start new session
    this.sessionStartPosition = startPosition;
    this.sessionStartWallTime = Date.now();
    this.listenedSeconds = 0;
    this.lastPosition = startPosition;

    this.sessionId = await startSessionOnServer({
      trackId: track.id,
      startPosition,
      playbackRate: 1.0,
      deviceId: getDeviceId(),
    });

    const player = createAudioPlayer(null, { updateInterval: 1000 });
    player.replace({ uri: `file://${track.filePath}` });
    player.play();
  }

  // Called on pause, stop, or track end
  async endSession(wasCompleted: boolean) {
    if (!this.sessionId) return;
    await endSessionOnServer({
      sessionId: this.sessionId,
      endPosition: this.lastPosition,
      listenedSeconds: this.listenedSeconds,
      wasCompleted,
    });
    this.sessionId = null;
  }
}
```

**Progress tracking:** `expo-audio`'s `createAudioPlayer(source, { updateInterval: 1000 })` emits a `playbackStatusUpdate` roughly every second. On each update:

1. Calculate delta = currentPosition − lastPosition
2. If delta > 0 and delta < 5 (not a seek), add delta to `listenedSeconds`
3. Update `lastPosition = currentPosition`
4. Persist a "checkpoint" to SQLite every 10 seconds (in case the app is killed)

### 6.2 Local Database Layer (SQLite)

All data is written to SQLite **first**, then synced to the server. This ensures the app works fully offline.

```sql
-- Local schema
CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  server_id TEXT UNIQUE,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  duration REAL NOT NULL,
  content_hash TEXT NOT NULL,
  total_play_count INTEGER DEFAULT 0,
  total_listened_seconds REAL DEFAULT 0,
  last_played_at INTEGER,
  sync_status TEXT DEFAULT 'pending'  -- pending | synced
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  server_id TEXT UNIQUE,
  track_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  start_position REAL NOT NULL,
  end_position REAL,
  listened_seconds REAL DEFAULT 0,
  playback_rate REAL DEFAULT 1.0,
  was_completed INTEGER DEFAULT 0,
  device_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);

CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  server_id TEXT UNIQUE,
  track_id TEXT NOT NULL,
  position_seconds REAL NOT NULL,
  text TEXT NOT NULL,
  color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sync_status TEXT DEFAULT 'pending',
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);

CREATE TABLE playlists (
  id TEXT PRIMARY KEY,
  server_id TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  track_order TEXT,  -- JSON array of track IDs
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sync_status TEXT DEFAULT 'pending'
);
```

### 6.3 Sync Engine

The sync engine runs in three modes:

1. **Eager sync** — on every session end or annotation creation, immediately attempt to push to server. If offline, mark `sync_status = 'pending'` and add to queue.
2. **Periodic sync** — every 5 minutes when app is in foreground and network is available, push all `pending` records.
3. **Manual sync** — user-triggered "Sync Now" button in settings.

**Conflict resolution:** Since sessions and annotations are **append-only** (never edited after creation, except annotation text), conflicts are rare. For annotation edits, the server's `updatedAt` timestamp wins (last-write-wins).

```typescript
// src/sync/SyncEngine.ts
export async function syncPendingChanges() {
  const pendingSessions = await db.getPendingSessions();
  for (const session of pendingSessions) {
    try {
      const result = await api.endSession({
        sessionId: session.server_id,
        endPosition: session.end_position,
        listenedSeconds: session.listened_seconds,
        wasCompleted: session.was_completed === 1,
      });
      await db.markSynced('sessions', session.id, result.session._id);
    } catch (error) {
      // Stay pending; retry later
    }
  }
}
```

### 6.4 UI Screens

| Screen | Purpose | Key Components |
|---|---|---|
| **Home / Library** | List user's tracks and playlists | `TrackList`, `PlaylistCarousel`, `NowPlayingBar` |
| **Player** | Full player with waveform, annotations overlay | `AudioPlayerControls`, `WaveformView`, `AnnotationMarkers`, `AnnotationList` |
| **History** | Chronological list of all sessions | `SessionList` (grouped by date), `TrackSessionCard` |
| **Track Detail** | Stats for a single track: play count, total time, session list | `TrackStats`, `SessionTimeline`, `AnnotationList` |
| **Annotation Editor** | Create/edit an annotation at a specific position | `PositionSelector`, `TextEditor`, `ColorPicker` |
| **Settings** | Sync status, account, storage management | `SyncStatus`, `AccountInfo`, `StorageStats` |

**Annotation UX detail:** In the Player screen, annotations appear as **colored tick marks on the progress bar**. Tapping a tick seeks to that position and shows the note. A "＋" button on the player lets the user create an annotation at the current position with one tap.


## 7. AI Agent Workflow (OpenCode)

The project is built with OpenCode using a **multi-agent skeleton** inspired by `opencode-vitamins`. The following agents are defined:

### 7.1 Agent Definitions

```markdown
<!-- .opencode/agents/lead.md -->
---
name: lead
description: Coordinates planning, delegation, verification, and iteration
model: deepseek/deepseek-v4-pro
---
You are the lead agent. Your job is to:
1. Read AGENTS.md and understand the project rules.
2. Break down the user's task into backend and frontend work.
3. Delegate to `backend-coder` and `frontend-coder` with clear specs.
4. Verify the result against acceptance criteria.
5. Iterate until all tests pass.
```

```markdown
<!-- .opencode/agents/backend-coder.md -->
---
name: backend-coder
description: Implements Lesan models, acts, and server logic
model: deepseek/deepseek-v4-pro
---
You implement backend features using Lesan. Follow these rules:
- One model per file in `back/models/`.
- One act folder per domain in `back/src/`.
- Always define validators (`*.val.ts`) before implementations (`*.fn.ts`).
- Use `typeGeneration: true` in `mod.ts` so client types are auto-generated.
- Run `deno task test` after implementing an act.
```

```markdown
<!-- .opencode/agents/frontend-coder.md -->
---
name: frontend-coder
description: Implements React Native screens, components, and state
model: deepseek/deepseek-v4-pro
---
You implement the React Native frontend. Follow these rules:
- Use TypeScript strictly; no `any`.
- All network calls go through the generated Lesan client in `src/api/`.
- All data writes go to SQLite first, then sync.
- Use Zustand for global state; no Redux.
- Test on Android emulator after each screen implementation.
```

### 7.2 Project Rules (`AGENTS.md`)

```markdown
# AGENTS.md — Replay Project Rules

## Architecture
- Backend: Deno + Lesan + MongoDB. Entry point is `back/mod.ts`.
- Frontend: Expo + React Native + TypeScript. Entry point is `front/App.tsx`.
- Local DB: SQLite via `expo-sqlite`. All writes are offline-first.

## Coding Standards
- Use TypeScript strict mode. No `any`.
- Lesan models: one file per model in `back/models/`.
- Lesan acts: one folder per domain in `back/src/<domain>/`.
- React components: functional with hooks. No class components.
- File naming: `kebab-case.ts` for modules, `PascalCase.tsx` for components.

## Testing
- Backend: `deno task test` (uses hurl for e2e).
- Frontend: Jest + React Native Testing Library for unit tests.
- Every act must have at least one test.

## Sync Protocol
- Local writes set `sync_status = 'pending'`.
- Background sync pushes pending records every 5 minutes.
- Never block UI on network calls.

## Task Decomposition
- Backend tasks: models → validators → acts → tests.
- Frontend tasks: DB schema → audio engine → screens → sync engine.
- Always implement backend before frontend for a feature.
```

### 7.3 Task Decomposition Strategy

The project is built in **phases**, each phase completed by the agent team before moving to the next.

**Phase 1: Backend Foundation**
- Task 1.1: Define User model + auth acts (signup, login, me).
- Task 1.2: Define Track model + registerTrack, getUserTracks acts.
- Task 1.3: Define PlaybackSession model + startSession, endSession, getTrackSessions acts.
- Task 1.4: Define Annotation model + createAnnotation, getTrackAnnotations acts.
- Task 1.5: Define Playlist model + CRUD acts.
- Task 1.6: Write hurl e2e tests for all acts.

**Phase 2: Frontend Foundation**
- Task 2.1: Set up Expo project with TypeScript, SQLite, expo-audio.
- Task 2.2: Implement SQLite schema and DAO layer.
- Task 2.3: Implement Lesan API client wrapper (using generated types).
- Task 2.4: Implement AudioEngine with session tracking.

**Phase 3: Core UI**
- Task 3.1: Home/Library screen with track list.
- Task 3.2: Player screen with progress bar and play/pause.
- Task 3.3: History screen with session list.
- Task 3.4: Track Detail screen with stats.

**Phase 4: Annotations**
- Task 4.1: Annotation editor (create at current position).
- Task 4.2: Annotation markers on progress bar.
- Task 4.3: Annotation list in Track Detail.

**Phase 5: Sync & Polish**
- Task 5.1: Sync engine (push pending records).
- Task 5.2: Conflict resolution for annotation edits.
- Task 5.3: Settings screen with sync status.
- Task 5.4: Offline mode testing.

### 7.4 Example Agent Prompt

To kick off Phase 1, the user would run:

```bash
opencode run \
  --agent lead \
  --command orchestrate \
  "Implement Phase 1 from the project spec. Start with the User model and auth acts. 
   Reference the Data Models section (§4) and API Contracts (§5) in the spec MD file. 
   Write hurl tests for each act. Verify with deno task test."
```


## 8. Critical Implementation Details

### 8.1 Avoiding Data Loss on App Kill

The biggest risk in a playback history app is losing session data when the OS kills the app. Mitigations:

1. **Checkpoint every 10 seconds** — write current position to SQLite in a `playback_checkpoints` table.
2. **On app start** — if a checkpoint exists without a corresponding ended session, recover it: create a session with `endedAt = checkpoint.timestamp`.
3. **Background service** — `expo-audio` configures an Android foreground media service. JS status events are not guaranteed while the app is backgrounded, so session state is checkpointed every 10 s and reconciled on launch via `recoverOrphanedSessions()`.

### 8.2 Accurate `listenedSeconds` Calculation

Do **not** use `endPosition - startPosition` for `listenedSeconds`. That would count skipped content as "listened." Instead:

- On each progress event (every 1 second), compute `delta = currentPosition - lastPosition`.
- If `0 < delta < 5` (a normal forward play), add `delta` to `listenedSeconds`.
- If `delta > 5` or `delta < 0` (a seek), do **not** add to `listenedSeconds`; just update `lastPosition`.
- This ensures `listenedSeconds` reflects actual wall-clock listening time, not content duration.

### 8.3 Content Hash for Cross-Device History

When a user downloads the same audiobook on a new device, the file might have a different name or path. The `contentHash` (SHA-256 of the first 1MB + file size) ensures that:

- If the hash matches an existing track, the new device **reuses** the server-side track record.
- All history and annotations from the old device appear on the new device immediately.

### 8.4 Annotation Play Count

The "how many times was this annotation's position played" feature requires tracking **playback ranges**, not just play events. Implementation:

- When a session ends, store the `[startPosition, endPosition]` range.
- For each annotation on that track, check if `annotation.positionSeconds` falls within the range.
- If yes, increment a `playCount` field on the annotation record.

This can be done server-side in the `endSession` act, or client-side in a post-processing step. Server-side is preferred because it works even when the app is killed mid-session.


## 9. Development Commands

```bash
# Backend
cd back/
deno task start        # start Lesan server on port 1405
deno task dev          # start with hot reload
deno task seed         # seed database
deno task test         # run hurl e2e tests

# Frontend
cd front/
npm install
npx expo start         # start Expo dev server
npx expo run:android   # build & run on Android device/emulator

# Docker (production)
docker-compose up --build

# Docker (development)
docker-compose -f docker-compose.dev.yml up --build
```


## 10. Acceptance Criteria

The project is considered complete when:

- [ ] A user can sign up, log in, and see their library.
- [ ] A user can register an audio file and play it with background playback.
- [ ] Every play session is recorded with `startedAt`, `endedAt`, `startPosition`, `endPosition`, and `listenedSeconds`.
- [ ] The user can see a chronological history of all sessions for a track.
- [ ] The track's `totalPlayCount` and `totalListenedSeconds` are updated after each session.
- [ ] A user can create an annotation at any position; the annotation stores `positionSeconds`, `createdAt`, and `text`.
- [ ] Annotations appear as markers on the player progress bar.
- [ ] The user can see how many times a track has been played and when it was last played.
- [ ] All data is stored locally first and synced to the Lesan backend.
- [ ] The app works fully offline; sync resumes when connectivity returns.
- [ ] Backend has hurl e2e tests for all acts; frontend has unit tests for the audio engine and sync engine.


## 11. Open Questions for the User

1. **Multi-device sync conflict:** Should annotations be editable from multiple devices, or is append-only sufficient for v1?
2. **File storage on server:** Should the backend store the actual audio files (S3/MinIO), or only metadata? The `ziwound` project serves static uploads under `/uploads` — this pattern could be reused.
3. **Playback rate history:** Should `playbackRate` changes mid-session create a new session record, or be stored as a separate event? Current design assumes a single rate per session; if the user changes speed mid-session, the session splits.
4. **Annotation playback count granularity:** Should "how many times was this annotation's position played" count only full sessions where the position was reached, or also count manual seeks to that position? Current design counts sessions whose `[startPosition, endPosition]` range includes the annotation position.
5. **Offline annotation creation:** Annotations created offline need a temporary ID that is replaced with the server ID after sync. The sync engine must handle this ID mapping.
