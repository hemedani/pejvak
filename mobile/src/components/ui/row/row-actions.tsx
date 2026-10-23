/**
 * One control in a row's action cluster, and the menu it falls back to.
 *
 * An action carries two drawings of itself: the compact control shown beside
 * the copy, and the named row shown in the overflow menu. The name is not
 * optional — a vertical menu of bare glyphs says nothing about what each one
 * would do.
 *
 * The action type is re-exported by `MediaCard` as `MediaCardAction`, so the
 * screens that already build clusters keep their imports while the type gains
 * one owner.
 */

import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

import { BouncyIconButton, type BouncyIconButtonTone } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { Icon, type IconName } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import type { ContextType, DownloadState } from "@/lib/db/types";
import { describeContextType } from "@/lib/playbackContext";
import { openAddToPlaylist } from "@/store/addToPlaylistStore";
import { openContextHistory } from "@/store/contextHistoryStore";
import {
  iconSize,
  radius as radii,
  spacing,
  control,
  type AuroraRamp,
} from "@/theme/tokens";

export type RowAction = {
  key: string;
  /** Rendered width in px — what `planRowLayout` budgets with. */
  width: number;
  /** Higher survives longer when the row runs out of room. */
  priority: number;
  /** The inline control. */
  node: ReactNode;
  /** The overflow-menu glyph. */
  icon: IconName;
  /** The overflow-menu words. */
  label: string;
  onPress: () => void;
  /** Draws the menu row in the danger colour. */
  danger?: boolean;
  /**
   * Never rendered beside the copy, only in the overflow menu. For a
   * destructive action, which should take a deliberate second tap rather than
   * sit under the listener's thumb next to play.
   */
  menuOnly?: boolean;
};

type PresetTone = {
  tone?: BouncyIconButtonTone;
};

function controlNode(
  name: IconName,
  label: string,
  onPress: () => void,
  tone: BouncyIconButtonTone,
  options?: { disabled?: boolean; color?: string },
): ReactNode {
  return (
    <BouncyIconButton
      name={name}
      accessibilityLabel={label}
      size={control.md}
      iconSize={iconSize.md}
      tone={tone}
      disabled={options?.disabled}
      color={options?.color}
      onPress={onPress}
    />
  );
}

/** The one glyph a download state draws, independent of its words. */
export function downloadGlyph(state: DownloadState | null | undefined): IconName {
  switch (state) {
    case "complete":
      return "checkCircle";
    case "downloading":
      return "cloudDownload";
    case "failed":
    case "cancelled":
      return "refresh";
    default:
      return "cloudDownload";
  }
}

/**
 * The shared action definitions.
 *
 * A screen should not hand-build the same play/add/history cluster four times:
 * the width, the priority and the wording are exactly what drift when it does.
 * Each preset owns both drawings of itself — the inline control and the menu
 * row — so they can never disagree about what the action is called.
 *
 * `tone` defaults to `ghost`, the dense-row surface. A shelf card over artwork
 * passes `glass`; nothing should have to guess which one it is.
 */

export function playFolderAction({
  title,
  onPress,
  tone = "ghost",
}: { title: string; onPress: () => void } & PresetTone): RowAction {
  return {
    key: "play",
    width: control.md,
    priority: 4,
    icon: "play",
    label: `Play ${title}`,
    onPress,
    node: controlNode("play", `Play folder ${title}`, onPress, tone),
  };
}

export function playPlaylistAction({
  title,
  onPress,
  tone = "ghost",
}: { title: string; onPress: () => void } & PresetTone): RowAction {
  return {
    key: "play",
    width: control.md,
    priority: 4,
    icon: "play",
    label: `Play ${title}`,
    onPress,
    node: controlNode("play", `Play playlist ${title}`, onPress, tone),
  };
}

export type AddToPlaylistActionInput = {
  title: string;
  ramp?: AuroraRamp;
  artwork?: string | null;
  /** Either the ids are already in hand… */
  trackIds?: readonly string[];
  /** …or they are fetched on tap, so a list of cards runs no queries. */
  resolveTrackIds?: () => Promise<readonly string[]>;
  isBatch?: boolean;
} & PresetTone;

export function addToPlaylistAction({
  title,
  ramp,
  artwork,
  trackIds,
  resolveTrackIds,
  isBatch,
  tone = "ghost",
}: AddToPlaylistActionInput): RowAction {
  const open = () => {
    void (async () => {
      const ids = resolveTrackIds ? await resolveTrackIds() : (trackIds ?? []);
      if (ids.length === 0) {
        return;
      }
      openAddToPlaylist({
        trackIds: [...ids],
        title,
        ramp,
        artwork: artwork ?? null,
        isBatch: isBatch ?? ids.length > 1,
      });
    })();
  };

  return {
    key: "add",
    width: control.md,
    priority: 3,
    icon: "playlistAdd",
    label: "Add to a playlist",
    onPress: open,
    node: controlNode(
      "playlistAdd",
      `Add ${title} to a playlist`,
      open,
      tone,
    ),
  };
}

export function historyAction({
  type,
  contextKey,
  title,
  artwork,
  tone = "ghost",
}: {
  type: ContextType;
  contextKey: string;
  title: string;
  artwork?: string | null;
} & PresetTone): RowAction {
  const open = () => openContextHistory({ type, key: contextKey, title, artwork });

  return {
    key: "history",
    width: control.md,
    priority: 2,
    icon: "history",
    label: "Listening history",
    onPress: open,
    node: controlNode(
      "history",
      `History for ${describeContextType(type).toLowerCase()} ${title}`,
      open,
      tone,
    ),
  };
}

export function favoriteAction({
  title,
  isFavorite,
  onPress,
  tone = "ghost",
}: {
  title: string;
  isFavorite: boolean;
  onPress: () => void;
} & PresetTone): RowAction {
  const label = isFavorite ? "Remove from favorites" : "Add to favorites";
  return {
    key: "favorite",
    width: control.md,
    priority: 3,
    icon: isFavorite ? "bookmarkFilled" : "bookmark",
    label,
    onPress,
    node: controlNode(
      isFavorite ? "bookmarkFilled" : "bookmark",
      label,
      onPress,
      tone,
    ),
  };
}

export function downloadAction({
  title,
  state,
  onPress,
  tone = "ghost",
  color,
}: {
  title: string;
  state: DownloadState | null | undefined;
  onPress: () => void;
  /** The completed/downloading state's accent, resolved by the caller's theme. */
  color?: string;
} & PresetTone): RowAction {
  const icon = downloadGlyph(state);
  const complete = state === "complete";
  const label = complete
    ? "Already downloaded"
    : state === "failed" || state === "cancelled"
      ? "Retry download"
      : "Download this collection";
  const accessibilityLabel = complete
    ? `${title} is downloaded`
    : `Download ${title}`;
  return {
    key: "download",
    width: control.md,
    priority: 2,
    icon,
    label,
    onPress,
    node: controlNode(icon, accessibilityLabel, onPress, tone, {
      disabled: state === "downloading",
      color,
    }),
  };
}

export function detailsAction({
  title,
  onPress,
  tone = "ghost",
}: { title: string; onPress: () => void } & PresetTone): RowAction {
  return {
    key: "details",
    width: control.md,
    priority: 1,
    icon: "chevronRight",
    label: "Details",
    onPress,
    node: controlNode("chevronRight", `Details for ${title}`, onPress, tone),
  };
}

export function deleteAction({
  title,
  onPress,
  tone = "ghost",
}: { title: string; onPress: () => void } & PresetTone): RowAction {
  return {
    key: "delete",
    width: control.md,
    priority: 0,
    icon: "trash",
    label: `Delete ${title}`,
    danger: true,
    menuOnly: true,
    onPress,
    node: controlNode("trash", `Delete ${title}`, onPress, tone),
  };
}

/**
 * The controls that did not fit, as named rows.
 *
 * A `Modal` rather than an in-card popover: the row lives inside a virtualised
 * list, and anything absolutely positioned inside it is clipped by the list's
 * own bounds. A `Modal` is a separate window, so the menu lands above
 * everything and needs no measurement of where the row was.
 */
export function RowActionMenu({
  title,
  actions,
  onClose,
}: {
  title: string;
  actions: readonly RowAction[];
  onClose: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close menu"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
      />
      <View style={styles.menuHost} pointerEvents="box-none">
        <GlassSurface tone="surfaceStrong" radius={radii.panel} clip style={styles.menu}>
          <ThemedText type="overline" themeColor="textTertiary" numberOfLines={1}>
            {title}
          </ThemedText>
          {actions.map((action) => (
            <ElasticPressable
              key={action.key}
              testID={`row-menu-${action.key}`}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              haptic="tap"
              onPress={() => {
                // Closed before the action runs: the action is usually a
                // navigation, and a menu that outlives the screen under it would
                // be left floating over the destination.
                onClose();
                action.onPress();
              }}
              style={styles.menuRow}>
              <Icon
                name={action.icon}
                size={20}
                color={action.danger ? theme.danger : theme.icon}
              />
              <ThemedText
                type="body"
                numberOfLines={1}
                style={action.danger ? { color: theme.danger } : undefined}>
                {action.label}
              </ThemedText>
            </ElasticPressable>
          ))}
        </GlassSurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menuHost: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  menu: {
    padding: spacing.md,
    gap: spacing.xxs,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    minHeight: 48,
  },
});
