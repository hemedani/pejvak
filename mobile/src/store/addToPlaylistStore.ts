/**
 * Who is being added to a playlist, and where from.
 *
 * The picker is mounted once, globally, so it can be opened from the full
 * player, the mini-player, a library row, a folder card, or anywhere else
 * without each of those screens owning a copy of it. Callers hand over the
 * track ids plus enough context to label the sheet; nothing else travels.
 *
 * Deliberately not a navigation route: the sheet has to be reachable from
 * inside the `/player` transparent modal, and a route pushed from a modal would
 * be obscured by it.
 *
 * The store owns the *whole* lifecycle, including the exit. `close()` only
 * marks the request as closing so the sheet can animate out while still
 * rendering it; `dismiss()` clears it once that animation has finished. Keeping
 * that here rather than in the sheet means the sheet holds no "last request"
 * copy, and needs no effect that sets state to hold on to one.
 */

import { create } from "zustand";

import type { AuroraRamp } from "@/theme/tokens";

export type AddToPlaylistRequest = {
  /** Distinct ids are computed by the sheet; duplicates here are tolerated. */
  trackIds: string[];
  /** What is being added — a track title, or a folder's name. */
  title: string;
  /** Optional second line, e.g. "12 tracks from Lectures". */
  subtitle?: string | null;
  /** Colour identity of whatever was tapped, so the sheet matches its source. */
  ramp?: AuroraRamp;
  /**
   * Cover art for the header tile, when the source has one. A folder's card
   * passes its representative cover, so the sheet the listener just opened from
   * that card looks like the card did.
   */
  artwork?: string | null;
  /**
   * True when the selection is a container (a folder, an album) rather than a
   * single track. Changes the header glyph, nothing else.
   */
  isBatch?: boolean;
};

type AddToPlaylistState = {
  request: AddToPlaylistRequest | null;
  /** Set by `close()`, cleared by `open()` and `dismiss()`. */
  closing: boolean;
  open: (request: AddToPlaylistRequest) => void;
  /** Begins the exit. The request stays until `dismiss()` clears it. */
  close: () => void;
  /** Ends the exit: the sheet is gone and may be unmounted. */
  dismiss: () => void;
};

export const useAddToPlaylistStore = create<AddToPlaylistState>((set) => ({
  request: null,
  closing: false,
  open: (request) => set({ request, closing: false }),
  close: () => set({ closing: true }),
  dismiss: () => set({ request: null, closing: false }),
}));

/** Opens the picker from a plain event handler, without subscribing to the store. */
export function openAddToPlaylist(request: AddToPlaylistRequest): void {
  useAddToPlaylistStore.getState().open(request);
}

/** Begins closing the picker from a plain event handler. */
export function closeAddToPlaylist(): void {
  useAddToPlaylistStore.getState().close();
}
