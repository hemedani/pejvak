import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Screen, ScreenHeader } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { CardSection, SegmentedControl } from "@/components/ui/card";
import {
  ColorField,
  NumberField,
  PasswordField,
  TagInput,
  TextArea,
  TimeField,
} from "@/components/ui/field";
import { KeyboardScrollView } from "@/components/ui/keyboard-scroll-view";
import { SearchField } from "@/components/ui/search-field";
import { TextField } from "@/components/ui/text-field";
import { useTheme } from "@/hooks/use-theme";
import {
  THEME_PREFERENCES,
  type ThemePreference,
} from "@/lib/settings";
import { useSettingsStore } from "@/store/settingsStore";
import { spacing } from "@/theme/tokens";

const THEME_OPTIONS = THEME_PREFERENCES.map((preference) => ({
  value: preference,
  label: preference[0].toUpperCase() + preference.slice(1),
}));

const MOTION_OPTIONS = [
  { value: "system" as const, label: "System" },
  { value: "full" as const, label: "Full" },
  { value: "reduced" as const, label: "Reduced" },
];

/**
 * The field gallery: every component, in every state, on one screen.
 *
 * It exists because the field layer has no render tests and a palette/ring
 * change is judged by eye. It is dev-only and never part of the product.
 */
export default function FieldGalleryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const themePreference = useSettingsStore((state) => state.themePreference);
  const motionPreference = useSettingsStore((state) => state.motionPreference);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setMotionPreference = useSettingsStore(
    (state) => state.setMotionPreference,
  );

  const [text, setText] = useState("");
  const [filled, setFilled] = useState("Syd");
  const [note, setNote] = useState("The chapter where everything turns.");
  const [password, setPassword] = useState("correct-horse");
  const [search, setSearch] = useState("");
  const [time, setTime] = useState(754);
  const [number, setNumber] = useState(30);
  const [tags, setTags] = useState(["Persian", "history"]);
  const [color, setColor] = useState<string | null>(null);

  if (!__DEV__) {
    return null;
  }

  return (
    <Screen wash={theme.accent}>
      <KeyboardScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <ScreenHeader
          onBack={() => router.back()}
          overline="DEVELOPER"
          title="Fields"
          subtitle="Every input, every state"
        />

        <CardSection title="REVIEW CONTROLS" index={1}>
          <View style={styles.control}>
            <ThemedText type="label" themeColor="textSecondary">
              Theme
            </ThemedText>
            <SegmentedControl
              accessibilityLabel="Theme"
              options={THEME_OPTIONS}
              value={themePreference}
              onChange={(value) => void setTheme(value as ThemePreference)}
            />
          </View>
          <View style={styles.control}>
            <ThemedText type="label" themeColor="textSecondary">
              Motion
            </ThemedText>
            <SegmentedControl
              accessibilityLabel="Motion"
              options={MOTION_OPTIONS}
              value={motionPreference}
              onChange={(value) => void setMotionPreference(value)}
            />
          </View>
        </CardSection>

        <CardSection title="TEXT" index={4} footer="Rest, filled, disabled, invalid, optional.">
          <View style={styles.stack}>
            <TextField
              label="Rest"
              value={text}
              onChangeText={setText}
              placeholder="Type here"
              hint="A hint sits under the track."
            />
            <TextField
              label="Filled"
              value={filled}
              onChangeText={setFilled}
              hint={null}
            />
            <TextField
              label="Disabled"
              value="Not editable"
              editable={false}
              onChangeText={() => {}}
            />
            <TextField
              label="Invalid"
              value="not-an-email"
              error="Enter a valid email address"
              onChangeText={() => {}}
            />
            <TextField
              label="Optional"
              optional
              value=""
              onChangeText={() => {}}
              showCounter
              maxLength={40}
            />
          </View>
        </CardSection>

        <CardSection title="PROSE & PASSWORD" index={7}>
          <View style={styles.stack}>
            <TextArea
              label="Note"
              value={note}
              onChangeText={setNote}
              placeholder="What stood out here?"
              showCounter
              maxLength={2000}
              hint="Grows to eight lines, then scrolls."
            />
            <PasswordField
              label="Password"
              value={password}
              onChangeText={setPassword}
            />
          </View>
        </CardSection>

        <CardSection title="SEARCH" index={10}>
          <View style={styles.stack}>
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search titles, folders, files…"
              hint={search.length > 0 ? `3 matches for “${search}”` : "Searches everything"}
              accessibilityLabel="Search the gallery"
            />
          </View>
        </CardSection>

        <CardSection title="TIME & NUMBER" index={13}>
          <View style={styles.stack}>
            <TimeField
              label="Position"
              valueSec={time}
              onChangeSec={setTime}
              maxSec={3600}
            />
            <NumberField
              label="Sleep"
              value={number}
              onChange={setNumber}
              min={1}
              max={180}
              unit="min"
              hint="Steppers stop at the bounds."
            />
          </View>
        </CardSection>

        <CardSection title="TAGS & COLOUR" index={16}>
          <View style={styles.stack}>
            <TagInput label="Tags" value={tags} onChange={setTags} />
            <ColorField label="Annotation colour" value={color} onChange={setColor} />
          </View>
        </CardSection>
      </KeyboardScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.giant,
    gap: spacing.xl,
  },
  control: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  stack: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
});
