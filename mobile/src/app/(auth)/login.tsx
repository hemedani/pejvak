import { Link } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Reveal } from "@/components/motion/Reveal";
import { Screen } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { KeyboardScrollView } from "@/components/ui/keyboard-scroll-view";

import { Icon } from "@/components/ui/icon";
import { PrimaryButton } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import { useTheme } from "@/hooks/use-theme";
import { useAuthStore } from "@/store/authStore";
import { radius as radii, spacing } from "@/theme/tokens";

export default function LoginScreen() {
  const theme = useTheme();
  const login = useAuthStore((state) => state.login);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const error = useAuthStore((state) => state.error);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && !isSubmitting;

  const onSubmit = () => {
    if (!canSubmit) {
      return;
    }
    void login({ email: email.trim(), password }).catch(() => undefined);
  };

  return (
    <Screen wash={theme.accent} edges={["top", "bottom", "left", "right"]}>
      {/* `KeyboardScrollView` is the avoidance — no `KeyboardAvoidingView`
          alongside it, or the keyboard gets counted twice. */}
      <KeyboardScrollView contentContainerStyle={styles.content}>
        <Reveal index={0} style={styles.brand}>
          <View style={[styles.mark, { backgroundColor: theme.accent }]}>
            <Icon name="music" size={26} color={theme.onAccent} />
          </View>
          <ThemedText type="overline" themeColor="textTertiary">
            PEJVAK
          </ThemedText>
        </Reveal>

        <Reveal index={1}>
          <Card style={styles.card}>
            <View style={styles.header}>
              <ThemedText type="title">Welcome back</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                Sign in to keep your listening history and notes in sync.
              </ThemedText>
            </View>

            <View style={styles.form}>
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
                returnKeyType="next"
                textContentType="emailAddress"
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                autoComplete="current-password"
                placeholder="••••••••"
                secureTextEntry
                returnKeyType="go"
                onSubmitEditing={onSubmit}
              />

              {error ? (
                <ThemedText type="caption" style={{ color: theme.danger }}>
                  {error}
                </ThemedText>
              ) : null}

              <PrimaryButton
                label="Sign in"
                loading={isSubmitting}
                onPress={onSubmit}
              />
            </View>
          </Card>
        </Reveal>

        <Reveal index={2} style={styles.footer}>
          <ThemedText type="caption" themeColor="textSecondary">
            New to Pejvak?
          </ThemedText>
          <Link href="/register">
            <ThemedText type="linkPrimary">Create an account</ThemedText>
          </Link>
        </Reveal>
      </KeyboardScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
    gap: spacing.xxl,
  },
  brand: {
    alignItems: "center",
    gap: spacing.sm,
  },
  mark: {
    width: 62,
    height: 62,
    // A 62pt mark takes the same shape language as a 46pt tile, scaled:
    // both sit at roughly a third of their diameter.
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    gap: spacing.xxl,
    padding: spacing.xxl,
    borderRadius: radii.xl,
  },
  header: {
    gap: spacing.sm,
  },
  form: {
    gap: spacing.lg,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
});
