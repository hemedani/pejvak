/**
 * The app's icon vocabulary.
 *
 * Screens ask for a semantic name (`"play"`, `"history"`, `"trash"`) rather than
 * a glyph, so the underlying family can change in one place. Ionicons covers
 * almost everything; the two 30-second skip glyphs only exist in MaterialIcons.
 *
 * A `*Filled` name means the *same* glyph filled in. Material's rule for a
 * navigation item is a filled icon when the destination is selected and an
 * outlined one when it is not, and in a label-free dock that change of shape is
 * carrying most of the selected state — a tint alone is very little signal on a
 * row of five.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ComponentProps } from "react";
import type { StyleProp, TextStyle } from "react-native";

type IoniconName = ComponentProps<typeof Ionicons>["name"];
type MaterialName = ComponentProps<typeof MaterialIcons>["name"];

type Glyph =
  | { family: "ionicons"; name: IoniconName }
  | { family: "material"; name: MaterialName };

const glyphs = {
  play: { family: "ionicons", name: "play" },
  pause: { family: "ionicons", name: "pause" },
  previous: { family: "ionicons", name: "play-skip-back" },
  next: { family: "ionicons", name: "play-skip-forward" },
  rewind: { family: "material", name: "replay-30" },
  forward: { family: "material", name: "forward-30" },

  chevronDown: { family: "ionicons", name: "chevron-down" },
  chevronLeft: { family: "ionicons", name: "chevron-back" },
  chevronRight: { family: "ionicons", name: "chevron-forward" },
  chevronUp: { family: "ionicons", name: "chevron-up" },
  arrowUp: { family: "ionicons", name: "arrow-up" },
  arrowDown: { family: "ionicons", name: "arrow-down" },

  add: { family: "ionicons", name: "add" },
  edit: { family: "ionicons", name: "create-outline" },
  trash: { family: "ionicons", name: "trash-outline" },
  close: { family: "ionicons", name: "close" },
  check: { family: "ionicons", name: "checkmark" },
  minus: { family: "ionicons", name: "remove" },
  /** A file that is no longer where the library last saw it. */
  alert: { family: "ionicons", name: "alert-circle-outline" },
  search: { family: "ionicons", name: "search-outline" },
  more: { family: "ionicons", name: "ellipsis-horizontal" },
  /** The two "add to playlist" glyphs only exist in MaterialIcons. */
  playlistAdd: { family: "material", name: "playlist-add" },
  playlistAddCheck: { family: "material", name: "playlist-add-check" },

  library: { family: "ionicons", name: "library-outline" },
  /** Filled variants, for a selected destination whose slot carries no label. */
  libraryFilled: { family: "ionicons", name: "library" },
  folder: { family: "ionicons", name: "folder-outline" },
  folderOpen: { family: "ionicons", name: "folder-open-outline" },
  history: { family: "ionicons", name: "time-outline" },
  historyFilled: { family: "ionicons", name: "time" },
  stats: { family: "ionicons", name: "stats-chart-outline" },
  statsFilled: { family: "ionicons", name: "stats-chart" },
  playlists: { family: "ionicons", name: "list-outline" },
  playlistsFilled: { family: "ionicons", name: "list" },
  settings: { family: "ionicons", name: "settings-outline" },
  notes: { family: "ionicons", name: "document-text-outline" },

  /** Discover. Filled, because it is the destination. */
  compass: { family: "ionicons", name: "compass" },
  compassOutline: { family: "ionicons", name: "compass-outline" },
  /** A language, in the Browse list. */
  globe: { family: "ionicons", name: "globe-outline" },
  /** A source: a station broadcasting. */
  radio: { family: "ionicons", name: "radio-outline" },
  /** Saved, in the Favorites tab. */
  bookmark: { family: "ionicons", name: "bookmark-outline" },
  bookmarkFilled: { family: "ionicons", name: "bookmark" },
  heartFilled: { family: "ionicons", name: "heart" },
  /** Streaming vs. on the device. */
  stream: { family: "ionicons", name: "cloud-outline" },
  cloudDownload: { family: "ionicons", name: "cloud-download-outline" },
  playCircle: { family: "ionicons", name: "play-circle" },
  stopCircle: { family: "ionicons", name: "stop-circle-outline" },
  checkCircle: { family: "ionicons", name: "checkmark-circle" },
  /** A link out to the source's own page. */
  external: { family: "ionicons", name: "open-outline" },
  layers: { family: "ionicons", name: "albums-outline" },

  speed: { family: "ionicons", name: "speedometer-outline" },
  moon: { family: "ionicons", name: "moon-outline" },
  /** The other half of `moon` — a theme control needs two, not one. */
  sunny: { family: "ionicons", name: "sunny-outline" },
  /** "Follow the device" — not a gear, which says nothing about what it does. */
  autoTheme: { family: "ionicons", name: "contrast-outline" },
  share: { family: "ionicons", name: "share-outline" },
  music: { family: "ionicons", name: "musical-notes-outline" },
  heart: { family: "ionicons", name: "heart-outline" },
  download: { family: "ionicons", name: "download-outline" },
  cloudOffline: { family: "ionicons", name: "cloud-offline-outline" },
  cloudDone: { family: "ionicons", name: "cloud-done-outline" },
  person: { family: "ionicons", name: "person-outline" },
  logout: { family: "ionicons", name: "log-out-outline" },
  refresh: { family: "ionicons", name: "refresh" },
  sparkle: { family: "ionicons", name: "sparkles-outline" },
} as const satisfies Record<string, Glyph>;

export type IconName = keyof typeof glyphs;

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
};

export function Icon({ name, size = 20, color, style }: IconProps) {
  const glyph: Glyph = glyphs[name];
  if (glyph.family === "material") {
    return (
      <MaterialIcons
        name={glyph.name}
        size={size}
        color={color}
        style={style}
      />
    );
  }
  return <Ionicons name={glyph.name} size={size} color={color} style={style} />;
}
