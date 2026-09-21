import { create } from "zustand";

import type { PlaybackContext } from "@/lib/playbackContext";

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

/**
 * A skip event. `nonce` increments on every next/previous so consumers (the
 * album artwork) can react to a *change* rather than to a boolean that has to be
 * reset.
 */
export type SkipSignal = {
  direction: 1 | -1;
  nonce: number;
};

type PlayerState = {
  status: PlaybackStatus;
  trackId: string | null;
  title: string | null;
  artist: string | null;
  artworkUrl: string | null;
  contentHash: string | null;
  isAudiobook: boolean;
  positionSec: number;
  durationSec: number;
  playbackSpeed: number;
  error: string | null;
  /** Track ids in play order. */
  queue: string[];
  /** Index into `queue`, or -1 when nothing is queued. */
  queueIndex: number;
  /**
   * The collection this queue came from — a folder or a playlist — or null for
   * a queue that is just a list of tracks (the library, a smart playlist).
   *
   * Held here rather than on the queue so the player and the mini-player can
   * name the collection and offer to open it without a database read, and so
   * the two cannot show different collections for the same queue.
   */
  context: PlaybackContext | null;
  /** Whether the full-screen player sheet is open. */
  expanded: boolean;
  /** Last skip, for the album-art kick. */
  skip: SkipSignal | null;

  patch: (partial: PlayerPatch) => void;
  setQueue: (queue: string[], index: number) => void;
  expand: () => void;
  collapse: () => void;
  toggleExpanded: () => void;
  signalSkip: (direction: 1 | -1) => void;
  reset: () => void;
};

export type PlayerPatch = Partial<
  Omit<
    PlayerState,
    "patch" | "setQueue" | "expand" | "collapse" | "toggleExpanded" | "signalSkip" | "reset"
  >
>;

const initialState = {
  status: "idle" as PlaybackStatus,
  trackId: null,
  title: null,
  artist: null,
  artworkUrl: null,
  contentHash: null,
  isAudiobook: false,
  positionSec: 0,
  durationSec: 0,
  playbackSpeed: 1,
  error: null,
  queue: [] as string[],
  queueIndex: -1,
  context: null as PlaybackContext | null,
  expanded: false,
  skip: null,
};

export const usePlayerStore = create<PlayerState>((set) => ({
  ...initialState,

  patch: (partial) => set(partial),

  /**
   * Replaces the queue. Deliberately does not touch `context`: `next` and
   * `previous` call this to move the index, and a step within a collection must
   * not read as leaving it. Starting a *new* queue sets the context explicitly.
   */
  setQueue: (queue, index) => set({ queue, queueIndex: index }),

  expand: () => set({ expanded: true }),
  collapse: () => set({ expanded: false }),
  toggleExpanded: () => set((state) => ({ expanded: !state.expanded })),

  signalSkip: (direction) =>
    set((state) => ({ skip: { direction, nonce: (state.skip?.nonce ?? 0) + 1 } })),

  reset: () => set(initialState),
}));
