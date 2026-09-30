/**
 * A row's title, with the run a search matched picked out.
 *
 * The point is not decoration. A Persian title can run to a dozen words and the
 * word the listener typed can sit anywhere in it — «نیزههای کاغذی - قسمت 1 -
 * حمله به افکار تو» matched on «افکار» is a hit the eye would otherwise have to
 * hunt for, and a hit you have to hunt for looks like a wrong result.
 *
 * The matched run is tinted with the accent rather than given a background
 * block: the titles it is used on are already semibold, so weight cannot carry
 * the signal, and a translucent highlight behind text of an unknown colour is a
 * contrast problem waiting to happen. One colour, applied to one run, in both
 * themes.
 */

import { useMemo } from "react";
import { Text } from "react-native";

import { ThemedText, type ThemedTextProps } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { highlight, type Range } from "@/lib/search";

export type HighlightedTextProps = ThemedTextProps & {
  text: string;
  /** Ranges into `text`, as `searchIndex` reports them. */
  ranges: readonly Range[];
};

export function HighlightedText({ text, ranges, ...rest }: HighlightedTextProps) {
  const theme = useTheme();
  const segments = useMemo(() => highlight(text, ranges), [text, ranges]);

  // Nothing matched — the overwhelmingly common case, including every row shown
  // with no query at all. Render the plain string rather than a list of one.
  if (!segments.some((segment) => segment.matched)) {
    return <ThemedText {...rest}>{text}</ThemedText>;
  }

  return (
    <ThemedText {...rest}>
      {segments.map((segment, index) => (
        <Text key={index} style={segment.matched ? { color: theme.accent } : undefined}>
          {segment.text}
        </Text>
      ))}
    </ThemedText>
  );
}
