import { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { RefreshControl } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { discardOrder, getSyncIssue, type PendingOrder, type SyncIssue } from "@/lib/db";
import { useOrders } from "@/hooks/use-orders";
import { useAuth } from "@/context/auth-context";
import { OrderCard } from "@/components/order-card";
import { OrderDetailSheet } from "@/components/order-detail-sheet";
import { useTheme } from "@/context/theme-context";
import { radius, spacing } from "@/constants/theme";
import type { ThemeColors } from "@/constants/theme";
import { groupOrdersByDate, type OrderDayGroup } from "@/lib/order-groups";

/** One row in the flat list below: today's cards render inline (most
 * common thing a seller checks, shouldn't cost an extra tap), every other
 * day collapses to a single compact row that pushes to /queue/[date]. */
type Row =
  | { kind: "order"; order: PendingOrder; index: number }
  | { kind: "day-row"; group: OrderDayGroup }
  | { kind: "earlier-label" };

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { signOut } = useAuth();
  const { orders, loaded, refreshing, refresh, reload, lastSyncedAt } = useOrders();
  const [syncIssue, setSyncIssueState] = useState<SyncIssue | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);

  useFocusEffect(
    useCallback(() => {
      getSyncIssue().then(setSyncIssueState);
    }, []),
  );

  const groups = useMemo(() => groupOrdersByDate(orders, new Date()), [orders]);
  const todayGroup = groups[0]?.title === "Today" ? groups[0] : null;
  const otherGroups = todayGroup ? groups.slice(1) : groups;

  const rows: Row[] = useMemo(() => {
    const result: Row[] = [];
    todayGroup?.data.forEach((order, index) => result.push({ kind: "order", order, index }));
    if (otherGroups.length > 0) result.push({ kind: "earlier-label" });
    otherGroups.forEach((group) => result.push({ kind: "day-row", group }));
    return result;
  }, [todayGroup, otherGroups]);

  async function handleDiscard(clientId: string) {
    await discardOrder(clientId);
    await reload();
  }

  async function handleRetrySync() {
    // Covers the common case (transient network blip, token already
    // refreshed) without forcing a full logout when that isn't necessary —
    // Log Out stays for when it actually is (dead refresh token).
    await refresh();
    setSyncIssueState(await getSyncIssue());
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.headerTitle}>Order Queue</Text>
        {lastSyncedAt && (
          <Text style={styles.syncCaption}>
            Synced{" "}
            {lastSyncedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </Text>
        )}
      </View>

      {loaded && !lastSyncedAt && (
        <View style={styles.issueBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
          <Text style={styles.issueText}>
            Can't reach the server — showing what's saved on this device only.
          </Text>
        </View>
      )}

      {syncIssue && (
        <View style={styles.issueBanner}>
          <Ionicons name="warning-outline" size={16} color={colors.danger} />
          <Text style={styles.issueText}>{syncIssue.message}</Text>
          <Pressable style={styles.issueButtonOutline} onPress={handleRetrySync}>
            <Text style={styles.issueButtonOutlineText}>Retry</Text>
          </Pressable>
          <Pressable style={styles.issueButton} onPress={signOut}>
            <Text style={styles.issueButtonText}>Log Out</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(row) =>
          row.kind === "order"
            ? row.order.clientId
            : row.kind === "day-row"
              ? row.group.dateKey
              : "earlier-label"
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.xl,
          flexGrow: 1,
        }}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="receipt-outline" size={40} color={colors.textFaint} />
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptySubtitle}>
                Orders you submit from Sell will show up here.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.kind === "order") {
            return (
              <OrderCard
                order={item.order}
                index={item.index}
                onPress={setSelectedOrder}
                onDiscard={handleDiscard}
              />
            );
          }
          if (item.kind === "earlier-label") {
            return <Text style={styles.earlierLabel}>Earlier</Text>;
          }
          return (
            <Pressable
              style={({ pressed }) => [styles.dayRow, pressed && styles.dayRowPressed]}
              onPress={() => router.push(`/queue/${encodeURIComponent(item.group.dateKey)}`)}
            >
              <View style={styles.dayRowIcon}>
                <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dayRowTitle}>{item.group.title}</Text>
                <Text style={styles.dayRowSub}>
                  {item.group.data.length} order{item.group.data.length !== 1 ? "s" : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          );
        }}
      />

      <OrderDetailSheet
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onDiscard={handleDiscard}
      />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: colors.text },
  syncCaption: { fontSize: 12, color: colors.textMuted },
  issueBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  issueText: { flex: 1, fontSize: 12, fontWeight: "600", color: colors.danger },
  issueButton: {
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  issueButtonText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  issueButtonOutline: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  issueButtonOutlineText: { color: colors.danger, fontWeight: "700", fontSize: 12 },
  emptyWrap: { alignItems: "center", marginTop: 72, paddingHorizontal: 32, gap: 4, flex: 1, justifyContent: "center" },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  earlierLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  dayRowPressed: { opacity: 0.7 },
  dayRowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  dayRowTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  dayRowSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  });
}
