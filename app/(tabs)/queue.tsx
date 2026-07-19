import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAllOrders, discardOrder, getSyncIssue, type PendingOrder, type SyncIssue, type SyncStatus } from "@/lib/db";
import { runOrderSync, refreshOrderApprovalStatuses } from "@/lib/sync";
import { useAuth } from "@/context/auth-context";
import { colors, radius, spacing, shadow } from "@/constants/theme";

const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  pending: "Queued",
  syncing: "Syncing…",
  synced: "Synced",
  rejected: "Sync Failed",
};

const SYNC_STATUS_ICON: Record<SyncStatus, keyof typeof Ionicons.glyphMap> = {
  pending: "time-outline",
  syncing: "sync-outline",
  synced: "checkmark-circle-outline",
  rejected: "alert-circle-outline",
};

const SYNC_STATUS_COLOR: Record<SyncStatus, string> = {
  pending: colors.warning,
  syncing: colors.primary,
  synced: colors.success,
  rejected: colors.danger,
};

const APPROVAL_LABEL: Record<string, string> = {
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
};

const APPROVAL_COLOR: Record<string, string> = {
  pending: colors.warning,
  approved: colors.success,
  rejected: colors.danger,
};

const REASON_LABEL: Record<string, string> = {
  insufficient_stock: "Not enough stock left — adjust quantity or discard.",
  invalid_payload: "Invalid order data.",
  unknown_error: "Sync failed — will retry automatically.",
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  credit: "Pending / Credit",
};

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [syncIssue, setSyncIssueState] = useState<SyncIssue | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setOrders(await getAllOrders());
    setSyncIssueState(await getSyncIssue());
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshOrderApprovalStatuses().then(load);
    }, [load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await runOrderSync();
    await refreshOrderApprovalStatuses();
    await load();
    setRefreshing(false);
  }

  async function handleDiscard(clientId: string) {
    await discardOrder(clientId);
    await load();
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.headerTitle}>Order Queue</Text>
      </View>

      {syncIssue && (
        <View style={styles.issueBanner}>
          <Ionicons name="warning-outline" size={16} color={colors.danger} />
          <Text style={styles.issueText}>{syncIssue.message}</Text>
          <Pressable style={styles.issueButton} onPress={signOut}>
            <Text style={styles.issueButtonText}>Log Out</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={orders}
        keyExtractor={(o) => o.clientId}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
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
          const total = item.items.reduce(
            (sum, i) => sum + i.quantity * (i.priceAtSale ?? 0),
            0,
          );
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.name}>
                  {item.items.length} item{item.items.length !== 1 ? "s" : ""} ·{" "}
                  {total.toFixed(2)} ETB
                </Text>
                <View style={styles.statusRow}>
                  <Ionicons
                    name={SYNC_STATUS_ICON[item.status]}
                    size={13}
                    color={SYNC_STATUS_COLOR[item.status]}
                  />
                  <Text style={[styles.status, { color: SYNC_STATUS_COLOR[item.status] }]}>
                    {SYNC_STATUS_LABEL[item.status]}
                  </Text>
                </View>
              </View>
              <Text style={styles.meta}>
                {PAYMENT_LABEL[item.paymentMethod]}
                {item.bankAccount ? ` · ${item.bankAccount}` : ""} ·{" "}
                {new Date(item.createdAt).toLocaleString()}
              </Text>
              {item.items.map((line) => (
                <Text key={line.ceramicId} style={styles.lineItem}>
                  · {line.ceramicName} — {line.quantity}
                </Text>
              ))}

              {item.status === "synced" && item.approvalStatus && (
                <View
                  style={[
                    styles.approvalPill,
                    { backgroundColor: `${APPROVAL_COLOR[item.approvalStatus]}1a` },
                  ]}
                >
                  <Text
                    style={[styles.approvalStatus, { color: APPROVAL_COLOR[item.approvalStatus] }]}
                  >
                    {APPROVAL_LABEL[item.approvalStatus]}
                    {item.approvalStatus === "rejected" && item.rejectionReason
                      ? `: ${item.rejectionReason}`
                      : ""}
                  </Text>
                </View>
              )}

              {item.status === "rejected" && (
                <>
                  <Text style={styles.reason}>
                    {REASON_LABEL[item.failReason ?? ""] ??
                      "This order could not be synced."}
                  </Text>
                  <Pressable
                    style={styles.discardButton}
                    onPress={() => handleDiscard(item.clientId)}
                  >
                    <Ionicons name="trash-outline" size={13} color={colors.danger} />
                    <Text style={styles.discardButtonText}>Discard</Text>
                  </Pressable>
                </>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  emptyWrap: { alignItems: "center", marginTop: 72, paddingHorizontal: 32, gap: 4, flex: 1, justifyContent: "center" },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 10,
    ...shadow.card,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 15, fontWeight: "700", flex: 1, color: colors.text },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  status: { fontSize: 12, fontWeight: "700" },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  lineItem: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  approvalPill: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
  },
  approvalStatus: { fontSize: 12, fontWeight: "700" },
  reason: { fontSize: 12, color: colors.danger, marginTop: 8 },
  discardButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  discardButtonText: { color: colors.danger, fontWeight: "700", fontSize: 12 },
});
