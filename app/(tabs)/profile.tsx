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

type Period = "month" | "all";

const formatCount = (n: number) => n.toLocaleString("en-US");
const formatETB = (n: number) =>
  `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} ETB`;

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

  const [period, setPeriod] = useState<Period>("month");

  // Counts grow without bound, so default to this month and keep all-time
  // one tap away. Approved value uses the admin's final qty/price if changed.
  const stats = useMemo(() => {
    const now = new Date();
    const scoped =
      period === "all"
        ? orders
        : orders.filter((o) => {
            const d = new Date(o.createdAt);
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
          });
    const approvedOrders = scoped.filter((o) => o.approvalStatus === "approved");
    return {
      total: scoped.length,
      // Not-yet-synced orders have no approval status yet; they're pending too.
      pending: scoped.filter((o) => o.approvalStatus === "pending" || !o.approvalStatus).length,
      approved: approvedOrders.length,
      rejected: scoped.filter((o) => o.approvalStatus === "rejected").length,
      approvedValue: approvedOrders.reduce(
        (sum, o) =>
          sum +
          o.items.reduce(
            (s, i) =>
              s + (i.finalQuantity ?? i.quantity) * (i.finalPriceAtSale ?? i.priceAtSale ?? 0),
            0,
          ),
        0,
      ),
    };
  }, [orders, period]);

  const statusRows = [
    { key: "approved", label: "Approved", count: stats.approved, color: colors.success },
    { key: "pending", label: "Pending", count: stats.pending, color: colors.warning },
    { key: "rejected", label: "Rejected", count: stats.rejected, color: colors.danger },
  ];

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

      <View style={styles.statsHeader}>
        <Text style={[styles.sectionLabel, styles.statsHeaderLabel]}>My orders</Text>
        <View style={styles.segmented} accessibilityRole="tablist">
          {(
            [
              { key: "month", label: "This month" },
              { key: "all", label: "All time" },
            ] as const
          ).map((opt) => {
            const active = period === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setPeriod(opt.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[styles.segment, active && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statsTop}>
          <View style={styles.statsTopCol}>
            <Text style={styles.statsBig} numberOfLines={1} adjustsFontSizeToFit>
              {formatCount(stats.total)}
            </Text>
            <Text style={styles.statsCaption}>
              {stats.total === 1 ? "order" : "orders"}
            </Text>
          </View>
          <View style={[styles.statsTopCol, styles.statsTopRight]}>
            <Text style={styles.statsValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatETB(stats.approvedValue)}
            </Text>
            <Text style={styles.statsCaption}>approved sales</Text>
          </View>
        </View>

        {/* Approval split — proportional bar, then exact counts */}
        <View style={styles.splitBar}>
          {stats.total === 0 ? (
            <View style={[styles.splitSeg, { flex: 1, backgroundColor: colors.surfaceMuted }]} />
          ) : (
            statusRows
              .filter((r) => r.count > 0)
              .map((r) => (
                <View key={r.key} style={[styles.splitSeg, { flex: r.count, backgroundColor: r.color }]} />
              ))
          )}
        </View>
        <View style={styles.statusList}>
          {statusRows.map((r) => (
            <View key={r.key} style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: r.color }]} />
              <Text style={styles.statusLabel}>{r.label}</Text>
              <Text style={styles.statusCount}>{formatCount(r.count)}</Text>
            </View>
          ))}
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

  statsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  statsHeaderLabel: { marginTop: 0, marginBottom: 0 },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    padding: 3,
  },
  segment: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  segmentActive: { backgroundColor: colors.surface, ...shadow.card },
  segmentText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  segmentTextActive: { color: colors.text },

  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  statsTop: { flexDirection: "row", alignItems: "flex-end", gap: spacing.lg },
  statsTopCol: { flex: 1, minWidth: 0 },
  statsTopRight: { alignItems: "flex-end" },
  statsBig: { fontSize: 32, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
  statsValue: { fontSize: 18, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  statsCaption: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  splitBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: radius.pill,
    overflow: "hidden",
    gap: 2,
    marginTop: spacing.lg,
  },
  splitSeg: { height: "100%" },
  statusList: { marginTop: spacing.md, gap: spacing.sm },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: radius.pill },
  statusLabel: { flex: 1, fontSize: 14, color: colors.text },
  statusCount: { fontSize: 14, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },

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
