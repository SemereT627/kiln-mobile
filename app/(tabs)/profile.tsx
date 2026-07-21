import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/context/theme-context";
import { supabase } from "@/lib/supabase";
import { useOrders } from "@/hooks/use-orders";
import { radius, spacing, type ThemeColors, getShadow } from "@/constants/theme";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  seller: "Seller",
  viewer: "Viewer",
};

const ROLE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  admin: "shield-checkmark-outline",
  seller: "storefront-outline",
  viewer: "eye-outline",
};

function initialsFrom(name: string | null, email: string | undefined) {
  const source = (name || email || "?").trim();
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatMemberSince(iso: string | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors, shadow, scheme, toggleTheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);
  const { session, signOut } = useAuth();
  const [fullName, setFullName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { orders, refresh: refreshOrders, loaded: ordersLoaded, lastSyncedAt } = useOrders();

  const stats = {
    total: orders.length,
    pending: orders.filter((o) => o.approvalStatus === "pending").length,
    approved: orders.filter((o) => o.approvalStatus === "approved").length,
    rejected: orders.filter((o) => o.approvalStatus === "rejected").length,
  };

  const loadProfile = useCallback(async () => {
    if (!session) return;
    setLoadError(false);
    const { data, error } = await supabase
      .from("user_profiles")
      .select("full_name, role")
      .eq("id", session.user.id)
      .single();
    if (error) {
      setLoadError(true);
    } else {
      setFullName(data?.full_name ?? null);
      setRole(data?.role ?? null);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const [refreshing, setRefreshing] = useState(false);
  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadProfile(), refreshOrders()]);
    setRefreshing(false);
  }

  const initials = initialsFrom(fullName, session?.user.email);
  const memberSince = formatMemberSince(session?.user.created_at);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xl },
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
    >
      <Text style={styles.headerTitle}>Profile</Text>

      <View style={styles.heroCard}>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </View>

        {loading ? (
          <>
            <View style={[styles.skeletonLine, { width: 140, height: 20, marginTop: spacing.md }]} />
            <View style={[styles.skeletonLine, { width: 180, height: 14, marginTop: spacing.sm }]} />
          </>
        ) : loadError ? (
          <>
            <Text style={styles.name}>{session?.user.email}</Text>
            <Pressable style={styles.retryInline} onPress={loadProfile} hitSlop={8}>
              <Ionicons name="refresh" size={13} color={colors.primary} />
              <Text style={styles.retryInlineText}>Couldn't load your details — tap to retry</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.name}>{fullName || "Unnamed"}</Text>
            {role && (
              <View style={styles.roleBadge}>
                <Ionicons name={ROLE_ICON[role] ?? "person-outline"} size={13} color={colors.primary} />
                <Text style={styles.roleText}>{ROLE_LABEL[role] ?? role}</Text>
              </View>
            )}
          </>
        )}
      </View>

      {ordersLoaded && !lastSyncedAt && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.danger} />
          <Text style={styles.offlineBannerText}>
            Can't reach the server — counts below are from this device only.
          </Text>
        </View>
      )}

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue} allowFontScaling={false}>
            {stats.total}
          </Text>
          <Text style={styles.statLabel} allowFontScaling={false} numberOfLines={1}>
            Orders
          </Text>
        </View>
        <View style={[styles.statCard, styles.statDivider]}>
          <Text style={[styles.statValue, { color: colors.warning }]} allowFontScaling={false}>
            {stats.pending}
          </Text>
          <Text style={styles.statLabel} allowFontScaling={false} numberOfLines={1}>
            Pending
          </Text>
        </View>
        <View style={[styles.statCard, styles.statDivider]}>
          <Text style={[styles.statValue, { color: colors.success }]} allowFontScaling={false}>
            {stats.approved}
          </Text>
          <Text style={styles.statLabel} allowFontScaling={false} numberOfLines={1}>
            Approved
          </Text>
        </View>
        <View style={[styles.statCard, styles.statDivider]}>
          <Text style={[styles.statValue, { color: colors.danger }]} allowFontScaling={false}>
            {stats.rejected}
          </Text>
          <Text style={styles.statLabel} allowFontScaling={false} numberOfLines={1}>
            Rejected
          </Text>
        </View>
      </View>

      {lastSyncedAt && (
        <Text style={styles.syncCaption}>
          Synced{" "}
          {lastSyncedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </Text>
      )}

      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={styles.infoIconWrap}>
            <Ionicons name="mail-outline" size={16} color={colors.textMuted} />
          </View>
          <View style={styles.infoTextWrap}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{session?.user.email}</Text>
          </View>
        </View>

        <View style={styles.infoDivider} />

        <View style={styles.infoRow}>
          <View style={styles.infoIconWrap}>
            <Ionicons name="ribbon-outline" size={16} color={colors.textMuted} />
          </View>
          <View style={styles.infoTextWrap}>
            <Text style={styles.infoLabel}>Role</Text>
            <Text style={styles.infoValue}>{role ? ROLE_LABEL[role] ?? role : "—"}</Text>
          </View>
        </View>

        {memberSince && (
          <>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}>
                <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
              </View>
              <View style={styles.infoTextWrap}>
                <Text style={styles.infoLabel}>Member since</Text>
                <Text style={styles.infoValue}>{memberSince}</Text>
              </View>
            </View>
          </>
        )}
      </View>

      <Text style={styles.sectionLabel}>Appearance</Text>
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={styles.infoIconWrap}>
            <Ionicons
              name={scheme === "dark" ? "moon-outline" : "sunny-outline"}
              size={16}
              color={colors.textMuted}
            />
          </View>
          <View style={styles.infoTextWrap}>
            <Text style={styles.infoLabel}>Theme</Text>
            <Text style={styles.infoValue}>{scheme === "dark" ? "Dark" : "Light"}</Text>
          </View>
          <Switch
            value={scheme === "dark"}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors, shadow: ReturnType<typeof getShadow>) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },
  headerTitle: { fontSize: 24, fontWeight: "800", color: colors.text, marginBottom: spacing.lg },

  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    ...shadow.card,
  },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 24, fontWeight: "700", color: "#fff" },
  name: { fontSize: 19, fontWeight: "700", color: colors.text, marginTop: spacing.md },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  roleText: { fontSize: 12, fontWeight: "700", color: colors.primary },

  skeletonLine: { backgroundColor: colors.surfaceMuted, borderRadius: radius.sm },
  retryInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  retryInlineText: { fontSize: 12, fontWeight: "600", color: colors.primary },

  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  offlineBannerText: { flex: 1, fontSize: 12, fontWeight: "600", color: colors.danger },
  syncCaption: {
    fontSize: 11,
    color: colors.textFaint,
    textAlign: "center",
    marginTop: spacing.sm,
  },

  statsRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    ...shadow.card,
  },
  statCard: { flex: 1, alignItems: "center" },
  statDivider: {
    borderLeftWidth: 1,
    borderColor: colors.border,
  },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  infoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTextWrap: { flex: 1 },
  infoLabel: { fontSize: 12, color: colors.textMuted },
  infoValue: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: 1 },
  infoDivider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg + 32 + spacing.md },

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
}
