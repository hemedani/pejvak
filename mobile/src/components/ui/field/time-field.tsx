import { useState, type Ref } from "react";
import { StyleSheet, type TextInput } from "react-native";

import { TextField } from "@/components/ui/text-field";
import { clampSeconds, digitsToSeconds, formatClock } from "@/lib/time";

export type TimeFieldProps = {
  label: string;
  valueSec: number;
  onChangeSec: (seconds: number) => void;
  maxSec?: number;
  hint?: string | null;
  error?: string | null;
  autoFocus?: boolean;
  inputRef?: Ref<TextInput>;
  testID?: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * A timecode the listener can type with no separators.
 *
 * While focused it shows the raw digits, so the caret never fights a colon the
 * app inserted underneath it. Each digit is read from the right — seconds,
 * then minutes, then hours — and every valid change is reported immediately as
 * clamped integer seconds, so a Go button beside it can never read a stale
 * value. On blur the field settles into the same `m:ss` / `h:mm:ss` it will
 * show in the timeline.
 */
function compactTimecode(totalSec: number): string {
  const safe = clampSeconds(totalSec);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}${pad(minutes)}${pad(seconds)}`;
  }
  if (minutes > 0) {
    return `${minutes}${pad(seconds)}`;
  }
  return String(seconds);
}

export function TimeField({
  label,
  valueSec,
  onChangeSec,
  maxSec,
  hint,
  error,
  autoFocus = false,
  inputRef,
  testID,
}: TimeFieldProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => compactTimecode(valueSec));

  const display = focused ? draft : formatClock(clampSeconds(valueSec, maxSec));

  return (
    <TextField
      testID={testID}
      inputRef={inputRef}
      label={label}
      value={display}
      hint={hint ?? "Type digits: 1234 becomes 12:34"}
      error={error}
      autoFocus={autoFocus}
      keyboardType="number-pad"
      inputMode="numeric"
      maxLength={6}
      textAlign="left"
      style={styles.text}
      onFocus={() => {
        setDraft(compactTimecode(valueSec));
        setFocused(true);
      }}
      onBlur={() => {
        const seconds = clampSeconds(digitsToSeconds(draft), maxSec);
        setFocused(false);
        onChangeSec(seconds);
      }}
      onChangeText={(text) => {
        const digits = text.replace(/\D/g, "").slice(0, 6);
        setDraft(digits);
        onChangeSec(clampSeconds(digitsToSeconds(digits), maxSec));
      }}
    />
  );
}

const styles = StyleSheet.create({
  text: {
    fontVariant: ["tabular-nums"],
  },
});
