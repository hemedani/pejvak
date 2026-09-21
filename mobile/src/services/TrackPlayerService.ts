import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";
import Constants, { ExecutionEnvironment } from "expo-constants";

import type { LocalTrack } from "@/lib/db/types";
import { sameContext, type PlaybackContext } from "@/lib/playbackContext";
import { resumePositionSec } from "@/lib/resume";
import {
  applyProgress,
  createSessionTracker,
  type SessionTrackerState,
} from "@/lib/sessionTracking";
import { LocalDBService } from "@/services/LocalDBService";
import { isLocationReachable } from "@/services/FileLocationService";
import { syncPending } from "@/services/SyncService";
import { usePlayerStore, type PlayerPatch } from "@/store/playerStore";
import { useSettingsStore } from "@/store/settingsStore";

type ActiveSession = {
  track: LocalTrack;
  sessionId: string;
  tracker: SessionTrackerState;
  deviceInfo: string | null;
};

/**
 * The run currently open in `context_plays`, when the queue belongs to a
 * collection. This is a cache of the database row, not the record itself — see
 * `openRun` for why it is re-read rather than trusted after a cold start.
 */
type ActiveRun = {
  id: string;
  context: PlaybackContext;
  trackCount: number;
};

/**
 * Expo Go has no audio foreground service (the config-plugin-generated
 * `AudioControlsService` only exists in a development/production build), so
 * lock-screen/background features are unavailable there.
 */
const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let player: AudioPlayer | null = null;
let currentTrack: LocalTrack | null = null;
let active: ActiveSession | null = null;
let activeRun: ActiveRun | null = null;
/**
 * The listening stretch the current session belongs to.
 *
 * A session is one continuous listen, not one track: the id is carried across an
 * automatic advance so the History list can show "started here, stopped there"
 * as a single entry. Anything the listener does deliberately — skipping,
 * pausing, opening another queue — ends it, and the next listen starts a new one.
 */
let activeStretchId: string | null = null;
/**
 * The stretch the *next* session continues, handed over only by auto-advance.
 *
 * Held as its own handover rather than inferred from the previous session's
 * `completed` flag: a queue that merely ran out would leave that flag set, and
 * whatever the listener played next would silently join a stretch it was never
 * part of.
 */
let pendingStretchId: string | null = null;
/** Set once per session, so dragging the scrubber costs one write, not fifty. */
let seekReported = false;
let sessionStarting = false;
let advancing = false;
let wasPlaying = false;
let configured = false;
let lockScreenFailed = IS_EXPO_GO;
let pendingSeekSec: number | null = null;
let nextSessionStartSec = 0;

/**
 * Tracks already reported as unreachable, so a player that keeps failing does
 * not re-run the check on every status tick. An id is dropped again if the file
 * turns out to be reachable after all, so a genuinely later deletion is still
 * caught.
 */
const reportedUnreachable = new Set<string>();

function patch(partial: PlayerPatch) {
  usePlayerStore.getState().patch(partial);
}

function getPlayer(): AudioPlayer {
  if (!player) {
    player = createAudioPlayer(null, { updateInterval: 1000 });
    player.addListener("playbackStatusUpdate", handleStatus);
  }
  return player;
}

/** Configure background playback once. Safe to call repeatedly. */
export async function configureAudio(): Promise<void> {
  if (configured) {
    return;
  }
  configured = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: !IS_EXPO_GO,
      interruptionMode: "doNotMix",
    });
  } catch {
    // Best-effort: Expo Go has no background audio service, and playback still
    // works in the foreground.
  }
}

/**
 * Makes `context` the collection being played, and returns the id of the run
 * that records it.
 *
 * A run is one *attempt* at listening through a collection, and it deliberately
 * outlives a single app session: a book heard over five commutes is one attempt,
 * and closing the run at every launch would report it as five plays, none of
 * them finished. So an open run is looked up in the database before a new one is
 * made — the module-level copy above is only a cache, and it is empty after a
 * cold start.
 *
 * Every *other* open run is closed first. That keeps the invariant that at most
 * one run is open, which is what stops an abandoned collection from being
 * credited with the tracks played in a different one.
 */
async function openRun(context: PlaybackContext, trackCount: number): Promise<string> {
  if (activeRun && sameContext(activeRun.context, context)) {
    return activeRun.id;
  }

  const open = await LocalDBService.getOpenContextPlays();
  const resumable = open.find((run) =>
    sameContext({ type: run.contextType, key: run.contextKey }, context),
  );

  for (const run of open) {
    if (run.id !== resumable?.id) {
      await LocalDBService.finalizeContextPlay(run.id, {
        endedAt: Date.now(),
        completed: false,
        interrupted: true,
      });
    }
  }

  if (resumable) {
    // The track count is the collection's size when the attempt began, not its
    // size now: a run whose denominator grew mid-listen would report progress
    // that never happened.
    activeRun = { id: resumable.id, context, trackCount: resumable.trackCount };
    return resumable.id;
  }

  const created = await LocalDBService.insertContextPlay({
    contextType: context.type,
    contextKey: context.key,
    contextTitle: context.title,
    trackCount,
    startedAt: Date.now(),
  });
  activeRun = { id: created.id, context, trackCount };
  return created.id;
}

/**
 * Ends the open run. `completed` means the queue genuinely ran out, which is
 * what "this collection has been listened to" means.
 *
 * The store's `context` is deliberately left alone: the collection is still the
 * one loaded, and the mini-player should keep offering to open it after the last
 * track ends.
 */
async function closeRun(options: { completed: boolean; interrupted: boolean }): Promise<void> {
  const run = activeRun;
  if (!run) {
    return;
  }
  activeRun = null;
  await LocalDBService.finalizeContextPlay(run.id, {
    endedAt: Date.now(),
    completed: options.completed,
    interrupted: options.interrupted,
  });
}

/**
 * Records where the run has got to. Called on every track change and on every
 * checkpoint, which is what lets "continue this folder" land on the right
 * lecture *and* the right second inside it.
 *
 * The write deliberately does not dirty `sync_status` — a run is only worth
 * sending once it has ended.
 */
function touchRun(trackId: string, positionSec: number): void {
  const run = activeRun;
  if (!run) {
    return;
  }
  void LocalDBService.touchContextPlay(run.id, {
    lastIndex: usePlayerStore.getState().queueIndex,
    lastTrackId: trackId,
    lastPositionSec: positionSec,
  }).catch(() => undefined);
}

async function beginSession(
  track: LocalTrack,
  startPositionSec: number,
  playbackSpeed: number,
): Promise<void> {
  if (active || sessionStarting) {
    return;
  }
  sessionStarting = true;
  try {
    const startedAt = Date.now();
    // Read once, at the top: `activeRun` can be replaced by the time the insert
    // resolves, and the session belongs to the run that was playing when it
    // started, not to whichever one is current afterwards.
    const run = activeRun;
    // Automatic progression hands the current stretch forward; every other way
    // into a track starts a new one. Consumed here so it cannot outlive the
    // handover it was set for.
    const stretchId = pendingStretchId ?? LocalDBService.newStretchId();
    pendingStretchId = null;
    activeStretchId = stretchId;
    seekReported = false;
    const session = await LocalDBService.insertSession({
      trackId: track.id,
      contentHash: track.contentHash,
      startedAt,
      startPositionSec,
      playbackSpeed,
      contextPlayId: run?.id ?? null,
      contextType: run?.context.type ?? null,
      contextKey: run?.context.key ?? null,
      stretchId,
    });
    active = {
      track,
      sessionId: session.id,
      tracker: createSessionTracker({
        sessionId: session.id,
        startedAtMs: startedAt,
        startPositionSec,
        playbackSpeed,
      }),
      deviceInfo: null,
    };
  } finally {
    sessionStarting = false;
  }
}

async function writeCheckpoint(): Promise<void> {
  if (!active) {
    return;
  }
  await LocalDBService.saveCheckpoint({
    sessionId: active.sessionId,
    trackId: active.track.id,
    contentHash: active.track.contentHash,
    positionSec: active.tracker.lastPositionSec,
    lastPositionSec: active.tracker.lastPositionSec,
    durationListenedSec: active.tracker.durationListenedSec,
    playbackSpeed: active.tracker.playbackSpeed,
    startedAt: active.tracker.startedAtMs,
    timestamp: Date.now(),
    deviceInfo: active.deviceInfo,
    contextPlayId: activeRun?.id ?? null,
    stretchId: activeStretchId,
  });
  touchRun(active.track.id, active.tracker.lastPositionSec);
}

/**
 * Records that the listener scrubbed.
 *
 * A scrub is not a session boundary — what is being listened to has not changed
 * — but it does mean the stretch was not heard straight through, and that is
 * what separates a complete listen from a merely finished one. Written the
 * moment it happens rather than at finalize, so a listen cut short by a kill
 * still knows; guarded by a flag, so a drag across the scrubber is one write.
 */
function reportSeek(): void {
  const session = active;
  if (!session || seekReported) {
    return;
  }
  seekReported = true;
  void LocalDBService.markSessionSeeked(session.sessionId).catch(() => undefined);
}

async function finishSession(options: {
  completed: boolean;
  interrupted: boolean;
}): Promise<void> {
  const session = active;
  if (!session) {
    return;
  }
  active = null;
  // The listen is over, so the stretch ends with it. An automatic advance has
  // already taken a copy to hand on before getting here.
  activeStretchId = null;
  await LocalDBService.finalizeSession(session.sessionId, {
    endedAt: Date.now(),
    endPositionSec: Math.round(session.tracker.lastPositionSec),
    durationListenedSec: Math.round(session.tracker.durationListenedSec),
    completed: options.completed,
    interrupted: options.interrupted,
  });
  await LocalDBService.deleteCheckpoint(session.sessionId);
  patch({ status: options.completed ? "ended" : "paused" });
  void syncPending().catch(() => undefined);
}

/**
 * A load failure is the other place a file goes missing: the listener taps a
 * track whose file was deleted, and nothing has scanned since to notice. The
 * store already shows the error — this is what lets the Missing files screen
 * learn about it, so the row can be offered a relink instead of failing again
 * on every tap.
 *
 * The decision is made by looking at the file, not by reading `status.error`:
 * the message is not a stable contract, and a transient failure must not flag a
 * track that is still there.
 */
function reportUnreachableTrack(): void {
  const track = currentTrack;
  if (!track || reportedUnreachable.has(track.id)) {
    return;
  }
  reportedUnreachable.add(track.id);
  void (async () => {
    // `fileUri` is the URI that was actually handed to the player, and it cannot
    // be null here: `loadAndPlay` refuses a track without one and is the only
    // place `currentTrack` is set.
    const reachable = await isLocationReachable(track.fileUri);
    if (reachable) {
      reportedUnreachable.delete(track.id);
      return;
    }
    await LocalDBService.setTrackAvailability(track.id, "missing");
    void syncPending().catch(() => undefined);
  })().catch(() => undefined);
}

/**
 * Move to the next queued track after one finishes, and close the run when the
 * queue runs out.
 *
 * Deliberately not `next()`: that signals a *skip*, and the artwork's kick
 * belongs to a gesture the listener made, not to a track that ended by itself.
 * A manual skip at the end of the queue also restarts the current track, which
 * is right for "there is nothing after this one" but wrong here — a track that
 * finished has nothing left to restart.
 */
async function advanceAfterFinish(stretchId: string | null): Promise<void> {
  const { queue, queueIndex } = usePlayerStore.getState();
  const targetIndex = queueIndex + 1;
  const targetId = queue[targetIndex];
  if (!targetId) {
    await closeRun({ completed: true, interrupted: false });
    patch({ status: "ended" });
    return;
  }
  usePlayerStore.getState().setQueue(queue, targetIndex);
  // The listener did not choose this track, so it is the same listen. Every
  // other route into a track leaves this null and so starts a new stretch.
  pendingStretchId = stretchId;
  await playTrackById(targetId, 0);
}

function handleStatus(status: AudioStatus): void {
  const currentTime = Number.isFinite(status.currentTime) ? status.currentTime : 0;
  const current = usePlayerStore.getState();
  patch({
    positionSec: Math.floor(currentTime),
    durationSec: status.duration > 0 ? Math.floor(status.duration) : current.durationSec,
  });

  if (status.error) {
    patch({ status: "error", error: status.error });
    reportUnreachableTrack();
    return;
  }

  if (pendingSeekSec !== null && status.isLoaded) {
    const target = pendingSeekSec;
    pendingSeekSec = null;
    void player?.seekTo(target).catch(() => undefined);
  }

  if (status.didJustFinish) {
    // `didJustFinish` can be reported on more than one status tick, and two
    // advances from one ending would silently skip a track. The guard is a plain
    // module flag rather than state, for the same reason `sessionStarting` is:
    // state is a render behind, so two ticks in one frame would both read it as
    // free.
    if (advancing) {
      return;
    }
    advancing = true;
    wasPlaying = false;
    void (async () => {
      try {
        // Taken before the session is closed, because closing it ends the
        // stretch — and a track ending by itself is not the listener stopping,
        // so the next track is still the same listen.
        const stretch = activeStretchId;
        await finishSession({ completed: true, interrupted: false });
        await advanceAfterFinish(stretch);
      } finally {
        advancing = false;
      }
    })();
    return;
  }

  if (status.playing) {
    patch({ status: "playing" });
    if (!active && currentTrack && !sessionStarting) {
      const speed = status.playbackRate || 1;
      const start = nextSessionStartSec > 0 ? nextSessionStartSec : currentTime;
      nextSessionStartSec = 0;
      void beginSession(currentTrack, start, speed);
    }
    if (active) {
      const result = applyProgress(active.tracker, {
        positionSec: currentTime,
        atMs: Date.now(),
      });
      active.tracker = result.state;
      if (result.checkpointDue) {
        void writeCheckpoint();
      }
      if (result.isSeek) {
        reportSeek();
      }
    }
  } else if (wasPlaying) {
    void finishSession({ completed: false, interrupted: false });
  }

  wasPlaying = status.playing;
}

export async function loadAndPlay(track: LocalTrack, startPositionSec = 0): Promise<void> {
  if (!track.fileUri) {
    patch({ status: "error", error: "This track has no local audio file." });
    return;
  }

  await configureAudio();
  await finishSession({ completed: false, interrupted: true });

  currentTrack = track;
  nextSessionStartSec = Math.round(startPositionSec);
  pendingSeekSec = startPositionSec > 0 ? startPositionSec : null;

  const defaultSpeed = useSettingsStore.getState().defaultSpeed;

  patch({
    status: "loading",
    trackId: track.id,
    title: track.title,
    artist: track.author,
    artworkUrl: track.artworkUrl,
    contentHash: track.contentHash,
    isAudiobook: track.isAudiobook,
    positionSec: Math.floor(startPositionSec),
    durationSec: track.durationSec,
    playbackSpeed: defaultSpeed,
    error: null,
  });

  const instance = getPlayer();
  instance.replace({ uri: track.fileUri });
  instance.setPlaybackRate(defaultSpeed);
  if (!lockScreenFailed) {
    try {
      instance.setActiveForLockScreen(
        true,
        {
          title: track.title,
          artist: track.author ?? undefined,
          albumTitle: track.isAudiobook ? "Audiobook" : "Music",
          artworkUrl: track.artworkUrl ?? undefined,
        },
        { showSeekBackward: true, showSeekForward: true },
      );
    } catch {
      // Expo Go has no audio foreground service; playback still works.
      lockScreenFailed = true;
    }
  }
  instance.play();
}

export function pause(): void {
  player?.pause();
}

export function resume(): void {
  void configureAudio();
  player?.play();
}

export function togglePlayPause(): void {
  const instance = player;
  if (!instance) {
    return;
  }
  if (instance.playing) {
    instance.pause();
  } else {
    void configureAudio().then(() => instance.play());
  }
}

export async function seekTo(positionSec: number): Promise<void> {
  const instance = getPlayer();
  await instance.seekTo(positionSec);
  if (active) {
    active.tracker = applyProgress(active.tracker, {
      positionSec,
      atMs: Date.now(),
    }).state;
    // Reported here rather than left to the next status tick: the tracker has
    // already moved, so that tick sees a small delta and would miss the scrub.
    reportSeek();
  }
  patch({ positionSec: Math.floor(positionSec) });
}

/** A speed change ends the current session and (if playing) starts a new one. */
export async function setPlaybackRate(rate: number): Promise<void> {
  const instance = getPlayer();
  const wasPlayingNow = instance.playing;
  if (active) {
    await finishSession({ completed: false, interrupted: false });
  }
  instance.setPlaybackRate(rate);
  patch({ playbackSpeed: rate });
  if (wasPlayingNow) {
    nextSessionStartSec = Math.round(instance.currentTime);
    instance.play();
  }
}

/**
 * Start a queue at `index`. The queue is just an ordered list of track ids; the
 * player resolves them lazily so a long library does not need to be hydrated.
 *
 * `context` names the folder or playlist the queue came from. Passing one opens
 * — or re-opens — a run, so the collection's history is recorded and the player
 * can offer to open it. Omitting one means the queue is just a list (the whole
 * library, a smart playlist), which ends whatever run was open: the listener has
 * moved on to something that is not that collection.
 */
export async function playQueueAt(
  trackIds: string[],
  index: number,
  startPositionSec?: number,
  context?: PlaybackContext | null,
): Promise<void> {
  const trackId = trackIds[index];
  if (!trackId) {
    return;
  }
  usePlayerStore.getState().setQueue(trackIds, index);
  // Mark the track as current synchronously so any screen that reads the store
  // immediately after this call (and would otherwise decide to load the track
  // itself) sees the right one.
  patch({ trackId });

  if (context) {
    await openRun(context, trackIds.length);
    patch({ context });
  } else {
    await closeRun({ completed: false, interrupted: true });
    patch({ context: null });
  }

  await playTrackById(trackId, startPositionSec);
}

/**
 * Load and play a single track.
 *
 * Without an explicit position this resumes where the listener left off. An
 * explicit one wins — that is how tapping a history entry lands on *that*
 * session's position rather than the most recent one. The position has to reach
 * `loadAndPlay`, which seeks before the first frame; seeking afterwards would
 * briefly play from the wrong place.
 */
async function playTrackById(trackId: string, startPositionSec?: number): Promise<void> {
  const track = await LocalDBService.getTrackById(trackId);
  if (!track) {
    // No session will begin, so a stretch handed forward by an auto-advance
    // must not be left waiting for one.
    pendingStretchId = null;
    patch({ status: "error", error: "That track is no longer in your library." });
    return;
  }
  const sessions = await LocalDBService.getSessionsByTrack(track.id);
  const start =
    startPositionSec !== undefined
      ? startPositionSec
      : resumePositionSec(sessions, track.durationSec);
  // One place covers every way the queue moves — a queue load, a manual skip,
  // and an automatic advance — so the run can never be left pointing at a track
  // the listener has already moved past.
  touchRun(track.id, start);
  await loadAndPlay(track, start);
}

/**
 * Append tracks to the end of the current queue without touching playback.
 *
 * Deliberately separate from `playQueueAt`, which *replaces* the queue: "add to
 * queue" means the listener is mid-album and wants a lecture after it, not that
 * they want the lecture now. With nothing playing there is no queue to extend,
 * so this becomes an ordinary queue load that still does not auto-play — the
 * mini-player then offers the first added track.
 */
export function enqueue(trackIds: string[]): void {
  if (trackIds.length === 0) {
    return;
  }
  const { queue, queueIndex } = usePlayerStore.getState();
  const appended = [...queue, ...trackIds];
  if (queue.length === 0) {
    usePlayerStore.getState().setQueue(appended, 0);
    return;
  }
  usePlayerStore.getState().setQueue(appended, queueIndex);
}

/**
 * Advance to the next queued track. At the end of the queue we restart the
 * current track rather than wrapping, which is what a listener expects from an
 * audiobook or an album.
 */
export async function next(): Promise<void> {
  const { queue, queueIndex } = usePlayerStore.getState();
  usePlayerStore.getState().signalSkip(1);

  const targetIndex = queueIndex + 1;
  const targetId = queue[targetIndex];
  if (!targetId) {
    await seekTo(0);
    return;
  }
  usePlayerStore.getState().setQueue(queue, targetIndex);
  await playTrackById(targetId);
}

/** Step back a track, or restart the current one if we are at the head. */
export async function previous(): Promise<void> {
  const { queue, queueIndex } = usePlayerStore.getState();
  usePlayerStore.getState().signalSkip(-1);

  const targetIndex = queueIndex - 1;
  const targetId = queue[targetIndex];
  if (!targetId) {
    await seekTo(0);
    return;
  }
  usePlayerStore.getState().setQueue(queue, targetIndex);
  await playTrackById(targetId);
}

/** Clean up any checkpoint whose session was killed before it ended. */
export async function recoverOrphanedSessions(): Promise<number> {
  const checkpoints = await LocalDBService.getOrphanedCheckpoints();
  for (const checkpoint of checkpoints) {
    let existing = await LocalDBService.getSessionById(checkpoint.sessionId);
    if (!existing) {
      // The run is looked up rather than taken from the checkpoint alone: a
      // session carries the collection's type and key as well as the run id, and
      // a killed playback has to come back describing itself exactly as a normal
      // one would.
      const run = checkpoint.contextPlayId
        ? await LocalDBService.getContextPlayById(checkpoint.contextPlayId)
        : null;
      await LocalDBService.insertSession({
        id: checkpoint.sessionId,
        trackId: checkpoint.trackId,
        contentHash: checkpoint.contentHash,
        startedAt: checkpoint.startedAt,
        startPositionSec: checkpoint.positionSec,
        playbackSpeed: checkpoint.playbackSpeed,
        contextPlayId: checkpoint.contextPlayId,
        contextType: run?.contextType ?? null,
        contextKey: run?.contextKey ?? null,
        // A checkpoint from before v10 has no group; standing alone is the
        // truthful reading, and matches what the migration backfilled.
        stretchId: checkpoint.stretchId ?? checkpoint.sessionId,
      });
      existing = await LocalDBService.getSessionById(checkpoint.sessionId);
    }
    if (existing && existing.endedAt === null) {
      await LocalDBService.finalizeSession(checkpoint.sessionId, {
        endedAt: checkpoint.timestamp,
        endPositionSec: checkpoint.positionSec,
        durationListenedSec: checkpoint.durationListenedSec,
        completed: false,
        interrupted: true,
      });
    }
    await LocalDBService.deleteCheckpoint(checkpoint.sessionId);
  }
  return checkpoints.length;
}

/**
 * Test-only: forgets the player, the session and the open run.
 *
 * These live in module scope on purpose — a run has to outlive a screen, and the
 * status listener is registered exactly once — which also means they outlive a
 * *test*. A suite drives playback through that listener, so without this a case
 * inherits the previous case's live session and ends up asserting against a
 * session it never started. The app never calls this.
 */
export function __resetForTests(): void {
  player = null;
  currentTrack = null;
  active = null;
  activeRun = null;
  sessionStarting = false;
  advancing = false;
  wasPlaying = false;
  configured = false;
  lockScreenFailed = IS_EXPO_GO;
  pendingSeekSec = null;
  nextSessionStartSec = 0;
  activeStretchId = null;
  pendingStretchId = null;
  seekReported = false;
  reportedUnreachable.clear();
}
