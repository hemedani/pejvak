/**
 * Geometry shared between the collapsed mini-player and the full-screen player
 * sheet.
 *
 * The mini-player measures itself into `anchor`; the sheet reads it so it can
 * grow out of — and collapse back into — exactly the same rectangle. Without
 * this the morph would have to guess the tab bar height and would land a few
 * pixels off.
 */

import { create } from "zustand";

export type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type NowPlayingState = {
  anchor: AnchorRect | null;
  setAnchor: (anchor: AnchorRect | null) => void;
};

export const useNowPlayingStore = create<NowPlayingState>((set) => ({
  anchor: null,
  setAnchor: (anchor) => set({ anchor }),
}));
