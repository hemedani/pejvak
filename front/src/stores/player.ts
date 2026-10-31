/**
 * The player's transport and queue state.
 *
 * The engine owns the element; this store owns what a screen draws. Nothing
 * here is derived twice: there is no stored `isPlaying` and no stored `phase`,
 * because `status === "playing"` and `resolvePlaybackPhase` already answer.
 *
 * Only leaf components select `positionSec` / `durationSec` — the clocks, the
 * scrubber, and the progress hairline. The artwork and the control row must not
 * re-render every second.
 */

import { create } from "zustand";

import type { PlaybackWait } from "@/lib/player/playbackPhase";
import type { PlaybackContext, PlayerTrack } from "@/lib/player/types";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export type PlayerSkip = { direction: 1 | -1; nonce: number };

export type PlayerState = {
  status: PlayerStatus;
  waiting: PlaybackWait | null;
  error: string | null;
  /** Autoplay was refused; the first sound must be a click. */
  blocked: boolean;

  current: PlayerTrack | null;
  queue: PlayerTrack[];
  queueIndex: number;
  context: PlaybackContext | null;

  /** Floored integer for display. */
  positionSec: number;
  /** 0 means unknown or live. */
  durationSec: number;
  playbackSpeed: number;
  volume: number;
  muted: boolean;

  /** Where a history entry dropped the playhead, for the resume pin. */
  resumeFromSec: number | null;

  skip: PlayerSkip | null;

  setStatus(status: PlayerStatus): void;
  setWaiting(waiting: PlaybackWait | null): void;
  setError(error: string | null): void;
  setBlocked(blocked: boolean): void;
  setPosition(positionSec: number): void;
  setDuration(durationSec: number): void;
  setSpeed(playbackSpeed: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  setCurrent(track: PlayerTrack | null): void;
  setQueue(queue: PlayerTrack[], queueIndex: number, context: PlaybackContext | null): void;
  setQueueIndex(queueIndex: number): void;
  setContext(context: PlaybackContext | null): void;
  setResumeFrom(positionSec: number | null): void;
  signalSkip(direction: 1 | -1): void;
  /** Keeps the current track's server id current after a late registration. */
  setServerId(contentHash: string, serverId: string): void;
  reset(): void;
};

const EMPTY = {
  status: "idle" as PlayerStatus,
  waiting: null,
  error: null,
  blocked: false,
  current: null,
  queue: [],
  queueIndex: -1,
  context: null,
  positionSec: 0,
  durationSec: 0,
  playbackSpeed: 1,
  volume: 1,
  muted: false,
  resumeFromSec: null,
  skip: null,
};

export const usePlayerStore = create<PlayerState>((set) => ({
  ...EMPTY,

  setStatus: (status) => set({ status }),
  setWaiting: (waiting) => set({ waiting }),
  setError: (error) => set({ error }),
  setBlocked: (blocked) => set({ blocked }),
  setPosition: (positionSec) =>
    set({ positionSec: Math.max(0, Math.floor(Number.isFinite(positionSec) ? positionSec : 0)) }),
  setDuration: (durationSec) =>
    set({
      durationSec:
        Number.isFinite(durationSec) && durationSec > 0 ? Math.floor(durationSec) : 0,
    }),
  setSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setVolume: (volume) =>
    set({ volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1 }),
  setMuted: (muted) => set({ muted }),
  setCurrent: (current) => set({ current }),
  setQueue: (queue, queueIndex, context) => set({ queue, queueIndex, context }),
  setQueueIndex: (queueIndex) => set({ queueIndex }),
  setContext: (context) => set({ context }),
  setResumeFrom: (resumeFromSec) => set({ resumeFromSec }),
  signalSkip: (direction) =>
    set((state) => ({
      skip: { direction, nonce: (state.skip?.nonce ?? 0) + 1 },
    })),
  setServerId: (contentHash, serverId) =>
    set((state) => {
      const queue = state.queue.map((track) =>
        track.contentHash === contentHash ? { ...track, serverId } : track,
      );
      const current =
        state.current && state.current.contentHash === contentHash
          ? { ...state.current, serverId }
          : state.current;
      return { queue, current };
    }),
  reset: () => set({ ...EMPTY }),
}));

/** The one place a screen asks "is audio moving?" — never a stored boolean. */
export function isPlayingStatus(status: PlayerStatus): boolean {
  return status === "playing";
}
