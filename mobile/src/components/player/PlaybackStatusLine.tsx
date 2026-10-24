/**
 * The one line the player has to say about itself.
 *
 * A player that is fetching, and a player that has failed, are the same slot:
 * something the listener did not ask to read, placed where they are already
 * looking — under the timeline, above the controls it explains. It is also the
 * reason the transport button can afford to be a spinner: the words say what
 * is happening, the shape says it is happening now.
 *
 * `accessibilityLiveRegion` is deliberate. A wait that turns into a failure, or
 * into "still connecting", is a change nobody is looking at, so it is announced
 * rather than silently repainted.
 */

import { StyleSheet, View } from "react-native";

import { SpinnerRing } from "@/components/player/SpinnerRing";
import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { spacing } from "@/theme/tokens";

export type PlaybackStatusLineProps = {
  /** The sentence to show. */
  label: string;
  /** A second, quieter sentence once the wait has gone on. */
  detail?: string | null;
  /** A failure is a different thing to look at than a wait. */
  tone?: "neutral" | "danger";
  /** The player is working, so the glyph turns rather than sits. */
  spinning?: boolean;
};

export function PlaybackStatusLine({
  label,
  detail = null,
  tone = "neutral",
  spinning = false,
}: PlaybackStatusLineProps) {
  const theme = useTheme();
  const accent = tone === "danger" ? theme.danger : theme.accent;

  return (
    <View style={styles.root} accessibilityLiveRegion="polite">
      {spinning ? (
        <SpinnerRing size={16} thickness={2} color={accent} />
      ) : (
        <Icon name={tone === "danger" ? "alert" : "info"} size={15} color={accent} />
      )}
      <View style={styles.copy}>
        <ThemedText type="label" numberOfLines={2}>
          {label}
        </ThemedText>
        {detail ? (
          <ThemedText type="caption" themeColor="textTertiary">
            {detail}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
  },
});
