import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";
import { colors, radius, spacing, shadow } from "@/constants/theme";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  seller: "Seller",
  viewer: "Viewer",
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const [fullName, setFullName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("user_profiles")
      .select("full_name, role")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        setFullName(data?.full_name ?? null);
        setRole(data?.role ?? null);
        setLoading(false);
      });
  }, [session]);

  const initials = (fullName || session?.user.email || "?")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <Text style={styles.headerTitle}>Profile</Text>

      <View style={styles.card}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={styles.name}>{fullName || "Unnamed"}</Text>
            <Text style={styles.email}>{session?.user.email}</Text>
            {role && (
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{ROLE_LABEL[role] ?? role}</Text>
              </View>
            )}
          </>
        )}
      </View>

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  headerTitle: { fontSize: 24, fontWeight: "800", color: colors.text, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    ...shadow.card,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  avatarText: { fontSize: 22, fontWeight: "700", color: colors.primary },
  name: { fontSize: 18, fontWeight: "700", color: colors.text },
  email: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  roleBadge: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  roleText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  signOutText: { color: colors.danger, fontSize: 14, fontWeight: "700" },
});
