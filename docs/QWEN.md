That is a very smart architectural decision. Separating `mobile` now leaves the door wide open for a future `web` frontend (like a Next.js web player or an admin dashboard for managing your audiobook library), while sharing the exact same Lesan auto-generated types across all platforms.

Here is the updated **Master Blueprint**. You can overwrite your `AGENTS.md` file with this version.

***

```markdown
# 🎧 Audiobook & Music Player: Master Blueprint for AI Agents

## 🤖 Agent Meta-Instructions
You are an elite Full-Stack TypeScript Developer specializing in **React Native (Expo)** and the **Lesan** framework (created by MiaadTeam). Your goal is to build an offline-first Android Audiobook & Music Player with deep playback history and timestamped annotations.

**Core Rules for the Agent:**
1. **Strict TypeScript:** Never use `any`. Rely on the auto-generated types from the Lesan backend.
2. **Lesan Paradigms:** Always use `coreApp.odm.newModel` and `coreApp.acts.setAct`. Use client-driven projections (`get` objects) to fetch exact data shapes.
3. **Offline-First:** The mobile app must write playback history and annotations to a local SQLite database immediately. A background `SyncService` will push these to the Lesan backend.
4. **Architecture:** Mirror the monorepo structure of `ziwound` and `nejat-lesan`, but specifically use `back/` and `mobile/` directories to future-proof for a potential `web/` frontend.

---

## 🏗️ Architecture & Tech Stack

### Backend (`/back`)
*   **Runtime:** Deno
*   **Framework:** Lesan (MongoDB ODM/ORM)
*   **Database:** MongoDB
*   **Auth:** JWT (`jose` or `djwt`)

### Mobile App (`/mobile`)
*   **Framework:** React Native (Expo Managed Workflow)
*   **Audio Engine:** `expo-audio` (Expo SDK 57 first-party; background audio + lock-screen controls via config plugin)
*   **Local DB:** `expo-sqlite` (For offline history/annotations)
*   **State Management:** Zustand
*   **Styling:** NativeWind (TailwindCSS for React Native)
*   **Routing:** Expo Router (File-based routing)

---

## 📁 Monorepo Structure

```text
/
├── back/                    # Deno + Lesan + MongoDB
│   ├── main.ts              # Server entry point
│   ├── schemas/             # Lesan models (User, Track, Session, Annotation, Playlist)
│   ├── acts/                # Lesan API routes (actions)
│   ├── utils/               # Auth, JWT helpers
│   └── types/               # Auto-generated TS definitions (shared with mobile/web)
├── mobile/                  # React Native (Expo)
│   ├── app/                 # Expo Router (library, player, history)
│   ├── components/          # UI (PlayerControls, AnnotationList, TrackCard)
│   ├── services/            # TrackPlayerService, LocalDBService, SyncService
│   ├── store/               # Zustand stores (playerStore, libraryStore)
│   └── lib/                 # Standard generated Lesan fetch client (`lesanApi`) wrapper, utils
├── web/                     # (Future) Next.js or React web frontend
├── docker-compose.yml       # Production MongoDB config
└── docker-compose.dev.yml   # Dev MongoDB config
```

---

## 🧠 Database Design (Lesan Schemas)

Use Lesan's `relatedRelations` to automatically embed the last 50 sessions and 1000 annotations directly into the `Track` document for blazing-fast reads on the mobile client.

### 1. User Model
```typescript
const userPure = {
  username: string(),
  email: string(),
  passwordHash: string(),
};
const userRelations = {
  tracks: {
    optional: true, schemaName: "track", type: "multiple",
    relatedRelations: { user: { type: "single" } }
  },
  playlists: {
    optional: true, schemaName: "playlist", type: "multiple",
    relatedRelations: { user: { type: "single" } }
  }
};
```

### 2. Track Model (The Audiobook/Music File)
```typescript
const trackPure = {
  title: string(),
  author: optional(string()),
  filePath: string(), // Local file URI or server ID
  durationSec: number(),
  totalPlayCount: number(), // Aggregate: How many times listened
  totalListenTimeSec: number(), // Aggregate: Total minutes listened
};
const trackRelations = {
  user: { optional: false, schemaName: "user", type: "single" },
  sessions: {
    optional: true, schemaName: "playbackSession", type: "multiple",
    sort: { field: "createdAt", order: "desc" }, limit: 50,
    relatedRelations: { track: { type: "single" } }
  },
  annotations: {
    optional: true, schemaName: "annotation", type: "multiple",
    sort: { field: "timestampSec", order: "asc" }, limit: 1000,
    relatedRelations: { track: { type: "single" } }
  }
};
```

### 3. PlaybackSession Model (The "History")
```typescript
const sessionPure = {
  startTime: date(),        // When the session started
  endTime: optional(date()),// When the session ended
  durationListenedSec: number(),
  startPositionSec: number(), // Where they started in the track
  endPositionSec: number(),   // Where they stopped in the track
  playbackSpeed: number(),    // 1.0, 1.5, 2.0
};
const sessionRelations = {
  track: { optional: false, schemaName: "track", type: "single" },
  user: { optional: false, schemaName: "user", type: "single" }
};
```

### 4. Annotation Model (Timestamped Notes)
```typescript
const annotationPure = {
  timestampSec: number(), // Exact second in the audio file
  content: string(),      // The user's note
  createdAt: date(),
};
const annotationRelations = {
  track: { optional: false, schemaName: "track", type: "single" },
  user: { optional: false, schemaName: "user", type: "single" }
};
```

---

## 🔄 Offline-First Sync Strategy

Audiobooks are often listened to offline. The mobile app must follow this flow:
1. **User plays track:** `expo-audio` fires `playbackStatusUpdate` events.
2. **Local Write:** `LocalDBService` immediately saves a `PlaybackSession` to `expo-sqlite`.
3. **Annotation:** User writes a note at `00:15:30`. `LocalDBService` saves it locally.
4. **Sync Act:** When the mobile app comes online, the `SyncService` batches all unsynced local sessions and annotations and sends them to a custom Lesan act: `syncLocalData`.
5. **Lesan Processing:** The `syncLocalData` act processes the arrays, inserts the documents, wires up the relations, and **updates the aggregate fields** (`totalPlayCount`, `totalListenTimeSec`) on the parent `Track` model.

---

## 🚀 Execution Roadmap (Step-by-Step for the Agent)

### Phase 1: Monorepo & Backend Setup
1. Initialize the `/back` directory with `deno init`.
2. Install Lesan (`jsr:@hemedani/lesan`) and MongoDB driver.
3. Create `docker-compose.dev.yml` to spin up a local MongoDB instance.
4. Implement the 4 core schemas (`User`, `Track`, `PlaybackSession`, `Annotation`) in `/back/schemas/`.
5. Enable `typeGeneration: true` in `coreApp.runServer()` to auto-generate `/back/types/`.

### Phase 2: Backend Acts (API)
1. Create `acts/auth/` (Register, Login).
2. Create `acts/tracks/` (`addTrack`, `getTracks`, `getTrackDetails` with deep projections for sessions/annotations).
3. **Crucial:** Create `acts/sync/syncLocalData.ts`. This act takes an array of local sessions and annotations, validates them, inserts them via ODM, and runs an `updateOne` on the `Track` model to increment `totalPlayCount` and `totalListenTimeSec`.

### Phase 3: Mobile Setup & Audio Engine
1. Initialize `/mobile` with `npx create-expo-app@latest`.
2. Install `expo-audio`, `expo-sqlite`, `zustand`, `nativewind`.
3. Create `/mobile/services/TrackPlayerService.ts`. Enable lock-screen controls with `player.setActiveForLockScreen(...)`.
4. Implement the `PlaybackProgressUpdated` event listener to track exactly where the user is every second.

### Phase 4: Local DB & Sync
1. Create `/mobile/services/LocalDBService.ts` using `expo-sqlite`. Define tables for `LocalSessions` and `LocalAnnotations`.
2. Create `/mobile/services/SyncService.ts` to read unsynced rows from SQLite and POST them to the Lesan `syncLocalData` act.
3. Wire the Zustand store to trigger syncs when the app state changes from `background` to `active`.

### Phase 5: UI Implementation
1. **Library Screen:** Grid/List of downloaded audiobooks. Fetches from local DB + Lesan sync.
2. **Player Screen:** Large cover art, playback controls, progress bar. Includes a "Quick Note" input field that captures the current track position.
3. **History & Annotations Screen:** A timeline view of the specific track. Fetches the embedded `sessions` and `annotations` arrays directly from the `Track` projection in Lesan.

---

## 🛑 Agent Constraints & Edge Cases
*   **Audiobook Length:** Audiobooks can be 20+ hours long. Ensure `timestampSec` and duration variables are handled as standard integers (seconds) to avoid floating-point errors.
*   **Large Annotations:** A user might have 500 annotations on one book. Use Lesan's `limit: 1000` on the `annotations` relation to ensure they are embedded directly in the Track document for 0-latency fetching on mobile.
*   **Android Background Restrictions:** `expo-audio` configures an Android foreground media service. Do not attempt to use `setInterval` in the JS thread for tracking; rely on `playbackStatusUpdate` events and persist a checkpoint every 10 s so a backgrounded/killed app loses nothing.
*   **Future Web Frontend:** Keep the Lesan API routes REST-like/agnostic enough that a future `web` folder can consume the exact same acts using the same generated types.
```

### How to kick this off with your AI Agent:
Once you save this to `AGENTS.md`, you can give your agent this initial prompt to get the ball rolling:

> *"Read the `AGENTS.md` file. We are starting a new project. Let's begin with Phase 1. Please set up the Deno backend directory (`/back`), write the `docker-compose.dev.yml` file for MongoDB, and write the 4 core Lesan schemas exactly as defined in the blueprint. Make sure to enable type generation."*
