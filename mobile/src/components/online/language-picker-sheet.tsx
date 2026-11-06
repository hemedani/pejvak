/**
 * One language for the listener's shelf.
 *
 * A modal rather than a route because it is a single choice made on top of the
 * screen that owns it: the Discover button says what is chosen, this says what
 * else could be. Choosing closes the sheet, so there is no second confirm.
 *
 * The list is only the languages that have a source behind them. Offering a
 * language that cannot be listened to would create a tab that opens onto an
 * empty state — a dead end dressed up as a setting.
 */

import { useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { LanguageRow } from "@/components/online/language-row";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { EmptyState } from "@/components/ui/row";
import { ListGroup } from "@/components/ui/row/list-group";
import { SearchField } from "@/components/ui/search-field";
import { useSheetKeyboard } from "@/hooks/use-sheet-keyboard";
import { useTheme } from "@/hooks/use-theme";
import {
  AVAILABLE_LANGUAGES,
  languageSearchFields,
  sourcesForLanguage,
} from "@/lib/online";
import { createSearchIndex, foldQuery, searchIndex } from "@/lib/search";
import { sheetHeightFor, sheetLiftFor } from "@/lib/sheetLayout";
import { useMotionEnabled } from "@/theme/motion";
import { spacing } from "@/theme/tokens";

/**
 * Share of the window the sheet takes when nothing is in its way.
 *
 * A fixed share rather than a content ceiling: the list has forty-six rows, so
 * a content-sized sheet would open at nearly full height and a `maxHeight`
 * would collapse to nothing the moment the keyboard shrank the window. One
 * number that the panel always fills keeps its shape, and the list inside it is
 * what scrolls.
 */
const SHEET_HEIGHT_RATIO = 0.7;

export type LanguagePickerSheetProps = {
  currentCode: string | null;
  onSelect: (code: string) => void;
  onClear: () => void;
  onClose: () => void;
};

export function LanguagePickerSheet({
  currentCode,
  onSelect,
  onClear,
  onClose,
}: LanguagePickerSheetProps) {
  const theme = useTheme();
  const motionEnabled = useMotionEnabled();
  const { height: windowHeight } = useWindowDimensions();
  const { insets, overlap, viewportHeight, onLayout } = useSheetKeyboard();
  const [query, setQuery] = useState("");

  /**
   * The panel's height, in the space the keyboard left.
   *
   * `viewportHeight` is what the modal window actually is right now; falling
   * back to the window's own height covers the first frame, before the root has
   * been measured.
   */
  const sheetHeight = sheetHeightFor({
    windowHeight: viewportHeight || windowHeight,
    keyboardHeight: overlap,
    topInset: insets.top,
    ratio: SHEET_HEIGHT_RATIO,
  });

  const index = useMemo(
    () => createSearchIndex(AVAILABLE_LANGUAGES, languageSearchFields, "title"),
    [],
  );
  const terms = useMemo(() => foldQuery(query), [query]);
  const searching = terms.length > 0;
  const visible = useMemo(
    () =>
      searching
        ? searchIndex(index, terms).map((hit) => hit.item)
        : AVAILABLE_LANGUAGES,
    [index, searching, terms],
  );

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const language of AVAILABLE_LANGUAGES) {
      counts[language.code] = sourcesForLanguage(language.code).length;
    }
    return counts;
  }, []);

  const choose = (code: string) => {
    onSelect(code);
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
          // The panel is lifted clear of the keyboard rather than left behind
          // it: the window may not have resized at all on Android 15+.
          { paddingBottom: sheetLiftFor({ keyboardHeight: overlap, bottomInset: insets.bottom }) },
        ]}
        onLayout={onLayout}>
        <ElasticPressable
          accessibilityRole="button"
          accessibilityLabel="Close language picker"
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
          style={[styles.sheet, { height: sheetHeight }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <ThemedText type="overline" themeColor="textTertiary">
                YOUR LANGUAGE
              </ThemedText>
              <ThemedText type="bodyStrong">Pick one language</ThemedText>
            </View>
            {currentCode ? (
              <ElasticPressable
                accessibilityRole="button"
                accessibilityLabel="Clear my language"
                haptic="tap"
                onPress={() => {
                  onClear();
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

          <View style={styles.search}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="English | Dutch | فارسی"
              accessibilityLabel="Find a language"
            />
          </View>

          <ScrollView
            // The list takes the room the header and the search field leave,
            // and scrolls inside it. The sheet itself never resizes.
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}>
            {visible.length > 0 ? (
              <ListGroup>
                {visible.map((language) => (
                  <LanguageRow
                    key={language.code}
                    language={language}
                    sourceCount={sourceCounts[language.code] ?? 0}
                    selected={language.code === currentCode}
                    onPress={() => choose(language.code)}
                  />
                ))}
              </ListGroup>
            ) : (
              <EmptyState
                icon="search"
                title={`No language matches “${query.trim()}”`}
              />
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
    paddingBottom: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  search: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
});
