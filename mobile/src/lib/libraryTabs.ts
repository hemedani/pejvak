/**
 * The Library's view tabs, and which one opens.
 *
 * Kept out of the screen because the two rules worth protecting are pure: a
 * listener who has chosen a language owns a fourth tab, and that tab is first
 * and is where the app opens. The screen renders this list; it does not decide
 * its order.
 *
 * ## The tab says "Online", not "Language"
 *
 * The view is not a language setting — it is the shelf of *online* sources in
 * the language the listener chose, standing beside the tracks and folders that
 * live on the device. Naming it after the language made it read as a filter on
 * the library rather than as the one tab whose content comes from the network.
 * The language itself is still named on the button that chooses it.
 */

import type { IconName } from "@/components/ui/icon";

export const LIBRARY_VIEW_LABELS = {
  language: "Online",
  tracks: "Tracks",
  folders: "Folders",
  playlists: "Playlists",
  recent: "Recent",
} as const;

export type LibraryView = keyof typeof LIBRARY_VIEW_LABELS;

/** The views the library search reaches; the language tab is a directory. */
export type SearchableLibraryView = Exclude<LibraryView, "language">;

export type LibraryTab = {
  value: LibraryView;
  label: string;
  /**
   * The chip's glyph. Every view has one now: five chips of bare words read as
   * a row of settings, and the glyph is what says *folders* or *playlists*
   * before the label is read.
   */
  icon: IconName;
};

/**
 * The order is the shape of the library, widest first: everything, then the
 * folders it sits in, then the playlists made out of it, then what you touched
 * last. A playlist belongs *after* folders because it is a second way of
 * grouping the same files — putting it before would say a playlist is a kind of
 * container on the device, which it is not.
 */
const LIBRARY_TABS: readonly LibraryTab[] = [
  { value: "tracks", label: LIBRARY_VIEW_LABELS.tracks, icon: "music" },
  { value: "folders", label: LIBRARY_VIEW_LABELS.folders, icon: "folder" },
  { value: "playlists", label: LIBRARY_VIEW_LABELS.playlists, icon: "playlists" },
  { value: "recent", label: LIBRARY_VIEW_LABELS.recent, icon: "clock" },
];

/**
 * The tabs in display order.
 *
 * The language tab is first because it is the listener's own shelf, and the
 * app opens on it; putting it after Tracks would make the launch view the last
 * thing they look at rather than the first.
 */
export function libraryTabs(hasLanguage: boolean): readonly LibraryTab[] {
  return hasLanguage
    ? [
        {
          value: "language",
          label: LIBRARY_VIEW_LABELS.language,
          icon: "globe",
        },
        ...LIBRARY_TABS,
      ]
    : LIBRARY_TABS;
}

/**
 * Which view to draw: the one the listener picked, or the launch default.
 *
 * `null` means they have not picked one yet, so the default is the language
 * shelf when a language is set and Tracks otherwise. A remembered "language"
 * view with no language behind it falls back to Tracks rather than opening an
 * empty tab whose chip no longer exists.
 */
export function resolveLibraryView(
  preferred: LibraryView | null,
  hasLanguage: boolean,
): LibraryView {
  if (preferred === "language") {
    return hasLanguage ? "language" : "tracks";
  }
  if (preferred !== null) {
    return preferred;
  }
  return hasLanguage ? "language" : "tracks";
}
