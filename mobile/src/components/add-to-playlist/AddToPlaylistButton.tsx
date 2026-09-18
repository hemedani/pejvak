/**
 * The two ways a screen offers "add to playlist".
 *
 * Both are one line at the call site and own nothing but the tap: they hand the
 * selection to the global sheet and forget about it. That is the point — the
 * same action has to appear in a player toolbar, a list row, a folder card and a
 * detail screen without any of them owning picker state.
 */

import type { StyleProp, ViewStyle } from "react-native";

import { BouncyIconButton, type BouncyIconButtonTone } from "@/components/motion/BouncyIconButton";
import { GlassChip } from "@/components/ui/glass";
import type { IconName } from "@/components/ui/icon";
import { useAddToPlaylistStore, type AddToPlaylistRequest } from "@/store/addToPlaylistStore";
import type { AuroraRamp } from "@/theme/tokens";

/**
 * Either the ids are already in hand (a track row, the player) or they have to
 * be fetched (a folder card, which holds counts rather than its contents).
 * Resolving lazily keeps a list of 40 folder cards from running 40 queries to
 * populate buttons the user has not pressed.
 */
type Selection =
  | { trackIds: readonly string[]; resolveTrackIds?: never }
  | { trackIds?: never; resolveTrackIds: () => Promise<readonly string[]> };

export type AddToPlaylistTarget = Selection & {
  /** Label for the sheet header. */
  title: string;
  subtitle?: string | null;
  ramp?: AuroraRamp;
  /** Defaults to "more than one track". */
  isBatch?: boolean;
};

/** Opens the picker. The one place a target becomes a request. */
export function useAddToPlaylist() {
  const open = useAddToPlaylistStore((state) => state.open);

  return async (target: AddToPlaylistTarget): Promise<void> => {
    const trackIds = target.resolveTrackIds ? await target.resolveTrackIds() : target.trackIds;
    if (trackIds.length === 0) {
      return;
    }
    const request: AddToPlaylistRequest = {
      trackIds: [...trackIds],
      title: target.title,
      subtitle: target.subtitle ?? null,
      ramp: target.ramp,
      isBatch: target.isBatch ?? trackIds.length > 1,
    };
    open(request);
  };
}

export type AddToPlaylistButtonProps = AddToPlaylistTarget & {
  /** Diameter. Matches the sibling controls in whatever row it sits in. */
  size?: number;
  iconSize?: number;
  tone?: BouncyIconButtonTone;
  style?: StyleProp<ViewStyle>;
};

/** A round icon button, for toolbars and list rows. */
export function AddToPlaylistButton({
  title,
  size = 36,
  iconSize = 17,
  tone = "ghost",
  style,
  ...target
}: AddToPlaylistButtonProps) {
  const open = useAddToPlaylist();

  return (
    <BouncyIconButton
      name="playlistAdd"
      accessibilityLabel={`Add ${title} to a playlist`}
      size={size}
      iconSize={iconSize}
      tone={tone}
      style={style}
      onPress={() => void open({ title, ...target })}
    />
  );
}

export type AddToPlaylistChipProps = AddToPlaylistTarget & {
  label?: string;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
};

/** A labelled chip, for the player's secondary-control row. */
export function AddToPlaylistChip({
  title,
  label = "Playlist",
  icon = "playlistAdd",
  style,
  ...target
}: AddToPlaylistChipProps) {
  const open = useAddToPlaylist();

  return (
    <GlassChip
      label={label}
      icon={icon}
      accessibilityLabel={`Add ${title} to a playlist`}
      style={style}
      onPress={() => void open({ title, ...target })}
    />
  );
}
