/**
 * One `HTMLAudioElement` for the whole tab.
 *
 * It is created lazily, on the first client call, and never recreated by a
 * React render. React 19 StrictMode mounts twice in development; two elements
 * mean two streams and two sessions, and a bug that only appears on a fast
 * double click.
 *
 * ## What the engine owns
 *
 * `src`, `currentTime`, `playbackRate`, `volume`, `muted`, and every event
 * subscription. React never writes those directly except through this API.
 *
 * ## What it deliberately does not do
 *
 * It does not set `crossOrigin`: a plain `<audio src>` plays cross-origin media
 * without CORS, and `crossOrigin="anonymous"` would turn a working stream into a
 * CORS failure. It does not track position with a timer: `timeupdate` is the
 * truth, and `requestAnimationFrame` belongs to the scrubber, not the store.
 */

import type { PlayerTrack } from "./types";

export type EngineStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export type EngineSnapshot = {
  status: EngineStatus;
  /** Float seconds; the store floors it for display. */
  positionSec: number;
  /** 0 means unknown or live. Never `Infinity`. */
  durationSec: number;
  playbackRate: number;
  volume: number;
  muted: boolean;
  /** The raw `MediaError.code`, for diagnostics only. */
  errorCode: number | null;
  waiting: boolean;
};

export type EngineEvent =
  | { type: "loadedmetadata"; durationSec: number; live: boolean }
  | { type: "timeupdate"; positionSec: number; atMs: number }
  | { type: "playing"; atMs: number }
  | { type: "pause"; atMs: number }
  | { type: "ended"; atMs: number }
  | { type: "seeking" }
  | { type: "seeked"; atMs: number }
  | { type: "waiting" }
  | { type: "canplay" }
  | { type: "stalled" }
  | { type: "error"; code: number | null; message: string }
  | { type: "autoplayBlocked" }
  | { type: "ratechange"; rate: number }
  | { type: "volumechange"; volume: number; muted: boolean };

export type PlayResult =
  | { ok: true }
  | { ok: false; reason: "blocked" | "aborted" | "error" };

export type LoadOptions = {
  streamUrl: string;
  startPositionSec?: number;
};

export type PlayerEngine = {
  getSnapshot(): EngineSnapshot;
  subscribe(listener: (snapshot: EngineSnapshot) => void): () => void;
  onEvent(listener: (event: EngineEvent) => void): () => void;
  load(track: PlayerTrack, options: LoadOptions): void;
  play(): Promise<PlayResult>;
  pause(): void;
  seek(sec: number): void;
  setRate(rate: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  stop(): void;
};

const INITIAL: EngineSnapshot = {
  status: "idle",
  positionSec: 0,
  durationSec: 0,
  playbackRate: 1,
  volume: 1,
  muted: false,
  errorCode: null,
  waiting: false,
};

let audio: HTMLAudioElement | null = null;
let snapshot: EngineSnapshot = INITIAL;
let initialStartPosition: number | null = null;
let pendingCanplaySeek: number | null = null;
let hasPlayed = false;
let explicitSeek = false;
let ignorePauseUntil = 0;

const snapshotListeners = new Set<(snapshot: EngineSnapshot) => void>();
const eventListeners = new Set<(event: EngineEvent) => void>();

function emit(event: EngineEvent): void {
  for (const listener of eventListeners) {
    listener(event);
  }
}

function sameSnapshot(a: EngineSnapshot, b: EngineSnapshot): boolean {
  return (
    a.status === b.status &&
    a.positionSec === b.positionSec &&
    a.durationSec === b.durationSec &&
    a.playbackRate === b.playbackRate &&
    a.volume === b.volume &&
    a.muted === b.muted &&
    a.errorCode === b.errorCode &&
    a.waiting === b.waiting
  );
}

function update(patch: Partial<EngineSnapshot>): void {
  const next = { ...snapshot, ...patch };
  if (sameSnapshot(snapshot, next)) {
    return;
  }
  snapshot = next;
  for (const listener of snapshotListeners) {
    listener(snapshot);
  }
}

function clampStart(target: number, duration: number): number {
  if (!Number.isFinite(target) || target < 0) {
    return 0;
  }
  if (duration > 0 && Number.isFinite(duration)) {
    return Math.min(target, duration);
  }
  return target;
}

function applyStartPosition(element: HTMLAudioElement, target: number): void {
  const duration = Number.isFinite(element.duration) && element.duration > 0 ? element.duration : 0;
  const safe = clampStart(target, duration);
  try {
    element.currentTime = safe;
    pendingCanplaySeek = null;
  } catch {
    // Some streams refuse `currentTime` until they have enough bytes. Retry
    // exactly once on `canplay`; never in a tight loop.
    pendingCanplaySeek = safe;
  }
}

function handleError(element: HTMLAudioElement): void {
  const code = element.error?.code ?? null;
  update({ status: "error", waiting: false, errorCode: code });
  emit({
    type: "error",
    code,
    message: element.error?.message ?? "The audio element reported an error.",
  });
}

function ensureAudio(): HTMLAudioElement {
  if (audio) {
    return audio;
  }

  const element = new Audio();
  element.preload = "auto";
  // `crossOrigin` is deliberately unset — see the header.

  element.addEventListener("loadedmetadata", () => {
    const raw = element.duration;
    const live = !Number.isFinite(raw) || raw <= 0;
    const durationSec = live ? 0 : raw;
    update({ durationSec, positionSec: element.currentTime || 0, status: "loading" });

    if (initialStartPosition !== null) {
      const target = initialStartPosition;
      initialStartPosition = null;
      if (live) {
        // No resume and no seek on a live stream: start at 0 every time.
        try {
          element.currentTime = 0;
        } catch {
          // A live element that cannot seek is already where it should be.
        }
      } else {
        applyStartPosition(element, target);
      }
    }

    emit({ type: "loadedmetadata", durationSec, live });
  });

  element.addEventListener("canplay", () => {
    if (pendingCanplaySeek !== null) {
      const target = pendingCanplaySeek;
      pendingCanplaySeek = null;
      try {
        element.currentTime = target;
      } catch {
        // One retry, then the stream's own start position stands.
      }
    }
    update({ waiting: false });
    emit({ type: "canplay" });
  });

  element.addEventListener("timeupdate", () => {
    update({ positionSec: element.currentTime });
    emit({ type: "timeupdate", positionSec: element.currentTime, atMs: Date.now() });
  });

  element.addEventListener("seeking", () => {
    if (hasPlayed || explicitSeek) {
      emit({ type: "seeking" });
    }
  });

  element.addEventListener("seeked", () => {
    if (hasPlayed || explicitSeek) {
      emit({ type: "seeked", atMs: Date.now() });
    }
    explicitSeek = false;
  });

  element.addEventListener("playing", () => {
    hasPlayed = true;
    update({ status: "playing", waiting: false });
    emit({ type: "playing", atMs: Date.now() });
  });

  element.addEventListener("pause", () => {
    // A pause caused by `load()` or `stop()` is not the listener pausing; the
    // session that owned the old source has already been finalized.
    if (element.ended || Date.now() < ignorePauseUntil) {
      return;
    }
    update({ status: "paused" });
    emit({ type: "pause", atMs: Date.now() });
  });

  element.addEventListener("ended", () => {
    update({ status: "ended", waiting: false });
    emit({ type: "ended", atMs: Date.now() });
  });

  element.addEventListener("waiting", () => {
    update({ waiting: true });
    emit({ type: "waiting" });
  });

  element.addEventListener("stalled", () => {
    update({ waiting: true });
    emit({ type: "stalled" });
  });

  element.addEventListener("error", () => handleError(element));

  element.addEventListener("ratechange", () => {
    update({ playbackRate: element.playbackRate });
    emit({ type: "ratechange", rate: element.playbackRate });
  });

  element.addEventListener("volumechange", () => {
    update({ volume: element.volume, muted: element.muted });
    emit({ type: "volumechange", volume: element.volume, muted: element.muted });
  });

  audio = element;
  return element;
}

export function getEngine(): PlayerEngine {
  return {
    getSnapshot() {
      return snapshot;
    },

    subscribe(listener) {
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    },

    onEvent(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },

    load(_track, options) {
      const element = ensureAudio();
      hasPlayed = false;
      explicitSeek = false;
      pendingCanplaySeek = null;
      initialStartPosition = Math.max(0, options.startPositionSec ?? 0);

      ignorePauseUntil = Date.now() + 250;
      try {
        element.pause();
      } catch {
        // Pausing an idle element is allowed to be a no-op.
      }

      element.playbackRate = snapshot.playbackRate;
      element.volume = snapshot.volume;
      element.muted = snapshot.muted;
      element.src = options.streamUrl;
      element.load();

      update({
        status: "loading",
        positionSec: initialStartPosition,
        durationSec: _track.durationSec > 0 ? _track.durationSec : 0,
        errorCode: null,
        waiting: false,
      });
    },

    async play() {
      const element = ensureAudio();
      try {
        await element.play();
        return { ok: true };
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        if (name === "NotAllowedError") {
          emit({ type: "autoplayBlocked" });
          return { ok: false, reason: "blocked" };
        }
        if (name === "AbortError") {
          // A newer load aborted this one; not a failure to show anyone.
          return { ok: false, reason: "aborted" };
        }
        const code = element.error?.code ?? null;
        update({ status: "error", waiting: false, errorCode: code });
        emit({
          type: "error",
          code,
          message: error instanceof Error ? error.message : "Playback was refused.",
        });
        return { ok: false, reason: "error" };
      }
    },

    pause() {
      if (!audio) {
        return;
      }
      audio.pause();
    },

    seek(sec) {
      const element = ensureAudio();
      if (!Number.isFinite(sec)) {
        return;
      }
      explicitSeek = true;
      const target =
        element.duration > 0 && Number.isFinite(element.duration)
          ? clampStart(sec, element.duration)
          : Math.max(0, sec);
      try {
        element.currentTime = target;
        update({ positionSec: target });
      } catch {
        explicitSeek = false;
      }
    },

    setRate(rate) {
      const element = ensureAudio();
      const safe = Number.isFinite(rate) && rate > 0 ? rate : 1;
      element.playbackRate = safe;
      update({ playbackRate: safe });
    },

    setVolume(volume) {
      const element = ensureAudio();
      const safe = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
      element.volume = safe;
      element.muted = safe === 0;
      update({ volume: safe, muted: element.muted });
    },

    setMuted(muted) {
      const element = ensureAudio();
      element.muted = muted;
      update({ muted });
    },

    stop() {
      if (!audio) {
        return;
      }
      ignorePauseUntil = Date.now() + 250;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      hasPlayed = false;
      explicitSeek = false;
      initialStartPosition = null;
      pendingCanplaySeek = null;
      update({ status: "idle", positionSec: 0, durationSec: 0, waiting: false, errorCode: null });
    },
  };
}
