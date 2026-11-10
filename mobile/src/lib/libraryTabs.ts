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
import type { LocalTrack } from "@/lib/db/types";
import { trackOrigin } from "@/lib/origin";

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
 * Which half of the Tracks view is showing.
 *
 * Named `TrackOrigin` and not `TrackSource`, because `TrackSource` is already
 * taken and means something else entirely: *how* a local file was found
 * (`mediastore`, `saf`, `picker`). The question this control asks is the one
 * `origin` answers — file on this phone, or item served by a source — which is
 * also what `OriginBadge` and `trackOrigin` mean by the word.
 *
 * The library holds two kinds of row that look identical in a list, and the
 * Tracks view is the one place that shows both at once. The badge on each row
 * says which is which; a control that can *separate* them is what turns
 * "provenance" into something the listener can act on ("show me what will still
 * play on a plane").
 *
 * Two values, not three. "Mixed" is a property of a container (a playlist, a
 * folder) that can hold both; a single track is always one or the other.
 */
export type TrackOrigin = "local" | "online";

export type TrackOriginTab = {
  value: TrackOrigin;
  label: string;
  icon: IconName;
};

/**
 * The words and glyphs of the sub-tabs, in the same vocabulary as `OriginBadge`
 * — a phone for the file on this device, a cloud for the one that streams — so
 * the control and the badges on the rows below it cannot describe the same fact
 * two different ways.
 */
export const TRACK_ORIGIN_TABS: readonly TrackOriginTab[] = [
  { value: "local", label: "Local", icon: "device" },
  { value: "online", label: "Online", icon: "stream" },
];

export type TrackOriginCounts = { local: number; online: number };

/**
 * The library split in two, once.
 *
 * Both halves come out of one pass so they are exactly complementary and
 * exhaustive: a track is in one of them and never in both, and nothing is
 * dropped. Splitting with two independent `filter`s is the shape that lets a
 * track go missing from both halves when the predicate is not symmetric.
 *
 * Classified through `trackOrigin` rather than off the column directly, so the
 * sub-tab and the badge on the row it filters can never disagree about the same
 * track — the vocabulary that decides "Local" is the one that prints it.
 */
export function splitTracksByOrigin<T extends Pick<LocalTrack, "origin">>(
  tracks: readonly T[],
): { local: T[]; online: T[] } {
  const local: T[] = [];
  const online: T[] = [];
  for (const track of tracks) {
    if (trackOrigin(track) === "online") {
      online.push(track);
    } else {
      local.push(track);
    }
  }
  return { local, online };
}

/**
 * Whether the two kinds are both present, which is the only case where the
 * sub-tab is a choice rather than a statement.
 *
 * A library of nothing but imported files would get a control whose second half
 * is an empty list — a switch that only ever shows nothing is noise.
 */
export function hasBothOrigins(counts: TrackOriginCounts): boolean {
  return counts.local > 0 && counts.online > 0;
}

/**
 * Which origin the Tracks view is showing.
 *
 * When only one kind exists the answer follows the data rather than the last
 * choice: a remembered "Online" with no online tracks left would open an empty
 * list behind a control that had just disappeared, which is a dead end the
 * listener could not get out of. A real choice is honoured while both kinds
 * exist, and the default is Local — it is what most libraries are made of, and
 * it is the half that plays with no network.
 */
export function resolveTrackOrigin(
  preferred: TrackOrigin | null,
  counts: TrackOriginCounts,
): TrackOrigin {
  if (!hasBothOrigins(counts)) {
    return counts.online > 0 ? "online" : "local";
  }
  return preferred ?? "local";
}

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
