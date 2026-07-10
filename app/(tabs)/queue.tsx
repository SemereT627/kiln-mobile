import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { getAllSales, discardSale, type PendingSale } from "@/lib/db";
import { runSync } from "@/lib/sync";
import { useAuth } from "@/context/auth-context";

const STATUS_LABEL: Record<PendingSale["status"], string> = {
  pending: "Pending Sync",
  syncing: "Syncing…",
  synced: "Synced",
  rejected: "Sync Failed",
};

const STATUS_COLOR: Record<PendingSale["status"], string> = {
  pending: "#d97706",
  syncing: "#2563eb",
  synced: "#059669",
  rejected: "#dc2626",
};

const REASON_LABEL: Record<string, string> = {
  insufficient_stock: "Not enough stock left — adjust quantity or discard.",
  invalid_payload: "Invalid sale data.",
  unknown_error: "Sync failed — will retry automatically.",
};

export default function QueueScreen() {
  const { signOut } = useAuth();
  const [sales, setSales] = useState<PendingSale[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setSales(await getAllSales());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await runSync();
    await load();
    setRefreshing(false);
  }

  async function handleDiscard(clientId: string) {
    await discardSale(clientId);
    await load();
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sales}
        keyExtractor={(s) => s.clientId}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <Text style={styles.empty}>No sales recorded yet.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{item.ceramicName}</Text>
              <Text style={[styles.status, { color: STATUS_COLOR[item.status] }]}>
                {STATUS_LABEL[item.status]}
              </Text>
            </View>
            <Text style={styles.meta}>
              Qty: {item.quantity} · Sold {new Date(item.soldAt).toLocaleString()}
            </Text>
            {item.status === "rejected" && (
              <>
                <Text style={styles.reason}>
                  {REASON_LABEL[item.failReason ?? ""] ??
                    "This sale could not be synced."}
                </Text>
                <Pressable
                  style={styles.discardButton}
                  onPress={() => handleDiscard(item.clientId)}
                >
                  <Text style={styles.discardButtonText}>Discard</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      />
      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  card: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between" },
  name: { fontSize: 15, fontWeight: "700", flex: 1 },
  status: { fontSize: 12, fontWeight: "700" },
  meta: { fontSize: 12, color: "#888", marginTop: 4 },
  reason: { fontSize: 12, color: "#dc2626", marginTop: 8 },
  discardButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "#fee2e2",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  discardButtonText: { color: "#dc2626", fontWeight: "700", fontSize: 12 },
  signOutButton: { padding: 16, alignItems: "center" },
  signOutText: { color: "#888", fontSize: 13, fontWeight: "600" },
});
