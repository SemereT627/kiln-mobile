import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/context/theme-context";
import { radius, spacing } from "@/constants/theme";
import type { ThemeColors } from "@/constants/theme";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { session, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && session) {
    return <Redirect href="/(tabs)" />;
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (error) setError(error);
  }

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.brand}>
        <View style={styles.brandMark}>
          <Ionicons name="storefront" size={26} color="#fff" />
        </View>
        <Text style={styles.title}>Kiln Mobile</Text>
        <Text style={styles.subtitle}>Sign in to record sales.</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputWrap}>
          <Ionicons
            name="mail-outline"
            size={18}
            color={colors.textFaint}
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.inputWrap}>
          <Ionicons
            name="lock-closed-outline"
            size={18}
            color={colors.textFaint}
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textFaint}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={18}
              color={colors.textFaint}
            />
          </Pressable>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.error}>{error}</Text>
          </View>
        )}

        <Pressable
          style={[
            styles.button,
            (submitting || !email || !password) && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={submitting || !email || !password}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: spacing.xl,
      backgroundColor: colors.background,
    },
    brand: { alignItems: "center", marginBottom: spacing.xxl },
    brandMark: {
      width: 56,
      height: 56,
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.lg,
    },
    title: { fontSize: 24, fontWeight: "800", color: colors.text },
    subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
    form: { gap: spacing.md },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      height: 50,
    },
    inputIcon: {},
    input: { flex: 1, fontSize: 16, color: colors.text, height: "100%" },
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.md,
      padding: 10,
    },
    error: { color: colors.danger, fontSize: 13, flex: 1 },
    button: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: 15,
      alignItems: "center",
      marginTop: spacing.xs,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  });
}
