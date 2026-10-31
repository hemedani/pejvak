/**
 * The player's state machine.
 *
 * The engine owns the element; the store owns what a screen draws. This module
 * is the only place that turns element events into sessions, stretches and runs,
 * and the only place that mutates the queue. Every rule here is a port of
 * `mobile/src/services/TrackPlayerService.ts` or a browser reality named in the
 * brief.
 */

import { usePlayerStore } from "@/stores/player";

import { clampResumePosition } from "./resume";
import {
  clampIndex,
  moveItem,
  nextIndex,
  previousIndex,
  removeAt as removeQueueAt,
} from "./queue";
import {
  createSessionTracker,
  applyProgress,
  type SessionTrackerState,
} from "./sessionTracking";
import { playerStorage } from "./storage";
import { pendingTrackFor } from "./from-track";
import { sameContext, runFiguresFromSessions } from "./playbackContext";
import { queueSync, startSyncTriggers } from "./sync";
import {
  StreamError,
  isLiveSource,
  resolveStreamUrl,
} from "./stream";
import { getEngine, type EngineEvent, type EngineSnapshot } from "./engine";
import type {
  LocalRun,
  LocalSessionDraft,
  PlaybackContext,
  PlayerTrack,
  QueuedSession,
} from "./types";

const engine = getEngine();

let booted = false;
let session: LocalSessionDraft | null = null;
let tracker: SessionTrackerState | null = null;
let seekPending = false;
let stretchHandover: string | null = null;
let advancing = false;
let reResolvedHash: string | null = null;
let mediaHandlersInstalled = false;

function nowMs(): number {
  return Date.now();
}

function deviceInfo(): string | undefined {
  if (typeof navigator === "undefined" || !navigator.userAgent) {
    return undefined;
  }
  return navigator.userAgent.slice(0, 180);
}

function store() {
  return usePlayerStore.getState();
}

function currentTrack(): PlayerTrack | null {
  return store().current;
}

function isCurrentLocal(): boolean {
  return currentTrack()?.origin === "local";
}

function errorMessageFor(error: unknown): string {
  if (error instanceof StreamError) {
    switch (error.code) {
      case "no-resolver":
        return "منبع این قطعه هنوز به پخش‌کننده وصل نشده است.";
      case "not-found":
        return "این قطعه در منبع پیدا نشد.";
      case "invalid-url":
        return "منبع نشانی قابل پخش برنگرداند.";
      default:
        return "منبع در دسترس نیست.";
    }
  }
  return "منبع در دسترس نیست.";
}

// ── MediaSession ───────────────────────────────────────────────────────────

function mediaSession(): MediaSession | null {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return null;
  }
  return navigator.mediaSession;
}

function setMediaMetadata(track: PlayerTrack | null): void {
  const media = mediaSession();
  if (!media) {
    return;
  }
  if (!track) {
    media.metadata = null;
    media.playbackState = "none";
    return;
  }
  if (typeof MediaMetadata === "undefined") {
    return;
  }
  media.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist ?? "",
    album: track.albumTitle ?? track.collectionTitle ?? "پژواک",
    artwork: track.artworkUrl ? [{ src: track.artworkUrl }] : [],
  });
}

function setMediaPlaybackState(status: string): void {
  const media = mediaSession();
  if (!media) {
    return;
  }
  media.playbackState =
    status === "playing" ? "playing" : status === "paused" || status === "ended" ? "paused" : "none";
}

function updateMediaPosition(): void {
  const media = mediaSession();
  const state = store();
  if (!media || state.durationSec <= 0) {
    return;
  }
  try {
    media.setPositionState({
      duration: state.durationSec,
      playbackRate: state.playbackSpeed > 0 ? state.playbackSpeed : 1,
      position: Math.min(Math.max(0, state.positionSec), state.durationSec),
    });
  } catch {
    // An unsupported browser or a stale duration is not worth a crash.
  }
}

function installMediaHandlers(): void {
  const media = mediaSession();
  if (!media || mediaHandlersInstalled) {
    return;
  }
  mediaHandlersInstalled = true;

  const handlers: {
    action: MediaSessionAction;
    handler: (details: MediaSessionActionDetails) => void;
  }[] = [
    { action: "play", handler: () => void play() },
    { action: "pause", handler: () => pause() },
    { action: "stop", handler: () => closePlayer() },
    { action: "seekbackward", handler: (details) => seekBy(-(details.seekOffset ?? 30)) },
    { action: "seekforward", handler: (details) => seekBy(details.seekOffset ?? 30) },
    {
      action: "seekto",
      handler: (details) => {
        if (typeof details.seekTime === "number") {
          seek(details.seekTime);
        }
      },
    },
    { action: "nexttrack", handler: () => void next() },
    { action: "previoustrack", handler: () => void previous() },
  ];

  for (const { action, handler } of handlers) {
    try {
      media.setActionHandler(action, handler);
    } catch {
      // Not every action exists in every browser.
    }
  }
}

// ── Runs ───────────────────────────────────────────────────────────────────

function touchRun(positionSec: number): void {
  const storage = playerStorage();
  const run = storage.getOpenRun();
  if (!run) {
    return;
  }
  const state = store();
  storage.setOpenRun({
    ...run,
    lastIndex: state.queueIndex < 0 ? run.lastIndex : state.queueIndex,
    lastTrackId: state.current?.contentHash ?? run.lastTrackId,
    lastPositionSec: Math.max(0, Math.round(positionSec)),
    updatedAt: nowMs(),
  });
}

function closeRun(completed: boolean, interrupted: boolean): void {
  const storage = playerStorage();
  const run = storage.getOpenRun();
  if (!run || run.endedAt !== null) {
    return;
  }

  const tallies = storage.getRunTallies();
  const tally = tallies[run.clientId];
  const derived = runFiguresFromSessions(run.clientId, storage.getSessions());
  const finishedHashes = tally?.finishedHashes ?? derived.finishedHashes;
  const listenedSec = tally?.listenedSec ?? derived.listenedSec;
  const state = store();

  const closed: LocalRun = {
    ...run,
    endedAt: nowMs(),
    lastIndex: state.queueIndex < 0 ? run.lastIndex : state.queueIndex,
    lastTrackId: state.current?.contentHash ?? run.lastTrackId,
    lastPositionSec: Math.max(0, Math.round(state.positionSec)),
    listenedSec: Math.max(0, Math.round(listenedSec)),
    finishedCount: finishedHashes.length,
    completed,
    interrupted,
    updatedAt: nowMs(),
  };

  storage.upsertRun(closed);
  storage.setOpenRun(null);
  storage.clearRunTally(run.clientId);
  void queueSync("run");
}

/**
 * One attempt at a collection. At most one run is open, and a run's denominator
 * is the collection's size when the attempt began.
 */
function enterRun(context: PlaybackContext | null, trackCount: number): LocalRun | null {
  const storage = playerStorage();

  if (!context) {
    closeRun(false, true);
    store().setContext(null);
    return null;
  }

  const open = storage.getOpenRun();
  if (open && sameContext({ type: open.contextType, key: open.contextKey }, context)) {
    const reused: LocalRun = { ...open, updatedAt: nowMs() };
    storage.setOpenRun(reused);
    store().setContext(context);
    return reused;
  }

  if (open) {
    closeRun(false, true);
  }

  const run: LocalRun = {
    clientId: crypto.randomUUID(),
    contextType: context.type,
    contextKey: context.key,
    contextTitle: context.title,
    trackCount: Math.max(0, Math.round(trackCount)),
    startedAt: nowMs(),
    endedAt: null,
    lastIndex: 0,
    lastTrackId: null,
    lastPositionSec: 0,
    listenedSec: 0,
    finishedCount: 0,
    completed: false,
    interrupted: false,
    updatedAt: nowMs(),
  };

  storage.setOpenRun(run);
  store().setContext(context);
  return run;
}

// ── Sessions ───────────────────────────────────────────────────────────────

function writeCheckpoint(): void {
  if (!session) {
    return;
  }
  const position = tracker?.lastPositionSec ?? session.lastPositionSec;
  playerStorage().setCheckpoint({
    session: { ...session, lastPositionSec: position },
    timestamp: nowMs(),
  });
}

function queuedSessionFrom(
  draft: LocalSessionDraft,
  input: { endedAt: number; completed: boolean; interrupted: boolean },
): QueuedSession {
  const endPositionSec = Math.max(0, Math.round(tracker?.lastPositionSec ?? draft.lastPositionSec));
  const end = Math.max(Math.round(input.endedAt), Math.round(draft.startedAt));

  return {
    clientId: draft.clientId,
    contentHash: draft.contentHash,
    startedAt: Math.round(draft.startedAt),
    endedAt: end,
    startPositionSec: Math.round(draft.startPositionSec),
    endPositionSec,
    durationListenedSec: Math.max(0, Math.round(draft.durationListenedSec)),
    playbackSpeed: draft.playbackSpeed,
    completed: input.completed,
    interrupted: input.interrupted,
    ...(deviceInfo() === undefined ? {} : { deviceInfo: deviceInfo() }),
    ...(draft.contextPlayId === null ? {} : { contextPlayId: draft.contextPlayId }),
    ...(draft.contextType === null ? {} : { contextType: draft.contextType }),
    ...(draft.contextKey === null ? {} : { contextKey: draft.contextKey }),
    stretchId: draft.stretchId,
    seeked: draft.seeked,
  };
}

function startSession(atPosition: number): void {
  if (session) {
    return;
  }
  const track = currentTrack();
  if (!track || track.origin === "local") {
    return;
  }

  const state = store();
  const open = playerStorage().getOpenRun();
  const context = state.context;
  const clientId = crypto.randomUUID();
  const startedAt = nowMs();
  const position = Math.max(0, atPosition);
  const stretchId = stretchHandover ?? crypto.randomUUID();
  stretchHandover = null;

  session = {
    clientId,
    contentHash: track.contentHash,
    startedAt,
    startPositionSec: Math.round(position),
    playbackSpeed: state.playbackSpeed,
    lastPositionSec: position,
    durationListenedSec: 0,
    lastCheckpointAtMs: startedAt,
    contextPlayId:
      open && context && sameContext({ type: open.contextType, key: open.contextKey }, context) ? open.clientId : null,
    contextType: context?.type ?? null,
    contextKey: context?.key ?? null,
    stretchId,
    seeked: false,
  };

  tracker = createSessionTracker({
    sessionId: clientId,
    startedAtMs: startedAt,
    startPositionSec: position,
    playbackSpeed: state.playbackSpeed,
  });

  seekPending = false;
  writeCheckpoint();
  touchRun(position);

  // Lazily register the track so a session can never be sent ahead of its
  // track. The stored row is tiny and the sync runner owns the round trip.
  const pending = pendingTrackFor(track);
  if (pending && !playerStorage().isRegistered(pending.contentHash)) {
    playerStorage().upsertPendingTrack(pending);
    void queueSync("registration");
  }
}

function finalizeSession(input: { completed: boolean; interrupted: boolean }): void {
  if (!session || !tracker) {
    return;
  }

  // Accumulate the last delta before closing, but never invent a seek.
  const final = applyProgress(tracker, {
    positionSec: tracker.lastPositionSec,
    atMs: nowMs(),
    playbackSpeed: store().playbackSpeed,
    seeked: seekPending,
  });
  tracker = final.state;
  session.lastPositionSec = final.state.lastPositionSec;
  session.durationListenedSec = final.state.durationListenedSec;
  if (final.isSeek) {
    session.seeked = true;
  }

  const queued = queuedSessionFrom(session, {
    endedAt: nowMs(),
    completed: input.completed,
    interrupted: input.interrupted,
  });

  playerStorage().upsertSession(queued);
  if (queued.contextPlayId) {
    playerStorage().addToRunTally(
      queued.contextPlayId,
      queued.durationListenedSec,
      queued.completed ? queued.contentHash : null,
    );
  }

  playerStorage().setCheckpoint(null);
  session = null;
  tracker = null;
  seekPending = false;
  void queueSync("session");
}

/** Recover a checkpoint left by a closed tab. Never creates a duplicate. */
function recoverCheckpoint(): void {
  const storage = playerStorage();
  const checkpoint = storage.getCheckpoint();
  if (!checkpoint) {
    return;
  }

  if (storage.getSessions().some((row) => row.clientId === checkpoint.session.clientId)) {
    storage.setCheckpoint(null);
    return;
  }

  const draft = checkpoint.session;
  const end = Math.max(Math.round(checkpoint.timestamp), Math.round(draft.startedAt));
  const queued: QueuedSession = {
    clientId: draft.clientId,
    contentHash: draft.contentHash,
    startedAt: Math.round(draft.startedAt),
    endedAt: end,
    startPositionSec: Math.round(draft.startPositionSec),
    endPositionSec: Math.max(0, Math.round(draft.lastPositionSec)),
    durationListenedSec: Math.max(0, Math.round(draft.durationListenedSec)),
    playbackSpeed: draft.playbackSpeed,
    completed: false,
    interrupted: true,
    ...(deviceInfo() === undefined ? {} : { deviceInfo: deviceInfo() }),
    ...(draft.contextPlayId === null ? {} : { contextPlayId: draft.contextPlayId }),
    ...(draft.contextType === null ? {} : { contextType: draft.contextType }),
    ...(draft.contextKey === null ? {} : { contextKey: draft.contextKey }),
    stretchId: draft.stretchId,
    seeked: draft.seeked,
  };

  storage.upsertSession(queued);
  if (queued.contextPlayId) {
    storage.addToRunTally(queued.contextPlayId, queued.durationListenedSec, null);
  }
  storage.setCheckpoint(null);
  void queueSync("checkpoint-recovery");
}

// ── Loading ────────────────────────────────────────────────────────────────

function markLocalState(track: PlayerTrack): void {
  engine.stop();
  store().setStatus("paused");
  store().setDuration(track.durationSec);
  store().setPosition(0);
  store().setWaiting(null);
  store().setError(null);
  store().setBlocked(false);
  setMediaMetadata(track);
  setMediaPlaybackState("paused");
}

async function loadCurrent(input: {
  autoplay: boolean;
  startPositionSec?: number;
  resumePin?: number | null;
}): Promise<void> {
  const track = currentTrack();
  if (!track) {
    return;
  }

  if (track.origin === "local") {
    markLocalState(track);
    return;
  }

  const requested = input.startPositionSec ?? 0;
  const startPositionSec = track.isLive
    ? 0
    : clampResumePosition(requested, track.durationSec);

  store().setStatus("loading");
  store().setWaiting(null);
  store().setError(null);
  store().setBlocked(false);
  store().setDuration(track.durationSec);
  store().setPosition(startPositionSec);
  store().setResumeFrom(input.resumePin ?? null);
  setMediaMetadata(track);
  setMediaPlaybackState("loading");

  if (!track.sourceId || !track.externalId) {
    store().setStatus("error");
    store().setError("این قطعه نشانی منبع ندارد.");
    return;
  }

  let resolution;
  try {
    resolution = await resolveStreamUrl({
      sourceId: track.sourceId,
      externalId: track.externalId,
      collectionKey: track.collectionKey ?? track.sourceId,
    });
  } catch (error) {
    store().setStatus("error");
    store().setError(errorMessageFor(error));
    return;
  }

  // The listener may have moved on while the source was answering.
  if (currentTrack()?.contentHash !== track.contentHash) {
    return;
  }

  const withDuration =
    track.durationSec > 0 ? track : { ...track, durationSec: resolution.durationSec };
  if (withDuration !== track) {
    store().setCurrent(withDuration);
    store().setDuration(withDuration.durationSec);
  }

  engine.load(withDuration, {
    streamUrl: resolution.streamUrl,
    startPositionSec,
  });
  touchRun(startPositionSec);

  if (input.autoplay) {
    const result = await engine.play();
    if (!result.ok && result.reason === "blocked") {
      store().setBlocked(true);
      store().setWaiting(null);
      store().setStatus("paused");
    }
  }
}

/**
 * A playback error gets exactly one re-resolution. If the second attempt fails,
 * the player shows a retry button rather than looping (brief §1).
 */
async function reResolveAfterError(): Promise<void> {
  const track = currentTrack();
  if (!track || track.origin === "local") {
    return;
  }
  if (reResolvedHash === track.contentHash) {
    return;
  }

  reResolvedHash = track.contentHash;
  const position = store().positionSec;
  await loadCurrent({ autoplay: false, startPositionSec: position });
  reResolvedHash = track.contentHash;
  if (store().status !== "error") {
    const result = await engine.play();
    if (!result.ok && result.reason === "blocked") {
      store().setBlocked(true);
      store().setStatus("paused");
    }
  }
}

// ── Engine events ──────────────────────────────────────────────────────────

function onProgress(positionSec: number, atMs: number): void {
  if (!session || !tracker) {
    if (store().status === "playing") {
      startSession(positionSec);
    }
    return;
  }

  const result = applyProgress(tracker, {
    positionSec,
    atMs,
    playbackSpeed: store().playbackSpeed,
    seeked: seekPending,
  });

  tracker = result.state;
  seekPending = false;
  session.lastPositionSec = positionSec;
  session.durationListenedSec = result.state.durationListenedSec;
  if (result.isSeek) {
    session.seeked = true;
  }

  if (result.checkpointDue) {
    writeCheckpoint();
  }
  touchRun(positionSec);
}

function handleEnded(): void {
  if (advancing) {
    return;
  }
  advancing = true;

  const endedStretch = session?.stretchId ?? null;
  const timestamp = store().durationSec;
  if (tracker) {
    tracker = { ...tracker, lastPositionSec: timestamp };
  }
  if (session) {
    session.lastPositionSec = timestamp;
  }
  finalizeSession({ completed: true, interrupted: false });

  const state = store();
  state.setStatus("ended");
  state.setPosition(state.durationSec);
  setMediaPlaybackState("ended");

  const idx = nextIndex(state.queueIndex, state.queue.length);
  if (idx > state.queueIndex) {
    stretchHandover = endedStretch;
    state.setQueueIndex(idx);
    state.setCurrent(state.queue[idx] ?? null);
    state.signalSkip(1);
    void loadCurrent({ autoplay: true, startPositionSec: 0 });
  } else {
    // The queue ran out: the run is done, and the last track stays on screen.
    stretchHandover = null;
    closeRun(true, false);
  }

  // A duplicate `ended` for the same element is possible; ignore it, but do not
  // leave the guard closed for the next track.
  setTimeout(() => {
    advancing = false;
  }, 0);
}

function handleEngineEvent(event: EngineEvent): void {
  const state = store();

  switch (event.type) {
    case "loadedmetadata": {
      state.setDuration(event.durationSec);
      state.setError(null);
      if (event.live && state.current) {
        const liveTrack = { ...state.current, isLive: true };
        state.setCurrent(liveTrack);
        state.setDuration(0);
        state.setPosition(0);
      }
      break;
    }
    case "timeupdate": {
      state.setPosition(event.positionSec);
      onProgress(event.positionSec, event.atMs);
      updateMediaPosition();
      break;
    }
    case "playing": {
      state.setStatus("playing");
      state.setWaiting(null);
      state.setBlocked(false);
      startSession(engine.getSnapshot().positionSec);
      setMediaPlaybackState("playing");
      updateMediaPosition();
      break;
    }
    case "pause": {
      state.setStatus("paused");
      setMediaPlaybackState("paused");
      finalizeSession({ completed: false, interrupted: false });
      break;
    }
    case "ended": {
      handleEnded();
      break;
    }
    case "seeking": {
      seekPending = true;
      if (session) {
        session.seeked = true;
      }
      break;
    }
    case "seeked": {
      seekPending = true;
      if (session) {
        session.seeked = true;
      }
      state.setPosition(engine.getSnapshot().positionSec);
      break;
    }
    case "waiting":
    case "stalled": {
      if (state.status !== "playing" && state.status !== "loading") {
        break;
      }
      if (!state.waiting) {
        state.setWaiting({
          kind: session ? "buffering" : "connecting",
          since: nowMs(),
          stream: state.current?.origin !== "local",
        });
      }
      break;
    }
    case "canplay": {
      state.setWaiting(null);
      break;
    }
    case "error": {
      state.setWaiting(null);
      state.setStatus("error");
      state.setError("پخش ممکن نشد.");
      finalizeSession({ completed: false, interrupted: true });
      setMediaPlaybackState("none");
      void reResolveAfterError();
      break;
    }
    case "autoplayBlocked": {
      state.setStatus("paused");
      state.setWaiting(null);
      state.setBlocked(true);
      break;
    }
    case "ratechange": {
      state.setSpeed(event.rate);
      break;
    }
    case "volumechange": {
      state.setVolume(event.volume);
      state.setMuted(event.muted);
      break;
    }
    default:
      break;
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────

/**
 * Idempotent. Called from the shell's player boundary; safe in StrictMode and
 * after a bfcache restore.
 */
export function ensurePlayer(): void {
  if (booted || typeof window === "undefined") {
    return;
  }
  booted = true;

  engine.onEvent(handleEngineEvent);
  installMediaHandlers();
  recoverCheckpoint();
  startSyncTriggers();
  void queueSync("boot");

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      writeCheckpoint();
    }
  });

  window.addEventListener("pagehide", (event) => {
    // A bfcache page is frozen, not closed: continue where it left off. The
    // synchronous checkpoint is still the durability guarantee.
    writeCheckpoint();
    if (!event.persisted) {
      // Do not finalize: audio may have kept playing until the last moment.
      // The next boot turns the checkpoint into an interrupted session.
    }
  });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      if (!session) {
        recoverCheckpoint();
      } else {
        writeCheckpoint();
      }
    }
  });
}

// ── Public actions ─────────────────────────────────────────────────────────

/**
 * Start a queue from a deliberate click. A new queue starts a new stretch; a
 * queue with a context opens or re-enters a run.
 */
export async function playQueueAt(
  tracks: PlayerTrack[],
  index: number,
  options: {
    startPositionSec?: number;
    context?: PlaybackContext | null;
    resumePin?: number | null;
  } = {},
): Promise<void> {
  ensurePlayer();
  if (tracks.length === 0) {
    return;
  }

  const safeIndex = clampIndex(index, tracks.length);
  if (safeIndex < 0) {
    return;
  }

  finalizeSession({ completed: false, interrupted: true });
  stretchHandover = null;
  reResolvedHash = null;

  const state = store();
  const context = options.context ?? null;
  state.setQueue(tracks, safeIndex, context);
  enterRun(context, tracks.length);

  const track = tracks[safeIndex] ?? null;
  state.setCurrent(track);
  state.setResumeFrom(options.resumePin ?? null);
  if (track) {
    await loadCurrent({
      autoplay: true,
      startPositionSec: options.startPositionSec ?? 0,
      resumePin: options.resumePin ?? null,
    });
  }
}

export async function next(): Promise<void> {
  const state = store();
  if (state.queueIndex < 0 || state.queue.length === 0) {
    return;
  }

  finalizeSession({ completed: false, interrupted: true });
  stretchHandover = null;
  reResolvedHash = null;

  const idx = nextIndex(state.queueIndex, state.queue.length);
  if (idx === state.queueIndex) {
    // At the end, restart the current track; mobile does not wrap.
    state.setPosition(0);
    engine.seek(0);
    await engine.play();
    return;
  }

  state.setQueueIndex(idx);
  state.setCurrent(state.queue[idx] ?? null);
  state.signalSkip(1);
  await loadCurrent({ autoplay: true, startPositionSec: 0 });
}

export async function previous(): Promise<void> {
  const state = store();
  if (state.queueIndex < 0 || state.queue.length === 0) {
    return;
  }

  finalizeSession({ completed: false, interrupted: true });
  stretchHandover = null;
  reResolvedHash = null;

  const idx = previousIndex(state.queueIndex, state.queue.length);
  if (idx === state.queueIndex) {
    state.setPosition(0);
    engine.seek(0);
    await engine.play();
    return;
  }

  state.setQueueIndex(idx);
  state.setCurrent(state.queue[idx] ?? null);
  state.signalSkip(-1);
  await loadCurrent({ autoplay: true, startPositionSec: 0 });
}

/** A jump is a new session, not a new run. */
export async function jumpTo(index: number): Promise<void> {
  const state = store();
  const idx = clampIndex(index, state.queue.length);
  if (idx < 0 || idx === state.queueIndex) {
    return;
  }

  finalizeSession({ completed: false, interrupted: true });
  stretchHandover = null;
  reResolvedHash = null;

  state.setQueueIndex(idx);
  state.setCurrent(state.queue[idx] ?? null);
  state.signalSkip(idx > state.queueIndex ? 1 : -1);
  await loadCurrent({ autoplay: true, startPositionSec: 0 });
}

/** Append without changing the current item; an empty queue loads but waits. */
export async function enqueue(tracks: PlayerTrack[]): Promise<void> {
  if (tracks.length === 0) {
    return;
  }
  const state = store();
  if (state.queue.length === 0) {
    state.setQueue(tracks, 0, state.context);
    state.setCurrent(tracks[0] ?? null);
    await loadCurrent({ autoplay: false, startPositionSec: 0 });
    return;
  }
  state.setQueue([...state.queue, ...tracks], state.queueIndex, state.context);
}

export async function removeQueueItem(index: number): Promise<void> {
  const state = store();
  const result = removeQueueAt(state.queue, index, state.queueIndex);
  if (result.queue.length === state.queue.length) {
    return;
  }

  const wasPlaying = state.status === "playing";

  if (result.removedCurrent) {
    finalizeSession({ completed: false, interrupted: true });
    stretchHandover = null;
  }

  if (result.queue.length === 0) {
    engine.stop();
    closeRun(false, true);
    state.setQueue([], -1, state.context);
    state.setCurrent(null);
    state.setStatus("idle");
    state.setPosition(0);
    state.setDuration(0);
    state.setWaiting(null);
    setMediaMetadata(null);
    return;
  }

  state.setQueue(result.queue, result.index, state.context);

  if (result.removedCurrent) {
    state.setCurrent(result.queue[result.index] ?? null);
    if (state.current) {
      await loadCurrent({ autoplay: wasPlaying, startPositionSec: 0 });
    }
  }
}

/** Reorder without changing what is playing. */
export function moveQueueItem(from: number, to: number): void {
  const state = store();
  const result = moveItem(state.queue, from, to, state.queueIndex);
  if (result.queue === state.queue) {
    return;
  }
  state.setQueue(result.queue, result.index, state.context);
}

export async function play(): Promise<void> {
  ensurePlayer();
  const state = store();
  if (!state.current || state.current.origin === "local") {
    return;
  }

  if (state.status === "ended") {
    state.setPosition(0);
    engine.seek(0);
  }

  state.setBlocked(false);
  const result = await engine.play();
  if (!result.ok && result.reason === "blocked") {
    state.setBlocked(true);
    state.setStatus("paused");
    state.setWaiting(null);
  }
}

export function pause(): void {
  engine.pause();
}

export async function togglePlay(): Promise<void> {
  const state = store();
  if (state.status === "playing") {
    pause();
    return;
  }
  if (state.status === "error") {
    store().setError(null);
    reResolvedHash = null;
    await retry();
    return;
  }
  await play();
}

export function seek(sec: number): void {
  const state = store();
  if (!state.current || state.current.isLive) {
    return;
  }
  const target =
    state.durationSec > 0
      ? Math.max(0, Math.min(state.durationSec, Math.round(sec)))
      : Math.max(0, Math.round(sec));

  if (session) {
    session.seeked = true;
  }
  seekPending = true;
  engine.seek(target);
  state.setPosition(target);
  touchRun(target);
}

export function seekBy(deltaSec: number): void {
  seek(store().positionSec + deltaSec);
}

export function setSpeed(rate: number): void {
  const state = store();
  state.setSpeed(rate);
  engine.setRate(rate);

  if (session) {
    const stretch = session.stretchId;
    // A speed change splits the session but not the listen: it is the same
    // stretch, and the next session inherits it deliberately.
    finalizeSession({ completed: false, interrupted: false });
    if (state.status === "playing") {
      stretchHandover = stretch;
      startSession(engine.getSnapshot().positionSec);
    }
  }
}

export function setVolume(volume: number): void {
  engine.setVolume(volume);
}

export function toggleMute(): void {
  const state = store();
  engine.setMuted(!state.muted);
}

/**
 * A retry re-resolves once and reloads at the current position. A local track
 * has no retry; it has a state.
 */
export async function retry(): Promise<void> {
  const state = store();
  if (!state.current || state.current.origin === "local") {
    return;
  }
  reResolvedHash = null;
  store().setError(null);
  await loadCurrent({ autoplay: true, startPositionSec: state.positionSec });
}

/** Closing is not pausing: the run closes and the bar disappears. */
export function closePlayer(): void {
  finalizeSession({ completed: false, interrupted: true });
  closeRun(false, true);
  stretchHandover = null;
  session = null;
  tracker = null;
  engine.stop();
  playerStorage().setCheckpoint(null);
  setMediaMetadata(null);
  setMediaPlaybackState("none");
  store().reset();
}

/** A thin read for components that need the live element position for a11y. */
export function snapshot(): EngineSnapshot {
  return engine.getSnapshot();
}

/** Exposed for the deep-link path: the playhead a run would resume at. */
export function resumeTargetFor(track: PlayerTrack, context: PlaybackContext | null): number {
  if (track.isLive) {
    return 0;
  }
  const run = playerStorage().getOpenRun();
  if (context && run && sameContext({ type: run.contextType, key: run.contextKey }, context) && run.endedAt === null) {
    return run.completed ? 0 : clampResumePosition(run.lastPositionSec, track.durationSec);
  }
  return 0;
}

export { isCurrentLocal, isLiveSource };
