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
import {
  Modal,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { ElasticPressable } from "@/components/motion/ElasticPressable";
import { LanguageRow } from "@/components/online/language-row";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { EmptyState } from "@/components/ui/row";
import { ListGroup } from "@/components/ui/row/list-group";
import { SearchField } from "@/components/ui/search-field";
import { useTheme } from "@/hooks/use-theme";
import {
  AVAILABLE_LANGUAGES,
  languageSearchFields,
  sourcesForLanguage,
} from "@/lib/online";
import { createSearchIndex, foldQuery, searchIndex } from "@/lib/search";
import { useMotionEnabled } from "@/theme/motion";
import { spacing } from "@/theme/tokens";

/** Share of the screen height the language list may occupy before it scrolls. */
const LIST_HEIGHT_RATIO = 0.55;

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
  const insets = useSafeAreaInsets();
  const motionEnabled = useMotionEnabled();
  const { height: windowHeight } = useWindowDimensions();
  const [query, setQuery] = useState("");

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
      <View style={styles.root}>
        <ElasticPressable
          accessibilityRole="button"
          accessibilityLabel="Close language picker"
          haptic="none"
          scaleTo={1}
          overshootTo={1}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
        />

        <GlassSurface tone="surfaceStrong" radius={34} clip elevated style={styles.sheet}>
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
            style={{ maxHeight: Math.round(windowHeight * LIST_HEIGHT_RATIO) }}
            contentContainerStyle={styles.list}
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

        <View style={{ height: insets.bottom + spacing.md }} />
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
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
});
