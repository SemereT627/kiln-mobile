import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  Modal,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as Crypto from "expo-crypto";
import { API_BASE_URL, supabase } from "@/lib/supabase";
import {
  cacheCatalog,
  getCachedCatalog,
  getUnsyncedQuantity,
  enqueueSale,
  type CachedCeramic,
} from "@/lib/db";
import { runSync } from "@/lib/sync";
import { useAuth } from "@/context/auth-context";

export default function SellScreen() {
  const { session } = useAuth();
  const [catalog, setCatalog] = useState<CachedCeramic[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<CachedCeramic | null>(null);
  const [quantity, setQuantity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ceramics?limit=-1`);
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      const items: CachedCeramic[] = (json.data || []).map((i: any) => ({
        id: i._id,
        name: i.name,
        productId: i.productId,
        brand: i.brand,
        size: i.size,
        measurementUnit: i.measurementUnit || "m²",
        pricePerUnit: i.pricePerUnit ?? null,
        currentStock: i.currentStock,
      }));
      await cacheCatalog(items);
      setCatalog(items);
      setLastSyncedAt(Date.now());
    } catch {
      // Offline — fall back to the last-known snapshot.
      const cached = await getCachedCatalog();
      setCatalog(cached);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  async function handleRefresh() {
    setRefreshing(true);
    await runSync();
    await loadCatalog();
    setRefreshing(false);
  }

  async function openSaleModal(item: CachedCeramic) {
    setSelected(item);
    setQuantity("");
  }

  async function confirmSale() {
    if (!selected || !session) return;
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) return;

    setSubmitting(true);
    const clientId = Crypto.randomUUID();
    await enqueueSale({
      clientId,
      ceramicId: selected.id,
      ceramicName: selected.name,
      quantity: qty,
      priceAtSale: selected.pricePerUnit,
      soldAt: new Date().toISOString(),
    });
    setSubmitting(false);
    setSelected(null);
    setQuantity("");
    // Best-effort immediate sync; if offline this just stays queued.
    runSync();
  }

  const filtered = catalog.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.productId.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search products..."
        value={search}
        onChangeText={setSearch}
      />
      <Text style={styles.syncNote}>
        {lastSyncedAt
          ? `Catalog synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
          : "Showing last-known catalog (offline)"}
      </Text>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => <CatalogRow item={item} onPress={openSaleModal} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No products found.</Text>
        }
      />

      <Modal visible={!!selected} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{selected?.name}</Text>
            <Text style={styles.modalSubtitle}>
              {selected?.brand} · {selected?.size} · Stock:{" "}
              {selected?.currentStock.toFixed(2)} {selected?.measurementUnit}
            </Text>
            <TextInput
              style={styles.qtyInput}
              placeholder={`Quantity (${selected?.measurementUnit ?? ""})`}
              keyboardType="decimal-pad"
              value={quantity}
              onChangeText={setQuantity}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setSelected(null)}
              >
                <Text style={styles.buttonSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.buttonPrimary]}
                onPress={confirmSale}
                disabled={submitting || !quantity}
              >
                <Text style={styles.buttonPrimaryText}>
                  {submitting ? "Saving..." : "Record Sale"}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function CatalogRow({
  item,
  onPress,
}: {
  item: CachedCeramic;
  onPress: (item: CachedCeramic) => void;
}) {
  const [pendingQty, setPendingQty] = useState(0);

  useEffect(() => {
    getUnsyncedQuantity(item.id).then(setPendingQty);
  }, [item.id]);

  const estimatedStock = item.currentStock - pendingQty;
  const isOut = estimatedStock <= 0;

  return (
    <Pressable
      style={[styles.row, isOut && styles.rowDisabled]}
      onPress={() => !isOut && onPress(item)}
      disabled={isOut}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{item.name}</Text>
        <Text style={styles.rowSubtitle}>
          {item.brand} · {item.size} · {item.productId}
        </Text>
      </View>
      <Text style={[styles.rowStock, isOut && styles.rowStockOut]}>
        {isOut ? "Out of stock" : `${estimatedStock.toFixed(2)} ${item.measurementUnit}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  search: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 15,
  },
  syncNote: { fontSize: 11, color: "#999", marginBottom: 10 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e5e5",
  },
  rowDisabled: { opacity: 0.4 },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  rowSubtitle: { fontSize: 12, color: "#888", marginTop: 2 },
  rowStock: { fontSize: 13, fontWeight: "700", color: "#059669" },
  rowStockOut: { color: "#dc2626" },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalSubtitle: { fontSize: 13, color: "#666", marginTop: 4, marginBottom: 16 },
  qtyInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    marginBottom: 16,
  },
  modalActions: { flexDirection: "row", gap: 12 },
  button: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonPrimary: { backgroundColor: "#2563eb" },
  buttonPrimaryText: { color: "#fff", fontWeight: "700" },
  buttonSecondary: { backgroundColor: "#f1f1f1" },
  buttonSecondaryText: { color: "#333", fontWeight: "600" },
});
