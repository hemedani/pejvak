/**
 * An elastic pressable styled as a glass control.
 *
 * Kept as a named export because screens use it as the generic "tappable glass
 * thing" — the press physics all come from `ElasticPressable`.
 */

import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { ElasticPressable, type ElasticPressableProps } from "@/components/motion/ElasticPressable";

import { GlassRadius } from "./tokens";

export type GlassButtonProps = Omit<ElasticPressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
};

export function GlassButton({ style, ...props }: GlassButtonProps) {
  return <ElasticPressable {...props} style={[styles.base, style]} />;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: GlassRadius.control,
  },
});
