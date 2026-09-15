/**
 * Screen scaffold.
 *
 * Every screen shares the same canvas, the same ambient wash and the same
 * header rhythm, so navigating between them feels like moving around one
 * surface rather than jumping between separate apps.
 */

import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { AmbientWash } from "@/components/motion/AmbientWash";
import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { Reveal } from "@/components/motion/Reveal";
import { ThemedText } from "@/components/themed-text";
import { GlassBlurTarget } from "@/components/ui/glass/BlurTarget";
import { useScheme } from "@/hooks/use-theme";
import { colors, layout, spacing } from "@/theme/tokens";

export type ScreenProps = {
  children: ReactNode;
  /** Accent colour for the ambient wash. Usually the current track's palette. */
  wash?: string | null;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Centre the content in a max-width column (tablet and web). */
  constrain?: boolean;
};

export function Screen({
  children,
  wash,
  edges = ["top", "left", "right"],
  style,
  contentStyle,
  constrain = true,
}: ScreenProps) {
  const scheme = useScheme();

  return (
    <View style={[styles.root, { backgroundColor: colors[scheme].canvas }, style]}>
      {/* The target holds the whole background layer — canvas colour plus ambient
          wash — so the glass panels on this screen have something real to blur
          on Android. The panels are its siblings, not its children. */}
      <GlassBlurTarget
        style={[StyleSheet.absoluteFill, { backgroundColor: colors[scheme].canvas }]}
        background={wash ? <AmbientWash color={wash} /> : null}>
        <SafeAreaView style={styles.safe} edges={edges}>
          <View style={[styles.content, constrain && styles.constrained, contentStyle]}>
            {children}
          </View>
        </SafeAreaView>
      </GlassBlurTarget>
    </View>
  );
}

export type ScreenHeaderProps = {
  overline?: string;
  title: string;
  subtitle?: string;
  /** Trailing slot — a text link, an icon button, a segmented control. */
  action?: ReactNode;
  /** Renders a back control on the leading edge. */
  onBack?: () => void;
  index?: number;
};

export function ScreenHeader({
  overline,
  title,
  subtitle,
  action,
  onBack,
  index = 0,
}: ScreenHeaderProps) {
  return (
    <Reveal index={index} style={styles.header}>
      {onBack ? (
        <BouncyIconButton
          name="chevronLeft"
          accessibilityLabel="Go back"
          size={40}
          iconSize={20}
          tone="glass"
          onPress={onBack}
          style={styles.back}
        />
      ) : null}
      <View style={styles.headerCopy}>
        {overline ? (
          <ThemedText type="overline" themeColor="textTertiary">
            {overline}
          </ThemedText>
        ) : null}
        <ThemedText type="display" numberOfLines={2}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="caption" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {action ? <View style={styles.headerAction}>{action}</View> : null}
    </Reveal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  constrained: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  back: {
    marginBottom: spacing.xxs,
  },
  headerAction: {
    paddingBottom: spacing.xs,
  },
});
