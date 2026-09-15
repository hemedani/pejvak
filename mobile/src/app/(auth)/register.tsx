import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";

import { Reveal } from "@/components/motion/Reveal";
import { Screen } from "@/components/motion/Screen";
import { ThemedText } from "@/components/themed-text";
import { GlassSurface } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { PrimaryButton } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import { useTheme } from "@/hooks/use-theme";
import { useAuthStore } from "@/store/authStore";
import { radius as radii, spacing } from "@/theme/tokens";

export default function RegisterScreen() {
  const theme = useTheme();
  const register = useAuthStore((state) => state.register);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const error = useAuthStore((state) => state.error);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const canSubmit =
    username.trim().length > 0 && email.trim().length > 0 && password.length > 0 && !isSubmitting;

  const onSubmit = () => {
    if (!canSubmit) {
      return;
    }
    void register({
      username: username.trim(),
      email: email.trim(),
      password,
      ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
    }).catch(() => undefined);
  };

  return (
    <Screen wash={theme.accent} edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Reveal index={0} style={styles.brand}>
            <View style={[styles.mark, { backgroundColor: theme.accent }]}>
              <Icon name="sparkle" size={26} color={theme.onAccent} />
            </View>
            <ThemedText type="overline" themeColor="textTertiary">
              START YOUR ARCHIVE
            </ThemedText>
          </Reveal>

          <Reveal index={1}>
            <GlassSurface tone="surfaceStrong" style={styles.card}>
              <View style={styles.header}>
                <ThemedText type="title">Create your account</ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  Your sessions and annotations stay with you across devices.
                </ThemedText>
              </View>

              <View style={styles.form}>
                <TextField
                  label="Username"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoComplete="username"
                  placeholder="listener"
                  returnKeyType="next"
                />
                <TextField
                  label="Display name (optional)"
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your name"
                  returnKeyType="next"
                />
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
                  autoComplete="new-password"
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

                <PrimaryButton label="Create account" loading={isSubmitting} onPress={onSubmit} />
              </View>
            </GlassSurface>
          </Reveal>

          <Reveal index={2} style={styles.footer}>
            <ThemedText type="caption" themeColor="textSecondary">
              Already have an account?
            </ThemedText>
            <Link href="/login">
              <ThemedText type="linkPrimary">Sign in</ThemedText>
            </Link>
          </Reveal>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
    borderRadius: 20,
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
