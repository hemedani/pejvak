/**
 * Which collection's listening history is being shown, if any.
 *
 * Mounted once, globally, so the Library's folder cards, the Playlists tab, and
 * both collection screens can open it without each owning a copy of it. Callers
 * hand over the two halves that identify a collection plus enough to label the
 * sheet; nothing else travels.
 *
 * Deliberately not a navigation route, for the same reason `addToPlaylistStore`
 * is not one: the sheet has to be reachable from inside the `/player`
 * transparent modal, and a route pushed from a modal renders *behind* it.
 *
 * The store owns the *whole* lifecycle, including the exit. `close()` only marks
 * the request as closing so the sheet can animate out while still rendering it;
 * `dismiss()` clears it once that animation has finished. Keeping that here
 * rather than in the sheet means the sheet holds no "last request" copy, and
 * needs no effect whose only job is to hold on to one.
 */

import { create } from "zustand";

import type { ContextType } from "@/lib/db/types";

export type ContextHistoryRequest = {
  /** A folder key or a local playlist id. */
  type: ContextType;
  key: string;
  /** The collection's name as its own screen shows it. */
  title: string;
  /**
   * A folder's representative cover, when it has one. A playlist has no artwork
   * of its own, so this stays null and the header falls back to a letter tile —
   * the same rule the collection's own card follows.
   */
  artwork?: string | null;
};

type ContextHistoryState = {
  request: ContextHistoryRequest | null;
  /** Set by `close()`, cleared by `open()` and `dismiss()`. */
  closing: boolean;
  open: (request: ContextHistoryRequest) => void;
  /** Begins the exit. The request stays until `dismiss()` clears it. */
  close: () => void;
  /** Ends the exit: the sheet is gone and may be unmounted. */
  dismiss: () => void;
};

export const useContextHistoryStore = create<ContextHistoryState>((set) => ({
  request: null,
  closing: false,
  open: (request) => set({ request, closing: false }),
  close: () => set({ closing: true }),
  dismiss: () => set({ request: null, closing: false }),
}));

/** Opens the sheet from a plain event handler, without subscribing to the store. */
export function openContextHistory(request: ContextHistoryRequest): void {
  useContextHistoryStore.getState().open(request);
}

/** Begins closing the sheet from a plain event handler. */
export function closeContextHistory(): void {
  useContextHistoryStore.getState().close();
}
