import { useState } from "react";
import type { TextInputProps } from "react-native";

import { BouncyIconButton } from "@/components/motion/BouncyIconButton";
import { TextField, type TextFieldProps } from "@/components/ui/text-field";

export type PasswordFieldProps = Omit<
  TextFieldProps,
  "secureTextEntry" | "trailing"
> & {
  /** Defaults to autoComplete="current-password"; register passes "new-password". */
  autoComplete?: TextInputProps["autoComplete"];
};

/**
 * A password input with a reveal toggle.
 *
 * The toggle flips only `secureTextEntry`, never the value: the value belongs
 * to the form, and a reveal that reset it would silently throw away what the
 * listener typed. The glyph cross-fades because the meaning changes, and the
 * button's label says the *action*, not the current state.
 */
export function PasswordField({
  autoComplete = "current-password",
  ...rest
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      secureTextEntry={!visible}
      autoComplete={autoComplete}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      textContentType="password"
      importantForAutofill="yes"
      trailing={
        <BouncyIconButton
          name={visible ? "eyeOff" : "eye"}
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          size={30}
          iconSize={17}
          tone="ghost"
          onPress={() => setVisible((current) => !current)}
        />
      }
      {...rest}
    />
  );
}
