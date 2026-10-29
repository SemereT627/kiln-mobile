import { useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Updates from "expo-updates";
import { useTheme } from "@/context/theme-context";
import { getShadow, radius, spacing } from "@/constants/theme";

/**
 * In-app OTA updates (EAS Update). expo-updates already checks on cold
 * launch; this also checks whenever the app returns to the foreground,
 * downloads quietly, and then offers a restart instead of waiting for the
 * next cold launch. "Later" keeps a seller mid-sale from being interrupted —
 * the downloaded update still applies on the next launch.
 */
export function UpdateBanner() {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { isUpdateAvailable, isUpdatePending } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // Updates are disabled in dev builds / Expo Go; nothing to do there.
  const enabled = Updates.isEnabled && !__DEV__;

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        Updates.checkForUpdateAsync().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [enabled]);

  // Download as soon as the server reports a newer compatible update.
  useEffect(() => {
    if (enabled && isUpdateAvailable && !isUpdatePending) {
      Updates.fetchUpdateAsync().catch(() => {});
    }
  }, [enabled, isUpdateAvailable, isUpdatePending]);

  // A newly downloaded update deserves a fresh prompt.
  useEffect(() => {
    if (isUpdatePending) setDismissed(false);
  }, [isUpdatePending]);

  if (!enabled || !isUpdatePending || dismissed) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + spacing.sm }]}
    >
      <View
        accessibilityRole="alert"
        style={[
          styles.banner,
          getShadow(scheme).floating,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Ionicons name="cloud-download-outline" size={20} color={colors.primary} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text }]}>Update ready</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Restart Kiln to use the latest version.
          </Text>
        </View>
        <Pressable
          onPress={() => setDismissed(true)}
          hitSlop={8}
          accessibilityRole="button"
          style={styles.later}
        >
          <Text style={[styles.laterText, { color: colors.textMuted }]}>Later</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setRestarting(true);
            Updates.reloadAsync().catch(() => setRestarting(false));
          }}
          disabled={restarting}
          accessibilityRole="button"
          style={[styles.restart, { backgroundColor: colors.primary, opacity: restarting ? 0.6 : 1 }]}
        >
          <Text style={styles.restartText}>{restarting ? "Restarting…" : "Restart"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    zIndex: 100,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  copy: { flex: 1 },
  title: { fontSize: 15, fontWeight: "600" },
  body: { fontSize: 13, marginTop: 2 },
  later: { paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  laterText: { fontSize: 14, fontWeight: "500" },
  restart: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  restartText: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
});
