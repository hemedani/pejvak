/**
 * A date, chosen from the platform's own calendar.
 *
 * ## Why not a text field
 *
 * It was one: a `TextField` that accepted `2026-03-09` and reformatted eight
 * digits as they were typed. It worked, and it was still the wrong control. A
 * date is a *choice among a finite set of valid answers* — nobody types one to
 * discover what it is — and the numeric keypad has no dash key, so the app had
 * to supply the separator, the parser had to accept three spellings, and the
 * field had to reject `2026-02-31` after the fact. The system calendar cannot
 * produce an invalid date, an inverted range, or a typo.
 *
 * `@expo/ui`'s `DateTimePicker` is the Expo-supported replacement for
 * `@react-native-community/datetimepicker`: Jetpack Compose's Material 3 dialog
 * on Android, a SwiftUI `DatePicker` on iOS. It is already a dependency, so this
 * adds no package.
 *
 * ## The two platforms present differently, and that is fine
 *
 * Android has no inline date picker worth the name, so the component opens a
 * dialog on mount and the caller unmounts it on confirm or cancel — this field
 * does exactly that. iOS renders in the view hierarchy, so the calendar opens
 * *under* the field and collapses when a day is tapped. Both are one tap from
 * the field and both end on a real date.
 */

import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { FieldShell } from "@/components/ui/field/field-shell";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";
import { formatDateInput, startOfDay } from "@/lib/dateRange";
import { spacing } from "@/theme/tokens";

export type DateFieldProps = {
  label: string;
  /** Start of the chosen day, or `null` when nothing is chosen. */
  value: number | null;
  onChange: (next: number | null) => void;
  placeholder?: string;
  error?: string | null;
  /** Show an × that empties the field. */
  clearable?: boolean;
  /** Earliest day the calendar will offer, if the answer has a floor. */
  minimumDate?: number | null;
  /** Latest day the calendar will offer, if the answer has a ceiling. */
  maximumDate?: number | null;
  containerStyle?: StyleProp<ViewStyle>;
};

export function DateField({
  label,
  value,
  onChange,
  placeholder = "Choose a date",
  error,
  clearable = true,
  minimumDate,
  maximumDate,
  containerStyle,
}: DateFieldProps) {
  const theme = useTheme();
  /**
   * The day the calendar opens on, or `null` while it is closed.
   *
   * An anchor rather than a boolean: the picker needs a concrete date, and
   * deciding it at the moment of the tap is what keeps an empty field opening on
   * today instead of on whatever the last render happened to produce.
   */
  const [anchor, setAnchor] = useState<number | null>(null);
  const shown = value === null ? null : formatDateInput(value);

  const openCalendar = () => setAnchor(value ?? Date.now());
  const closeCalendar = () => setAnchor(null);

  return (
    <View style={containerStyle}>
      <FieldShell
        label={label}
        error={error}
        trailing={
          shown !== null && clearable ? (
            <ElasticPressable
              accessibilityRole="button"
              accessibilityLabel={`Clear ${label.toLowerCase()}`}
              haptic="tap"
              onPress={() => onChange(null)}>
              <Icon name="close" size={16} color={theme.textTertiary} />
            </ElasticPressable>
          ) : null
        }>
        {/* The whole track opens the calendar, and the calendar glyph lives
            inside it rather than beside it: an affordance that is not part of
            the thing it announces is a tap that does nothing. Only the × is a
            sibling, because clearing is not opening. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${shown ?? placeholder}`}
          accessibilityHint="Opens the calendar"
          onPress={openCalendar}
          style={styles.press}>
          <ThemedText
            type="body"
            themeColor={shown ? "text" : "textTertiary"}
            numberOfLines={1}
            style={styles.value}>
            {shown ?? placeholder}
          </ThemedText>
          <Icon name="calendar" size={17} color={theme.textTertiary} />
        </Pressable>
      </FieldShell>

      {anchor !== null ? (
        <DateTimePicker
          value={new Date(anchor)}
          mode="date"
          // iOS draws a calendar; Android's default is the Material dialog,
          // which needs no display variant.
          display={Platform.OS === "ios" ? "inline" : "default"}
          accentColor={theme.accent}
          minimumDate={minimumDate === null || minimumDate === undefined ? undefined : new Date(minimumDate)}
          maximumDate={maximumDate === null || maximumDate === undefined ? undefined : new Date(maximumDate)}
          onValueChange={(_event, date) => {
            // Unmount first: on Android the component owns a dialog, and one
            // left mounted after a choice would try to present itself again.
            closeCalendar();
            onChange(startOfDay(date.getTime()));
          }}
          onDismiss={closeCalendar}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  press: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minWidth: 0,
  },
  value: {
    flexShrink: 1,
  },
});
