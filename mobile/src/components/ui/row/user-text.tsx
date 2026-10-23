/**
 * A line of the listener's own text.
 *
 * `ThemedText` has no opinion about direction, which is correct for labels and
 * numbers. A track title does: a Persian line left-aligned in a left-to-right
 * shell reads as broken, and its closing punctuation lands on the wrong side.
 *
 * `align="content"` is for a block whose own text is the content — a card title,
 * a description, a record title. A one-word language column and a numeric
 * readout keep the shell's alignment, because alternating a column row by row
 * reads as a broken table, not as a translated page.
 */

import type { StyleProp, TextStyle } from "react-native";

import type { ThemedTextProps } from "@/components/themed-text";
import { HighlightedText } from "@/components/ui/highlighted-text";
import { directionFor, textAlignFor } from "@/lib/textDirection";
import type { Range } from "@/lib/search";

export type UserTextProps = ThemedTextProps & {
  text: string;
  /** Ranges to tint — the search highlight. */
  ranges?: readonly Range[];
  /** `content` right-aligns only when this string reads RTL. */
  align?: "start" | "content";
  style?: StyleProp<TextStyle>;
};

export function UserText({
  text,
  ranges,
  align = "start",
  style,
  ...rest
}: UserTextProps) {
  const direction = directionFor(text);
  const textStyle: TextStyle = {
    writingDirection: direction,
    textAlign: textAlignFor(text, align),
  };

  return (
    <HighlightedText
      {...rest}
      text={text}
      ranges={ranges ?? []}
      style={[textStyle, style]}
    />
  );
}
