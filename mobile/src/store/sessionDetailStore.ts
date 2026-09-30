/**
 * Which listen's own modal is open, if any.
 *
 * Mounted once, globally, so the History list and a track's own detail screen
 * open the same sheet from the same place — and so it can be reached from inside
 * the `/player` transparent modal, which a pushed route could not be (a route
 * pushed from a modal renders *behind* it; a `Modal` is its own window).
 *
 * The store owns the whole lifecycle, including the exit: `close()` marks the
 * request as closing so the sheet can animate out while still rendering it, and
 * `dismiss()` clears it once that animation has finished. Keeping that here
 * rather than in the sheet means the sheet holds no "last request" copy and
 * needs no effect whose only job is to hold on to one.
 */

import { create } from "zustand";

import type { HistoryItem, HistoryStretch } from "@/lib/history";

/**
 * What is being inspected.
 *
 * Two shapes rather than one, because the two lists genuinely hold different
 * things: History lists *stretches* (a continuous listen across as many tracks
 * as it reached) while a track's own screen lists single *sessions*. Forcing one
 * into the other's shape would mean either a stretch of one invented per session
 * or a stretch flattened to its last row.
 */
export type SessionDetailTarget =
  | { kind: "stretch"; entry: HistoryStretch }
  | { kind: "session"; item: HistoryItem };

export type SessionDetailRequest = {
  target: SessionDetailTarget;
  /**
   * Run after a delete, so the list that opened the sheet can re-read.
   *
   * The sheet is global and has no way to refresh a screen it does not know
   * about — and a delete that left the row on screen would read as a delete that
   * did nothing.
   */
  onChanged?: () => void;
};

type SessionDetailState = {
  request: SessionDetailRequest | null;
  /** Set by `close()`, cleared by `open()` and `dismiss()`. */
  closing: boolean;
  open: (request: SessionDetailRequest) => void;
  /** Begins the exit. The request stays until `dismiss()` clears it. */
  close: () => void;
  /** Ends the exit: the sheet is gone and may be unmounted. */
  dismiss: () => void;
};

export const useSessionDetailStore = create<SessionDetailState>((set) => ({
  request: null,
  closing: false,
  open: (request) => set({ request, closing: false }),
  close: () => set({ closing: true }),
  dismiss: () => set({ request: null, closing: false }),
}));

/** Opens the sheet from a plain event handler, without subscribing to the store. */
export function openSessionDetail(request: SessionDetailRequest): void {
  useSessionDetailStore.getState().open(request);
}
