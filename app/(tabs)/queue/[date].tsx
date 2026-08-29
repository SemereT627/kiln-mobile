import { useMemo, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { discardOrder, type PendingOrder } from "@/lib/db";
import { useOrders } from "@/hooks/use-orders";
import { OrderCard } from "@/components/order-card";
import { OrderDetailSheet } from "@/components/order-detail-sheet";
import { useTheme } from "@/context/theme-context";
import { radius, spacing } from "@/constants/theme";
import type { ThemeColors } from "@/constants/theme";
import { groupOrdersByDate } from "@/lib/order-groups";

/** A single earlier day's orders, pushed from the day list at /queue. Reuses
 * the same order data/merge logic as the day list — filtered down to one
 * day — rather than threading the day's orders through as a route param. */
export default function QueueDayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { orders, reload } = useOrders();
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);

  const group = useMemo(() => {
    const groups = groupOrdersByDate(orders, new Date());
    return groups.find((g) => g.dateKey === date) ?? null;
  }, [orders, date]);

  const dayOrders = group?.data ?? [];

  async function handleDiscard(clientId: string) {
    await discardOrder(clientId);
    await reload();
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {group?.title ?? "Orders"}
        </Text>
        <View style={styles.backButton} />
      </View>

      <FlatList
        data={dayOrders}
        keyExtractor={(o) => o.clientId}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.xl,
          flexGrow: 1,
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="receipt-outline" size={40} color={colors.textFaint} />
            <Text style={styles.emptyTitle}>No orders on this day</Text>
          </View>
        }
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
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    backButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
    headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: colors.text },
    emptyWrap: { alignItems: "center", marginTop: 72, paddingHorizontal: 32, gap: 4, flex: 1, justifyContent: "center" },
    emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginTop: 12 },
  });
}
