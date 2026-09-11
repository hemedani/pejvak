import { create } from "zustand";

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

type PlayerState = {
  status: PlaybackStatus;
  trackId: string | null;
  title: string | null;
  positionSec: number;
  durationSec: number;
  playbackSpeed: number;
  error: string | null;
  patch: (partial: PlayerPatch) => void;
  reset: () => void;
};

export type PlayerPatch = Partial<Omit<PlayerState, "patch" | "reset">>;

const initialState = {
  status: "idle" as PlaybackStatus,
  trackId: null,
  title: null,
  positionSec: 0,
  durationSec: 0,
  playbackSpeed: 1,
  error: null,
};

export const usePlayerStore = create<PlayerState>((set) => ({
  ...initialState,
  patch: (partial) => set(partial),
  reset: () => set(initialState),
}));
