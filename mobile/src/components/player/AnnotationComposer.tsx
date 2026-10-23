import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ColorField, TagInput, TextArea } from "@/components/ui/field";
import { GlassSheet } from "@/components/ui/glass";
import { PrimaryButton } from "@/components/ui/primary-button";
import { pickAnnotationColor } from "@/lib/annotations";
import type { LocalAnnotation } from "@/lib/db/types";
import { formatClock } from "@/lib/time";
import { spacing } from "@/theme/tokens";

export type AnnotationComposerProps = {
  positionSec: number;
  annotation: LocalAnnotation | null;
  creating: boolean;
  /** The palette colour a new note should start on. */
  initialColor?: string;
  onCancel: () => void;
  onSave: (input: {
    text: string;
    tags: string[];
    color: string;
  }) => Promise<boolean>;
};

/**
 * The note editor: text, tags, colour, and the actions that finish it.
 *
 * It is a component rather than a block in the route so the draft state has one
 * owner. The route still decides what "save" means, because only it knows
 * whether the note is being created or revised; this component only knows how
 * to collect the three fields and when they are complete.
 *
 * The group ref is passed to the text area's reveal target: the keyboard opens
 * over the sheet, and a note field revealed without the Cancel/Save row under it
 * lets the listener type but not finish.
 */
export function AnnotationComposer({
  positionSec,
  annotation,
  creating,
  initialColor,
  onCancel,
  onSave,
}: AnnotationComposerProps) {
  const groupRef = useRef<View>(null);
  const [text, setText] = useState(annotation?.text ?? "");
  const [tags, setTags] = useState<string[]>(annotation?.tags ?? []);
  const [color, setColor] = useState(
    annotation?.color ?? initialColor ?? pickAnnotationColor(0),
  );

  const canSave = text.trim().length > 0 && !creating;

  const submit = () => {
    if (!canSave) {
      return;
    }
    void onSave({ text: text.trim(), tags, color });
  };

  return (
    <GlassSheet open tone="surfaceStrong" style={styles.sheet}>
      <View ref={groupRef} collapsable={false} style={styles.group}>
        <TextArea
          testID="annotation-text"
          label={`${annotation ? "Edit note" : "Note"} at ${formatClock(positionSec)}`}
          value={text}
          onChangeText={setText}
          placeholder="What stood out here?"
          autoFocus
          revealTargetRef={groupRef}
        />

        <TagInput
          testID="annotation-tags"
          label="Tags"
          value={tags}
          onChange={setTags}
        />

        <ColorField value={color} onChange={setColor} />

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onCancel}>
            <ThemedText type="linkPrimary">Cancel</ThemedText>
          </Pressable>
          <PrimaryButton
            label={annotation ? "Save changes" : "Save note"}
            loading={creating}
            disabled={!canSave}
            onPress={submit}
            style={styles.save}
          />
        </View>
      </View>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    padding: spacing.lg,
  },
  group: {
    gap: spacing.lg,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  save: {
    flex: 1,
  },
});
