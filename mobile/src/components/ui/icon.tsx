/**
 * The app's icon vocabulary.
 *
 * Screens ask for a semantic name (`"play"`, `"history"`, `"trash"`) rather than
 * a glyph, so the underlying family can change in one place. Ionicons covers
 * almost everything; the two 30-second skip glyphs only exist in MaterialIcons.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ComponentProps } from "react";
import type { StyleProp, TextStyle } from "react-native";

type IoniconName = ComponentProps<typeof Ionicons>["name"];
type MaterialName = ComponentProps<typeof MaterialIcons>["name"];

type Glyph = { family: "ionicons"; name: IoniconName } | { family: "material"; name: MaterialName };

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
  search: { family: "ionicons", name: "search-outline" },
  more: { family: "ionicons", name: "ellipsis-horizontal" },

  library: { family: "ionicons", name: "library-outline" },
  history: { family: "ionicons", name: "time-outline" },
  stats: { family: "ionicons", name: "stats-chart-outline" },
  playlists: { family: "ionicons", name: "list-outline" },
  settings: { family: "ionicons", name: "settings-outline" },
  notes: { family: "ionicons", name: "document-text-outline" },

  speed: { family: "ionicons", name: "speedometer-outline" },
  moon: { family: "ionicons", name: "moon-outline" },
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
    return <MaterialIcons name={glyph.name} size={size} color={color} style={style} />;
  }
  return <Ionicons name={glyph.name} size={size} color={color} style={style} />;
}
