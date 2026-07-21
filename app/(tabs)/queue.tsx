import { useCallback, useMemo, useState } from "react";
import { View, Text, SectionList, Pressable, StyleSheet } from "react-native";
import { RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
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

/** Buckets orders into date sections the way a chat app would — Today,
 * Yesterday, then a plain date. Orders arrive pre-sorted by createdAt desc,
 * so same-day entries are always contiguous — no need to key by a map. */
function groupByDate(orders: PendingOrder[], now: Date) {
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const sections: { title: string; data: PendingOrder[] }[] = [];
  for (const order of orders) {
    const created = new Date(order.createdAt);
    const dayStr = created.toDateString();
    let title: string;
    if (dayStr === todayStr) title = "Today";
    else if (dayStr === yesterdayStr) title = "Yesterday";
    else {
      title = created.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: created.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      });
    }
    const lastSection = sections[sections.length - 1];
    if (lastSection && lastSection.title === title) {
      lastSection.data.push(order);
    } else {
      sections.push({ title, data: [order] });
    }
  }
  return sections;
}

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { signOut } = useAuth();
  const { orders, loaded, refreshing, refresh, reload, lastSyncedAt } = useOrders();
  const [syncIssue, setSyncIssueState] = useState<SyncIssue | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);

  useFocusEffect(
    useCallback(() => {
      getSyncIssue().then(setSyncIssueState);
    }, []),
  );

  const sections = useMemo(() => groupByDate(orders, new Date()), [orders]);

  async function handleDiscard(clientId: string) {
    await discardOrder(clientId);
    await reload();
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
          <Pressable style={styles.issueButton} onPress={signOut}>
            <Text style={styles.issueButtonText}>Log Out</Text>
          </Pressable>
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(o) => o.clientId}
        stickySectionHeadersEnabled
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
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeaderWrap}>
            <View style={styles.sectionHeaderPill}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          </View>
        )}
        renderItem={({ item, index }) => (
          <OrderCard order={item} index={index} onPress={setSelectedOrder} onDiscard={handleDiscard} />
        )}
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
  emptyWrap: { alignItems: "center", marginTop: 72, paddingHorizontal: 32, gap: 4, flex: 1, justifyContent: "center" },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  sectionHeaderWrap: {
    alignItems: "center",
    backgroundColor: colors.background,
    paddingVertical: spacing.sm,
  },
  sectionHeaderPill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  });
}
