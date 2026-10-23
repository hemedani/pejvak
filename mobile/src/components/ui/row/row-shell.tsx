/**
 * The row layout contract.
 *
 * Every card and every dense row answers the same three questions: where does
 * the leading image go, how much room does the copy get, and what happens to
 * the controls when there is not enough? The answers live here so a folder, a
 * playlist, a session and an episode cannot disagree about them.
 *
 * ## What it does not own
 *
 * The surface. `MediaCard` wraps this in its own `Card` (with a wash and a
 * progress bar); `ListRow` renders it inside a `ListGroup`'s single card. A
 * shell that also drew the surface would force every density into the same
 * panel, which is exactly the "everything is a card" defect this replaces.
 *
 * ## Nothing is silently dropped
 *
 * The action cluster is planned by `planRowLayout`. Inline first; then its own
 * line inside the row; only then the overflow menu. The primary action stays
 * visible in every layout, and the accessibility hint names the menu when one
 * exists.
 */

import { useState, type ReactNode } from "react";
import { Dimensions, StyleSheet, View } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { RowActionMenu, type RowAction } from "@/components/ui/row/row-actions";
import { StatusLine } from "@/components/ui/row/status-line";
import { UserText } from "@/components/ui/row/user-text";
import { useTheme } from "@/hooks/use-theme";
import { cardWidthFor, planRowLayout, type RowActionSlot } from "@/lib/cardLayout";
import type { StatusSpec } from "@/lib/rowStatus";
import type { Range } from "@/lib/search";
import { control, layout, list as listTokens, spacing } from "@/theme/tokens";

export type RowDensity = "shelf" | "dense";

export type RowShellProps = {
  density: RowDensity;
  leading?: ReactNode;
  /** Must match the rendered tile's width; drives `planRowLayout`. */
  leadingWidth?: number;
  title: string;
  titleRanges?: readonly Range[];
  titleLines?: number;
  /** `content` follows the title's own direction; `start` keeps a column aligned. */
  titleAlign?: "start" | "content";
  meta?: string | null;
  detail?: string | null;
  status?: StatusSpec | null;
  trailing?: ReactNode;
  actions?: readonly RowAction[];
  onPress?: () => void;
  disabled?: boolean;
  /** Spoken reason a disabled row cannot be used. */
  disabledReason?: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** The row's width. Falls back to the window's content column. */
  cardWidth?: number;
  testID?: string;
};

export function RowShell({
  density,
  leading,
  leadingWidth = 0,
  title,
  titleRanges,
  titleLines,
  titleAlign = "content",
  meta,
  detail,
  status,
  trailing,
  actions,
  onPress,
  disabled = false,
  disabledReason,
  accessibilityLabel,
  accessibilityHint,
  cardWidth,
  testID,
}: RowShellProps) {
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const width =
    cardWidth ??
    cardWidthFor({
      windowWidth: Dimensions.get("window").width,
      inset: spacing.xl,
      maxContentWidth: layout.maxContentWidth,
    });

  const shelf = density === "shelf";
  // A menu-only action must not consume width in the plan, or the controls that
  // do belong beside the copy would be pushed out to make room for it.
  const planned = (actions ?? []).filter((action) => !action.menuOnly);
  const slots: RowActionSlot[] = planned.map((action) => ({
    key: action.key,
    width: action.width,
    priority: action.priority,
  }));

  const plan = planRowLayout({
    width,
    padding: shelf ? spacing.md * 2 : listTokens.rowPadding * 2,
    tile: leadingWidth,
    gap: spacing.md,
    actionGap: spacing.sm,
    copyMinWidth: 132,
    actions: slots,
    overflowWidth: control.md,
  });

  const inline = plan.inline
    .map((key) => planned.find((action) => action.key === key))
    .filter((action): action is RowAction => action !== undefined);
  const overflow = (actions ?? []).filter(
    (action) => action.menuOnly || plan.overflow.includes(action.key),
  );

  const resolvedHint = disabled
    ? (disabledReason ?? accessibilityHint)
    : overflow.length > 0
      ? [accessibilityHint, "More actions are in the menu."].filter(Boolean).join(" ")
      : accessibilityHint;

  const bodyContent = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.copy}>
        <UserText
          type="bodyStrong"
          numberOfLines={titleLines ?? (shelf ? 1 : 2)}
          text={title}
          ranges={titleRanges}
          align={titleAlign}
        />
        {meta ? (
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
            {meta}
          </ThemedText>
        ) : null}
        {detail ? (
          <ThemedText type="caption" themeColor="textTertiary" numberOfLines={1}>
            {detail}
          </ThemedText>
        ) : null}
        <StatusLine status={status} />
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </>
  );

  return (
    <>
      <View
        style={[
          styles.content,
          shelf ? styles.shelf : styles.dense,
          plan.reflow ? styles.stack : styles.inline,
        ]}>
        {onPress || disabled ? (
          <ElasticPressable
            testID={testID ? `${testID}-body` : "row-body"}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={resolvedHint}
            accessibilityState={{ disabled }}
            disabled={disabled}
            scaleTo={0.985}
            overshootTo={1.004}
            haptic="tap"
            onPress={onPress}
            style={[styles.body, plan.reflow ? null : styles.bodyInline]}>
            {bodyContent}
          </ElasticPressable>
        ) : (
          <View
            testID={testID ? `${testID}-body` : "row-body"}
            style={[styles.body, plan.reflow ? null : styles.bodyInline]}>
            {bodyContent}
          </View>
        )}

        {inline.length > 0 || overflow.length > 0 ? (
          <View style={[styles.actions, plan.reflow ? styles.actionsReflow : null]}>
            {inline.map((action) => (
              <View key={action.key} testID={`row-action-${action.key}`}>
                {action.node}
              </View>
            ))}
            {overflow.length > 0 ? (
              <ElasticPressable
                testID="row-overflow"
                accessibilityRole="button"
                accessibilityLabel={`More actions for ${title}`}
                scaleTo={0.86}
                overshootTo={1.08}
                haptic="select"
                onPress={() => setMenuOpen(true)}
                style={styles.overflowButton}>
                <Icon name="more" size={18} color={theme.icon} />
              </ElasticPressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {menuOpen ? (
        <RowActionMenu
          title={title}
          actions={overflow}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: {},
  shelf: {
    padding: spacing.md,
    paddingRight: spacing.sm,
  },
  dense: {
    paddingHorizontal: listTokens.rowPadding,
    paddingVertical: listTokens.rowPadding,
    minHeight: listTokens.rowMinHeight,
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stack: {
    gap: spacing.sm,
  },
  body: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minWidth: 0,
  },
  bodyInline: {
    flex: 1,
  },
  leading: {
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  trailing: {
    alignItems: "flex-end",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  actionsReflow: {
    justifyContent: "flex-end",
  },
  overflowButton: {
    width: control.md,
    height: control.md,
    borderRadius: control.md / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
