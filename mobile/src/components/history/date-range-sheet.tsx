/**
 * Choosing a date range for the History list.
 *
 * A sheet rather than inline chips: the quick answers are one tap, but "the two
 * weeks I was travelling" needs two dates, and a row of chips in the header
 * would either hide that or push the list down permanently. Choosing a preset
 * applies it and closes — there is nothing to confirm about "last 7 days" —
 * while `Custom` reveals the two fields and waits for Apply.
 *
 * The panel has a fixed height and is lifted above the keyboard, so typing a
 * date never shrinks the sheet or hides the field behind the keypad.
 */

import { useState } from "react";
import { Modal, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { GlassChip, GlassSurface } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import { useSheetKeyboard } from "@/hooks/use-sheet-keyboard";
import { useTheme } from "@/hooks/use-theme";
import {
  ANY_DATE,
  DATE_PRESETS,
  formatDateInput,
  formatDateTyping,
  presetForRange,
  presetRange,
  rangeFromInputs,
  type DatePreset,
  type DateRange,
} from "@/lib/dateRange";
import { sheetHeightFor, sheetLiftFor } from "@/lib/sheetLayout";
import { useMotionEnabled } from "@/theme/motion";
import { spacing } from "@/theme/tokens";

const SHEET_HEIGHT_RATIO = 0.62;

export type DateRangeSheetProps = {
  range: DateRange;
  onApply: (range: DateRange) => void;
  onClose: () => void;
};

export function DateRangeSheet({ range, onApply, onClose }: DateRangeSheetProps) {
  const theme = useTheme();
  const motionEnabled = useMotionEnabled();
  const { height: windowHeight } = useWindowDimensions();
  const { insets, overlap, viewportHeight, onLayout } = useSheetKeyboard();
  const [preset, setPreset] = useState<DatePreset>(() => presetForRange(range));
  const [fromText, setFromText] = useState(
    range.from === null ? "" : formatDateInput(range.from),
  );
  const [toText, setToText] = useState(range.to === null ? "" : formatDateInput(range.to));
  const [error, setError] = useState<string | null>(null);

  const height = sheetHeightFor({
    // Before the root is measured there is no viewport yet; the window's own
    // height is the only honest stand-in for the first frame.
    windowHeight: viewportHeight || windowHeight,
    keyboardHeight: overlap,
    topInset: insets.top,
    ratio: SHEET_HEIGHT_RATIO,
  });

  const choose = (next: DatePreset) => {
    setPreset(next);
    setError(null);
    if (next === "custom") {
      return;
    }
    onApply(presetRange(next));
    onClose();
  };

  const apply = () => {
    const parsed = rangeFromInputs(fromText, toText);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    onApply(parsed.range);
    onClose();
  };

  return (
    <Modal
      visible
      transparent
      animationType={motionEnabled ? "fade" : "none"}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <View
        style={[
          styles.root,
          { paddingBottom: sheetLiftFor({ keyboardHeight: overlap, bottomInset: insets.bottom }) },
        ]}
        onLayout={onLayout}>
        <ElasticPressable
          accessibilityRole="button"
          accessibilityLabel="Close date filter"
          haptic="none"
          scaleTo={1}
          overshootTo={1}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
        />

        <GlassSurface
          tone="surfaceStrong"
          radius={34}
          clip
          elevated
          style={[styles.sheet, { height }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <ThemedText type="overline" themeColor="textTertiary">
                DATE RANGE
              </ThemedText>
              <ThemedText type="bodyStrong">When did you listen?</ThemedText>
            </View>
            {preset !== "any" ? (
              <ElasticPressable
                accessibilityRole="button"
                accessibilityLabel="Clear the date filter"
                haptic="tap"
                onPress={() => {
                  onApply(ANY_DATE);
                  onClose();
                }}>
                <ThemedText type="linkPrimary">Clear</ThemedText>
              </ElasticPressable>
            ) : null}
            <BouncyIconButton
              name="close"
              accessibilityLabel="Close"
              size={36}
              iconSize={18}
              tone="ghost"
              onPress={onClose}
            />
          </View>

          <ScrollView
            // The panel keeps its height and the body scrolls inside it: with
            // the keyboard up the custom block is taller than what is left, and
            // a clipped Apply button is worse than a scroll.
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}>
            <View style={styles.chips}>
              {DATE_PRESETS.map((option) => (
                <GlassChip
                  key={option.value}
                  label={option.label}
                  selected={preset === option.value}
                  onPress={() => choose(option.value)}
                />
              ))}
            </View>

            {preset === "custom" ? (
              <View style={styles.custom}>
                <View style={styles.fields}>
                  <TextField
                    label="From"
                    value={fromText}
                    onChangeText={(next) => {
                      setError(null);
                      setFromText((current) => formatDateTyping(next, current));
                    }}
                    placeholder="2026-03-09"
                    inputMode="numeric"
                    autoComplete="off"
                    importantForAutofill="no"
                    containerStyle={styles.field}
                    error={error}
                  />
                  <TextField
                    label="To"
                    value={toText}
                    onChangeText={(next) => {
                      setError(null);
                      setToText((current) => formatDateTyping(next, current));
                    }}
                    placeholder="2026-03-16"
                    inputMode="numeric"
                    autoComplete="off"
                    importantForAutofill="no"
                    containerStyle={styles.field}
                    returnKeyType="done"
                    submitBehavior="blurAndSubmit"
                    onSubmitEditing={apply}
                  />
                </View>
                <ThemedText type="caption" themeColor="textTertiary">
                  Days are included. Leave one side empty for an open range.
                </ThemedText>
                <PrimaryButton label="Apply" onPress={apply} />
              </View>
            ) : (
              <ThemedText type="caption" themeColor="textTertiary" style={styles.note}>
                Only listens that started inside the range are shown.
              </ThemedText>
            )}
          </ScrollView>
        </GlassSurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  custom: {
    gap: spacing.md,
  },
  fields: {
    flexDirection: "row",
    gap: spacing.md,
  },
  field: {
    flex: 1,
  },
  note: {
    paddingTop: spacing.xs,
  },
});
