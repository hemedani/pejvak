/**
 * Empty, offline, failed and loading are four different things.
 *
 * A blank screen and a centred grey sentence are not answers: "no tracks yet",
 * "nothing matched that spelling", "the source could not be reached" and "this
 * load failed" each call for a different shape, and the first two need no
 * network while the last two might. This module gives each one a drawing so the
 * listener can tell them apart before reading.
 *
 * `SkeletonRows` is deliberately static. The motion rules forbid a decorative
 * loop, and a shimmer that never stops is a cost the listener only notices when
 * it is gone — the row shapes themselves are enough to say "loading".
 */

import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { hairline, list as listTokens, radius as radii, spacing } from "@/theme/tokens";

export type EmptyStateProps = {
  /** The sentence that says what is missing. */
  title: string;
  message?: string | null;
  icon?: IconName;
  /** A single next step, when one exists. */
  action?: ReactNode;
  testID?: string;
};

export function EmptyState({
  title,
  message,
  icon = "music",
  action,
  testID,
}: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View testID={testID} style={styles.empty}>
      <View style={[styles.emptyGlyph, { backgroundColor: theme.surfaceSunken }]}>
        <Icon name={icon} size={26} color={theme.textTertiary} />
      </View>
      <ThemedText type="bodyStrong" style={styles.centred}>
        {title}
      </ThemedText>
      {message ? (
        <ThemedText
          type="caption"
          themeColor="textSecondary"
          style={[styles.centred, styles.message]}>
          {message}
        </ThemedText>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

export type NoticeTone = "neutral" | "accent" | "danger";

export type InlineNoticeProps = {
  title: string;
  message?: string | null;
  tone?: NoticeTone;
  icon?: IconName;
  action?: ReactNode;
  /** Announce a one-off confirmation politely. */
  announce?: boolean;
  testID?: string;
};

export function InlineNotice({
  title,
  message,
  tone = "neutral",
  icon,
  action,
  announce = false,
  testID,
}: InlineNoticeProps) {
  const theme = useTheme();
  const colour =
    tone === "danger" ? theme.danger : tone === "accent" ? theme.accent : theme.textSecondary;
  const glyph = icon ?? (tone === "danger" ? "alert" : tone === "accent" ? "info" : "notes");

  return (
    <Card
      elevated={false}
      testID={testID}
      accessibilityLiveRegion={announce ? "polite" : undefined}
      style={[styles.notice, { borderColor: colour, borderWidth: hairline }]}>
      <View style={styles.noticeBody}>
        <Icon name={glyph} size={18} color={colour} />
        <View style={styles.noticeCopy}>
          <ThemedText type="bodyStrong" numberOfLines={2}>
            {title}
          </ThemedText>
          {message ? (
            <ThemedText type="caption" themeColor="textSecondary">
              {message}
            </ThemedText>
          ) : null}
        </View>
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </Card>
  );
}

export type SkeletonRowsProps = {
  /** 3–5 is enough to say "a list is coming". */
  count?: number;
  testID?: string;
};

export function SkeletonRows({ count = 4, testID }: SkeletonRowsProps) {
  const theme = useTheme();

  return (
    <View testID={testID} accessibilityLabel="Loading" style={styles.skeleton}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <View
            style={[
              styles.skeletonTile,
              { backgroundColor: theme.surfaceSunken },
            ]}
          />
          <View style={styles.skeletonCopy}>
            <View
              style={[
                styles.skeletonLine,
                { backgroundColor: theme.surfaceSunken, width: "62%" },
              ]}
            />
            <View
              style={[
                styles.skeletonLine,
                { backgroundColor: theme.surfaceSunken, width: "38%" },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    paddingVertical: spacing.giant,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyGlyph: {
    width: 56,
    height: 56,
    borderRadius: radii.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  centred: {
    textAlign: "center",
  },
  message: {
    maxWidth: 320,
  },
  action: {
    marginTop: spacing.md,
  },
  notice: {
    gap: spacing.sm,
  },
  noticeBody: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  noticeCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  skeleton: {
    gap: spacing.sm,
  },
  skeletonRow: {
    minHeight: listTokens.rowMinHeight,
    paddingHorizontal: listTokens.rowPadding,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  skeletonTile: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
  },
  skeletonCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  skeletonLine: {
    height: 10,
    borderRadius: radii.xs,
  },
});
