/**
 * A series inside an online collection, as a header with its own verbs.
 *
 * A series is a reading of the collection, not a collection of its own: its
 * play button still starts a run of the whole shelf, and its history is the
 * shelf's history. What it gains here is the two things the listener asked for
 * at this level — keeping just this show on the device, and putting just this
 * show in a playlist.
 *
 * The download control is a chip rather than the collection's full card: the
 * card's job is to explain a whole download, and nine of those between nine
 * series would be a second screen. One chip says the state and does the one
 * thing that state offers.
 */

import { Alert, StyleSheet, View } from "react-native";

import { AddToPlaylistButton } from "@/components/add-to-playlist/AddToPlaylistButton";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { GlassChip } from "@/components/ui/glass";
import { UserText } from "@/components/ui/row";
import { useDownloadScope } from "@/hooks/use-download-scope";
import { useTheme } from "@/hooks/use-theme";
import { describeTrackCount } from "@/lib/online";
import * as DownloadService from "@/services/DownloadService";
import { control, iconSize, spacing, type AuroraRamp } from "@/theme/tokens";

/** Everything the download and playlist actions need about one series. */
export type SeriesDownloadTarget = {
  /** The download scope, minted from the collection key and the first episode. */
  scopeKey: string;
  collectionKey: string;
  title: string;
  /** The folded series key, kept so the scope row can name what it holds. */
  seriesKey: string;
  /** The episodes, in the series' own order. */
  trackIds: readonly string[];
};

export type SeriesHeaderProps = {
  title: string;
  trackCount: number;
  /** Null for the standalone bucket, which is not a series. */
  target: SeriesDownloadTarget | null;
  subtitle?: string | null;
  artwork?: string | null;
  ramp?: AuroraRamp;
  onPlay: () => void;
};

export function SeriesHeader({
  title,
  trackCount,
  target,
  subtitle,
  artwork,
  ramp,
  onPlay,
}: SeriesHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.copy}>
          <UserText
            type="bodyStrong"
            numberOfLines={2}
            text={title}
            align="content"
          />
          <UserText
            type="caption"
            themeColor="textTertiary"
            text={describeTrackCount(trackCount)}
            align="content"
          />
        </View>
        <BouncyIconButton
          name="play"
          accessibilityLabel={`Play ${title} from the beginning`}
          size={control.sm}
          iconSize={iconSize.sm}
          tone="glass"
          onPress={onPlay}
        />
        {target ? (
          <AddToPlaylistButton
            trackIds={target.trackIds}
            title={target.title}
            subtitle={subtitle}
            artwork={artwork}
            ramp={ramp}
            isBatch
            size={control.sm}
            iconSize={iconSize.sm}
            tone="glass"
          />
        ) : null}
      </View>
      {target ? <SeriesDownloadActions target={target} /> : null}
    </View>
  );
}

function SeriesDownloadActions({ target }: { target: SeriesDownloadTarget }) {
  const theme = useTheme();
  const { summary, refresh } = useDownloadScope(target.scopeKey);

  if (!summary) {
    return null;
  }

  const { state, total, done, failed } = summary;
  const progress = total > 0 ? `${done}/${total}` : null;

  const run = async (action: () => Promise<void>) => {
    await action();
    await refresh();
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete the downloaded series?",
      `"${target.title}" will be removed from this device. The collection, its history and its other downloads stay.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void run(() => DownloadService.deleteDownload(target.scopeKey)),
        },
      ],
    );
  };

  const start = () =>
    void run(() =>
      DownloadService.startSeriesDownload({
        collectionKey: target.collectionKey,
        title: target.title,
        seriesKey: target.seriesKey,
        trackIds: target.trackIds,
      }),
    );

  const cancel = () =>
    void run(() => DownloadService.cancelDownload(target.scopeKey));

  const retry = () =>
    void run(() => DownloadService.retryDownload(target.scopeKey));

  const danger = { borderColor: theme.danger };

  switch (state) {
    case "none":
      return (
        <View style={styles.actions}>
          <GlassChip
            label="Download"
            icon="cloudDownload"
            accessibilityLabel={`Download ${target.title}`}
            onPress={start}
          />
        </View>
      );
    case "downloading":
      return (
        <View style={styles.actions}>
          <GlassChip
            label={progress ? `Stop · ${progress}` : "Stop"}
            icon="stopCircle"
            accessibilityLabel={`Stop downloading ${target.title}`}
            onPress={cancel}
          />
        </View>
      );
    case "complete":
      return (
        <View style={styles.actions}>
          <GlassChip
            label="Delete download"
            icon="trash"
            accessibilityLabel={`Delete the downloaded audio for ${target.title}`}
            style={danger}
            onPress={confirmDelete}
          />
        </View>
      );
    case "failed":
      return (
        <View style={styles.actions}>
          <GlassChip
            label={failed > 0 ? `Retry · ${failed} failed` : "Retry"}
            icon="refresh"
            accessibilityLabel={`Retry downloading ${target.title}`}
            onPress={retry}
          />
          <GlassChip
            label="Delete"
            icon="trash"
            accessibilityLabel={`Delete the downloaded audio for ${target.title}`}
            style={danger}
            onPress={confirmDelete}
          />
        </View>
      );
    case "cancelled":
      return (
        <View style={styles.actions}>
          <GlassChip
            label={progress ? `Resume · ${progress}` : "Resume"}
            icon="cloudDownload"
            accessibilityLabel={`Resume downloading ${target.title}`}
            onPress={retry}
          />
          <GlassChip
            label="Delete"
            icon="trash"
            accessibilityLabel={`Delete the downloaded audio for ${target.title}`}
            style={danger}
            onPress={confirmDelete}
          />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.xxs,
  },
});
