/**
 * Choosing a date range for a list.
 *
 * A sheet rather than inline chips: the quick answers are one tap, but "the two
 * weeks I was travelling" needs two dates, and a row of chips in the header
 * would either hide that or push the list down permanently. Choosing a preset
 * applies it and closes — there is nothing to confirm about "last 7 days" —
 * while `Custom` reveals the two date fields and waits for Apply.
 *
 * The two custom dates are **native calendars**, not text fields. See
 * `DateField` for why: the system picker cannot produce an invalid date, and an
 * inverted range is prevented by handing each field the other's bound rather
 * than validated afterwards.
 *
 * Nothing here can raise a keyboard any more, so the panel is a plain fixed
 * height with a scrollable body — the lift-above-the-keyboard machinery it used
 * to need lives on in the language picker, which still has a search field.
 */

import { useState } from "react";
import { Modal, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { ThemedText } from "@/components/themed-text";
import { DateField } from "@/components/ui/date-field";
import { GlassChip, GlassSurface } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useTheme } from "@/hooks/use-theme";
import {
  ANY_DATE,
  DATE_PRESETS,
  endOfDay,
  presetForRange,
  presetRange,
  startOfDay,
  type DatePreset,
  type DateRange,
} from "@/lib/dateRange";
import { sheetHeightFor, sheetLiftFor } from "@/lib/sheetLayout";
import { useMotionEnabled } from "@/theme/motion";
import { spacing } from "@/theme/tokens";

const SHEET_HEIGHT_RATIO = 0.62;

/** What the range is being applied to. Changes the sheet's own wording only. */
export type DateRangeSubject = "listens" | "notes";

export type DateRangeSheetProps = {
  range: DateRange;
  onApply: (range: DateRange) => void;
  onClose: () => void;
  subject?: DateRangeSubject;
};

const COPY: Record<DateRangeSubject, { title: string; presetNote: string }> = {
  listens: {
    title: "When did you listen?",
    presetNote: "Only listens that started inside the range are shown.",
  },
  notes: {
    title: "When did you write it?",
    presetNote: "Only notes written inside the range are shown.",
  },
};

export function DateRangeSheet({
  range,
  onApply,
  onClose,
  subject = "listens",
}: DateRangeSheetProps) {
  const theme = useTheme();
  const motionEnabled = useMotionEnabled();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const copy = COPY[subject];
  const [preset, setPreset] = useState<DatePreset>(() => presetForRange(range));
  // Both ends are held as the *start* of their day. A range's `to` is the last
  // millisecond of its day, so it is normalised on the way in and widened again
  // on the way out — a field showing "2026-03-16" must not be read back as
  // 00:00:00 of that day, which would drop everything written after midnight.
  const [from, setFrom] = useState<number | null>(
    range.from === null ? null : startOfDay(range.from),
  );
  const [to, setTo] = useState<number | null>(
    range.to === null ? null : startOfDay(range.to),
  );
  // Read once, at mount: a calendar that offered tomorrow would be offering a
  // day no listen and no note can be on. `Date.now()` cannot be called in the
  // render body — the compiler is right that it is impure — so it is captured
  // here instead, which is also the only moment the sheet needs it.
  const [today] = useState(() => Date.now());

  const height = sheetHeightFor({
    windowHeight,
    keyboardHeight: 0,
    topInset: insets.top,
    ratio: SHEET_HEIGHT_RATIO,
  });

  const choose = (next: DatePreset) => {
    setPreset(next);
    if (next === "custom") {
      return;
    }
    onApply(presetRange(next));
    onClose();
  };

  const apply = () => {
    onApply({ from, to: to === null ? null : endOfDay(to) });
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
          { paddingBottom: sheetLiftFor({ keyboardHeight: 0, bottomInset: insets.bottom }) },
        ]}>
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
              <ThemedText type="bodyStrong">{copy.title}</ThemedText>
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
            // The panel keeps its height and the body scrolls inside it: iOS
            // draws its calendar inline under the field, and a clipped Apply
            // button is worse than a scroll.
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
                  {/* Each field is bounded by the other, so an inverted range
                      cannot be built in the first place. */}
                  <DateField
                    label="From"
                    value={from}
                    onChange={setFrom}
                    maximumDate={to ?? today}
                    containerStyle={styles.field}
                  />
                  <DateField
                    label="To"
                    value={to}
                    onChange={setTo}
                    minimumDate={from}
                    maximumDate={today}
                    containerStyle={styles.field}
                  />
                </View>
                <ThemedText type="caption" themeColor="textTertiary">
                  Days are included. Leave one side empty for an open range.
                </ThemedText>
                <PrimaryButton label="Apply" onPress={apply} />
              </View>
            ) : (
              <ThemedText type="caption" themeColor="textTertiary" style={styles.note}>
                {copy.presetNote}
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
