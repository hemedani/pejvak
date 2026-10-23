import { useState } from "react";
import { StyleSheet } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { TextField } from "@/components/ui/text-field";

export type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string | null;
  disabled?: boolean;
  testID?: string;
};

function clampInteger(value: number, min: number, max: number): number {
  const safe = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(max, Math.max(min, safe));
}

/**
 * A bounded integer with steppers.
 *
 * The steppers are the primary control — a number that is always adjusted by
 * one or two does not deserve a keyboard — and they disable at the bounds
 * rather than silently clamping a press, so the listener can see the edge.
 * Typing is still allowed for a big jump, and an empty draft reverts on blur
 * instead of committing a zero the listener never asked for.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  hint,
  disabled = false,
  testID,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const atMin = value <= min;
  const atMax = value >= max;

  const stepBy = (delta: number) => {
    setDraft(null);
    onChange(clampInteger(value + delta, min, max));
  };

  return (
    <TextField
      testID={testID}
      label={unit ? `${label} (${unit})` : label}
      value={draft ?? String(value)}
      hint={hint}
      editable={!disabled}
      inputMode="numeric"
      keyboardType="number-pad"
      selectTextOnFocus
      style={styles.text}
      onChangeText={(text) => {
        const digits = text.replace(/\D/g, "");
        if (digits.length === 0) {
          setDraft("");
          return;
        }
        const next = clampInteger(Number(digits), min, max);
        setDraft(String(next));
        if (next !== value) {
          onChange(next);
        }
      }}
      onBlur={() => setDraft(null)}
      leading={
        <BouncyIconButton
          name="minus"
          accessibilityLabel="Decrease"
          size={30}
          iconSize={16}
          tone="ghost"
          disabled={disabled || atMin}
          onPress={() => stepBy(-step)}
        />
      }
      trailing={
        <BouncyIconButton
          name="add"
          accessibilityLabel="Increase"
          size={30}
          iconSize={16}
          tone="ghost"
          disabled={disabled || atMax}
          onPress={() => stepBy(step)}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  text: {
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
});
