/**
 * The app's icon vocabulary.
 *
 * Screens ask for a semantic name (`"play"`, `"history"`, `"trash"`) rather than
 * a glyph, so the family can change in one place. This is the only file allowed
 * to import an icon family.
 *
 * A `*Filled` name means the *same* glyph filled in. Material's rule for a
 * navigation item is a filled icon when the destination is selected and an
 * outlined one when it is not, and in a label-free dock that change of shape is
 * carrying most of the selected state — a tint alone is very little signal on a
 * row of five.
 */

import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ComponentProps } from "react";
import type { StyleProp, TextStyle } from "react-native";

type MciName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/** The family's font map, for `useFonts` in the root layout. */
export const ICON_FONT = MaterialCommunityIcons.font;

/** Exported for `iconCatalog.test.ts`; screens never read it directly. */
export const ICON_GLYPHS = {
  play: "play",
  pause: "pause",
  previous: "skip-previous",
  next: "skip-next",
  rewind: "rewind-30",
  forward: "fast-forward-30",

  chevronDown: "chevron-down",
  chevronLeft: "chevron-left",
  chevronRight: "chevron-right",
  chevronUp: "chevron-up",
  arrowUp: "arrow-up",
  arrowDown: "arrow-down",

  add: "plus",
  edit: "pencil-outline",
  trash: "delete-outline",
  close: "close",
  check: "check",
  eye: "eye-outline",
  clock: "clock-time-four-outline",
  eyeOff: "eye-off-outline",
  minus: "minus",
  /** A file that is no longer where the library last saw it. */
  alert: "alert-circle-outline",
  search: "magnify",
  more: "dots-horizontal",
  refresh: "refresh",
  playlistAdd: "playlist-plus",
  playlistAddCheck: "playlist-check",

  library: "library-outline",
  libraryFilled: "library",
  folder: "folder-outline",
  folderOpen: "folder-open-outline",
  /** MCI's `history` has no filled partner; the clock carries the pair. */
  history: "clock-outline",
  historyFilled: "clock",
  stats: "chart-box-outline",
  statsFilled: "chart-box",
  playlists: "playlist-music-outline",
  playlistsFilled: "playlist-music",
  settings: "cog-outline",
  notes: "note-text-outline",

  compass: "compass",
  compassOutline: "compass-outline",
  /** A language, in the Browse list. */
  globe: "web",
  /** A source: a station broadcasting. */
  radio: "radio",
  /** Saved, in the Favorites tab. */
  bookmark: "bookmark-outline",
  bookmarkFilled: "bookmark",
  heart: "heart-outline",
  heartFilled: "heart",
  /** Streaming vs. on the device. */
  stream: "cloud-outline",
  cloudDownload: "cloud-download-outline",
  cloudOffline: "cloud-off-outline",
  cloudDone: "cloud-check-outline",
  playCircle: "play-circle",
  stopCircle: "stop-circle-outline",
  checkCircle: "check-circle",
  /** A link out to the source's own page. */
  external: "open-in-new",
  layers: "layers-outline",

  speed: "speedometer",
  moon: "moon-waning-crescent",
  /** The other half of `moon` — a theme control needs two, not one. */
  sunny: "white-balance-sunny",
  /** "Follow the device" — not a gear, which says nothing about what it does. */
  autoTheme: "theme-light-dark",
  share: "share-variant-outline",
  music: "music-note-outline",
  download: "download-outline",
  person: "account-outline",
  logout: "logout",
  sparkle: "auto-fix",
  info: "information-outline",
} as const satisfies Record<string, MciName>;

export type IconName = keyof typeof ICON_GLYPHS;

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
};

export function Icon({ name, size = 20, color, style }: IconProps) {
  return (
    <MaterialCommunityIcons
      name={ICON_GLYPHS[name]}
      size={size}
      color={color}
      style={style}
    />
  );
}
