import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Image,
  Animated,
} from "react-native";
import * as Crypto from "expo-crypto";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE_URL } from "@/lib/supabase";
import {
  cacheCatalog,
  getCachedCatalog,
  getUnsyncedQuantities,
  getUnsyncedOrderQuantities,
  enqueueOrder,
  type CachedCeramic,
  type PaymentMethod,
} from "@/lib/db";
import { runOrderSync } from "@/lib/sync";
import { colors, radius, spacing, shadow } from "@/constants/theme";

type CartLine = {
  ceramicId: string;
  ceramicName: string;
  quantity: number;
  priceAtSale: number | null;
  measurementUnit: string;
};

type LoadState = "loading" | "ready" | "error";

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "cash", label: "Cash", icon: "cash-outline" },
  { value: "bank_transfer", label: "Bank Transfer", icon: "swap-horizontal-outline" },
  { value: "credit", label: "Pending / Credit", icon: "time-outline" },
];

export default function SellScreen() {
  const insets = useSafeAreaInsets();
  const [catalog, setCatalog] = useState<CachedCeramic[]>([]);
  const [pendingQty, setPendingQty] = useState<Record<string, number>>({});
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<CachedCeramic | null>(null);
  const [quantity, setQuantity] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [bankAccount, setBankAccount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadPendingQuantities = useCallback(async () => {
    const [sales, orders] = await Promise.all([
      getUnsyncedQuantities(),
      getUnsyncedOrderQuantities(),
    ]);
    const merged: Record<string, number> = { ...sales };
    for (const [id, qty] of Object.entries(orders)) {
      merged[id] = (merged[id] ?? 0) + qty;
    }
    setPendingQty(merged);
  }, []);

  const loadCatalog = useCallback(async (isInitial: boolean) => {
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
        imageUrl: i.imageUrl ?? null,
      }));
      await cacheCatalog(items);
      setCatalog(items);
      setLastSyncedAt(Date.now());
      setLoadState("ready");
    } catch {
      const cached = await getCachedCatalog();
      if (cached.length > 0) {
        setCatalog(cached);
        setLoadState("ready");
      } else if (isInitial) {
        setLoadState("error");
      }
    }
  }, []);

  useEffect(() => {
    loadCatalog(true);
    loadPendingQuantities();
  }, [loadCatalog, loadPendingQuantities]);

  useFocusEffect(
    useCallback(() => {
      loadPendingQuantities();
    }, [loadPendingQuantities]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([runOrderSync(), loadCatalog(catalog.length === 0)]);
    await loadPendingQuantities();
    setRefreshing(false);
  }

  function openSaleModal(item: CachedCeramic) {
    setSelected(item);
    setQuantity("");
  }

  function addToCart() {
    if (!selected) return;
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) return;

    setCart((prev) => {
      const existing = prev.find((l) => l.ceramicId === selected.id);
      if (existing) {
        return prev.map((l) =>
          l.ceramicId === selected.id ? { ...l, quantity: l.quantity + qty } : l,
        );
      }
      return [
        ...prev,
        {
          ceramicId: selected.id,
          ceramicName: selected.name,
          quantity: qty,
          priceAtSale: selected.pricePerUnit,
          measurementUnit: selected.measurementUnit,
        },
      ];
    });
    setSelected(null);
    setQuantity("");
  }

  function removeFromCart(ceramicId: string) {
    setCart((prev) => prev.filter((l) => l.ceramicId !== ceramicId));
  }

  function updateCartQuantity(ceramicId: string, qty: number) {
    setCart((prev) =>
      prev.map((l) => (l.ceramicId === ceramicId ? { ...l, quantity: qty } : l)),
    );
  }

  const cartTotal = useMemo(
    () => cart.reduce((sum, l) => sum + l.quantity * (l.priceAtSale ?? 0), 0),
    [cart],
  );

  async function submitOrder() {
    if (cart.length === 0) return;
    if (paymentMethod === "bank_transfer" && !bankAccount.trim()) return;

    setSubmitting(true);
    const clientId = Crypto.randomUUID();
    await enqueueOrder({
      clientId,
      paymentMethod,
      bankAccount: paymentMethod === "bank_transfer" ? bankAccount.trim() : null,
      notes: notes.trim() || null,
      items: cart.map((l) => ({
        ceramicId: l.ceramicId,
        ceramicName: l.ceramicName,
        quantity: l.quantity,
        priceAtSale: l.priceAtSale,
      })),
    });
    setSubmitting(false);
    setCart([]);
    setReviewOpen(false);
    setPaymentMethod("cash");
    setBankAccount("");
    setNotes("");
    await loadPendingQuantities();
    // Best-effort immediate sync; if offline this just stays queued.
    runOrderSync().then(loadPendingQuantities);
  }

  const filtered = useMemo(
    () =>
      catalog.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.productId.toLowerCase().includes(search.toLowerCase()),
      ),
    [catalog, search],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.headerTitle}>Sell</Text>
        <SyncPill lastSyncedAt={lastSyncedAt} loadState={loadState} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textFaint} style={styles.searchIcon} />
        <TextInput
          style={styles.search}
          placeholder="Search by name or product ID"
          placeholderTextColor={colors.textFaint}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textFaint} />
          </Pressable>
        )}
      </View>

      {loadState === "loading" ? (
        <CatalogSkeleton />
      ) : loadState === "error" ? (
        <ErrorState onRetry={() => loadCatalog(true)} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          contentContainerStyle={{
            paddingBottom: cart.length > 0 ? 110 : 24,
            paddingHorizontal: spacing.lg,
          }}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => (
            <CatalogRow
              item={item}
              pendingQty={pendingQty[item.id] ?? 0}
              onPress={openSaleModal}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="cube-outline" size={40} color={colors.textFaint} />
              <Text style={styles.emptyTitle}>No products found</Text>
              <Text style={styles.emptySubtitle}>
                {search
                  ? "Try a different name or product ID."
                  : "The catalog is empty right now."}
              </Text>
            </View>
          }
        />
      )}

      <CartBar
        count={cart.length}
        total={cartTotal}
        onPress={() => setReviewOpen(true)}
      />

      {/* Quantity picker for a tapped catalog item */}
      <Modal visible={!!selected} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={styles.modalScrim} onPress={() => setSelected(null)} />
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{selected?.name}</Text>
            <Text style={styles.modalSubtitle}>
              {selected?.brand} · {selected?.size} · Stock:{" "}
              {selected?.currentStock.toFixed(2)} {selected?.measurementUnit}
            </Text>
            <TextInput
              style={styles.qtyInput}
              placeholder={`Quantity (${selected?.measurementUnit ?? ""})`}
              placeholderTextColor={colors.textFaint}
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
                style={[styles.button, styles.buttonPrimary, !quantity && styles.buttonDisabled]}
                onPress={addToCart}
                disabled={!quantity}
              >
                <Text style={styles.buttonPrimaryText}>Add to Cart</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Review order / payment method / submit */}
      <Modal visible={reviewOpen} animationType="slide">
        <KeyboardAvoidingView
          style={[styles.reviewContainer, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.reviewHeader}>
            <Text style={styles.reviewTitle}>Review Order</Text>
            <Pressable onPress={() => setReviewOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <FlatList
            data={cart}
            keyExtractor={(l) => l.ceramicId}
            style={{ flexGrow: 0, maxHeight: 220 }}
            renderItem={({ item }) => (
              <View style={styles.cartRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartRowTitle}>{item.ceramicName}</Text>
                  <Text style={styles.cartRowSubtitle}>
                    {item.quantity} {item.measurementUnit} ·{" "}
                    {(item.quantity * (item.priceAtSale ?? 0)).toFixed(2)} ETB
                  </Text>
                </View>
                <Pressable
                  style={styles.qtyStepper}
                  onPress={() => updateCartQuantity(item.ceramicId, Math.max(0.01, item.quantity - 1))}
                >
                  <Ionicons name="remove" size={16} color={colors.text} />
                </Pressable>
                <Pressable
                  style={styles.qtyStepper}
                  onPress={() => updateCartQuantity(item.ceramicId, item.quantity + 1)}
                >
                  <Ionicons name="add" size={16} color={colors.text} />
                </Pressable>
                <Pressable onPress={() => removeFromCart(item.ceramicId)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            )}
          />

          <Text style={styles.sectionLabel}>Payment Method</Text>
          <View style={styles.paymentRow}>
            {PAYMENT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.paymentOption,
                  paymentMethod === opt.value && styles.paymentOptionActive,
                ]}
                onPress={() => setPaymentMethod(opt.value)}
              >
                <Ionicons
                  name={opt.icon}
                  size={16}
                  color={paymentMethod === opt.value ? "#fff" : colors.textMuted}
                />
                <Text
                  style={[
                    styles.paymentOptionText,
                    paymentMethod === opt.value && styles.paymentOptionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {paymentMethod === "bank_transfer" && (
            <TextInput
              style={styles.qtyInput}
              placeholder="Bank account sent to"
              placeholderTextColor={colors.textFaint}
              value={bankAccount}
              onChangeText={setBankAccount}
            />
          )}

          {paymentMethod === "credit" && (
            <View style={styles.creditNote}>
              <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
              <Text style={styles.creditNoteText}>
                This order will be flagged for the admin as payment not yet received.
              </Text>
            </View>
          )}

          <TextInput
            style={[styles.qtyInput, { height: 70, textAlignVertical: "top" }]}
            placeholder="Notes (optional)"
            placeholderTextColor={colors.textFaint}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <Text style={styles.reviewTotal}>Total: {cartTotal.toFixed(2)} ETB</Text>

          <View style={styles.modalActions}>
            <Pressable
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => setReviewOpen(false)}
            >
              <Text style={styles.buttonSecondaryText}>Back</Text>
            </Pressable>
            <Pressable
              style={[
                styles.button,
                styles.buttonPrimary,
                (submitting ||
                  cart.length === 0 ||
                  (paymentMethod === "bank_transfer" && !bankAccount.trim())) &&
                  styles.buttonDisabled,
              ]}
              onPress={submitOrder}
              disabled={
                submitting ||
                cart.length === 0 ||
                (paymentMethod === "bank_transfer" && !bankAccount.trim())
              }
            >
              <Text style={styles.buttonPrimaryText}>
                {submitting ? "Submitting..." : "Submit Order"}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function SyncPill({
  lastSyncedAt,
  loadState,
}: {
  lastSyncedAt: number | null;
  loadState: LoadState;
}) {
  if (loadState === "error") {
    return (
      <View style={[styles.syncPill, styles.syncPillError]}>
        <Ionicons name="cloud-offline-outline" size={12} color={colors.danger} />
        <Text style={[styles.syncPillText, { color: colors.danger }]}>Offline</Text>
      </View>
    );
  }
  return (
    <View style={styles.syncPill}>
      <Ionicons
        name={lastSyncedAt ? "cloud-done-outline" : "cloud-outline"}
        size={12}
        color={lastSyncedAt ? colors.success : colors.textFaint}
      />
      <Text style={styles.syncPillText}>
        {lastSyncedAt
          ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "Cached"}
      </Text>
    </View>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.textFaint} />
      <Text style={styles.emptyTitle}>Can't reach the server</Text>
      <Text style={styles.emptySubtitle}>
        Check your connection, then try again.
      </Text>
      <Pressable style={styles.retryButton} onPress={onRetry}>
        <Ionicons name="refresh" size={16} color="#fff" />
        <Text style={styles.retryButtonText}>Retry</Text>
      </Pressable>
    </View>
  );
}

function CatalogSkeleton() {
  return (
    <View style={{ paddingHorizontal: spacing.lg }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <View style={styles.skeletonThumb} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={[styles.skeletonLine, { width: "60%" }]} />
            <View style={[styles.skeletonLine, { width: "40%" }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function CartBar({
  count,
  total,
  onPress,
}: {
  count: number;
  total: number;
  onPress: () => void;
}) {
  const translateY = useRef(new Animated.Value(80)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: count > 0 ? 0 : 80,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.6,
    }).start();
  }, [count > 0, translateY]);

  if (count === 0) return null;

  return (
    <Animated.View style={[styles.cartBarWrap, { transform: [{ translateY }] }]}>
      <Pressable style={styles.cartBar} onPress={onPress}>
        <View style={styles.cartBarBadge}>
          <Text style={styles.cartBarBadgeText}>{count}</Text>
        </View>
        <Text style={styles.cartBarText}>{total.toFixed(2)} ETB</Text>
        <View style={styles.cartBarAction}>
          <Text style={styles.cartBarActionText}>Review</Text>
          <Ionicons name="arrow-forward" size={15} color="#fff" />
        </View>
      </Pressable>
    </Animated.View>
  );
}

function CatalogRow({
  item,
  pendingQty,
  onPress,
}: {
  item: CachedCeramic;
  pendingQty: number;
  onPress: (item: CachedCeramic) => void;
}) {
  const estimatedStock = item.currentStock - pendingQty;
  const isOut = estimatedStock <= 0;
  const isLow = !isOut && estimatedStock < 5;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        isOut && styles.rowDisabled,
        pressed && !isOut && styles.rowPressed,
      ]}
      onPress={() => !isOut && onPress(item)}
      disabled={isOut}
    >
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.rowImage} />
      ) : (
        <View style={[styles.rowImage, styles.rowImagePlaceholder]}>
          <Ionicons name="image-outline" size={18} color={colors.textFaint} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {item.brand} · {item.size} · {item.productId}
        </Text>
      </View>
      <View
        style={[
          styles.stockPill,
          isOut && styles.stockPillOut,
          isLow && styles.stockPillLow,
        ]}
      >
        <Text
          style={[
            styles.stockPillText,
            isOut && styles.stockPillTextOut,
            isLow && styles.stockPillTextLow,
          ]}
        >
          {isOut ? "Out of stock" : `${estimatedStock.toFixed(2)} ${item.measurementUnit}`}
        </Text>
      </View>
    </Pressable>
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
    paddingBottom: spacing.sm,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: colors.text },
  syncPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  syncPillError: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  syncPillText: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    height: 44,
  },
  searchIcon: {},
  search: { flex: 1, fontSize: 15, color: colors.text, height: "100%" },
  emptyWrap: { alignItems: "center", marginTop: 72, paddingHorizontal: 32, gap: 4 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: 16,
  },
  retryButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  skeletonThumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.border },
  skeletonLine: { height: 10, borderRadius: 5, backgroundColor: colors.border },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    marginBottom: 8,
    gap: 12,
    ...shadow.card,
  },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowDisabled: { opacity: 0.5 },
  rowImage: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  rowImagePlaceholder: { alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  rowSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  stockPill: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  stockPillLow: { backgroundColor: colors.warningSoft },
  stockPillOut: { backgroundColor: colors.dangerSoft },
  stockPillText: { fontSize: 12, fontWeight: "700", color: colors.success },
  stockPillTextLow: { color: colors.warning },
  stockPillTextOut: { color: colors.danger },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  modalScrim: StyleSheet.absoluteFill,
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingTop: spacing.sm,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  modalSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 16 },
  qtyInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    marginBottom: 16,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
  },
  modalActions: { flexDirection: "row", gap: 12 },
  button: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  buttonSecondary: { backgroundColor: colors.surfaceMuted },
  buttonSecondaryText: { color: colors.text, fontWeight: "600", fontSize: 15 },
  buttonDisabled: { opacity: 0.5 },
  cartBarWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
  },
  cartBar: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...shadow.floating,
  },
  cartBarBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: radius.pill,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBarBadgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  cartBarText: { color: "#fff", fontWeight: "700", fontSize: 15, flex: 1 },
  cartBarAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  cartBarActionText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  reviewContainer: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  reviewTitle: { fontSize: 20, fontWeight: "800", color: colors.text },
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 10,
  },
  cartRowTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  cartRowSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  qtyStepper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: { fontSize: 13, fontWeight: "700", marginTop: 16, marginBottom: 8, color: colors.text },
  paymentRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  paymentOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 10,
  },
  paymentOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  paymentOptionText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  paymentOptionTextActive: { color: "#fff" },
  creditNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 12,
  },
  creditNoteText: { flex: 1, fontSize: 12, color: colors.warning },
  reviewTotal: { fontSize: 17, fontWeight: "800", color: colors.text, textAlign: "right", marginVertical: 12 },
});
