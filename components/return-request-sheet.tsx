import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/theme-context";
import { radius, spacing, type ThemeColors } from "@/constants/theme";
import {
  fetchOrderDetail,
  submitReturnRequest,
  type OrderDetail,
} from "@/lib/return-requests";
import { formatQty } from "./order-card";

/** How much of an item is still eligible for a *new* return request right
 * now: ordered minus already-returned minus already-pending-requested
 * (across every request, not just this seller's — mirrors the server's own
 * trg_check_return_request_quantity cap, computed here just for display). */
function remainingReturnable(item: OrderDetail["items"][number], detail: OrderDetail): number {
  const pendingRequested = detail.returnRequests
    .filter((rr) => rr.status === "pending")
    .flatMap((rr) => rr.items)
    .filter((ri) => ri.orderItemId === item.id)
    .reduce((sum, ri) => sum + ri.quantity, 0);
  return item.quantity - item.returnedQuantity - pendingRequested;
}

export function ReturnRequestSheet({
  orderServerId,
  visible,
  onClose,
  onSubmitted,
}: {
  orderServerId: string | null;
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !orderServerId) return;
    setLoading(true);
    setError(null);
    setQuantities({});
    setNotes("");
    fetchOrderDetail(orderServerId).then((d) => {
      setDetail(d);
      setLoading(false);
      if (!d) setError("Couldn't load this order. Check your connection and try again.");
    });
  }, [visible, orderServerId]);

  async function handleSubmit() {
    if (!orderServerId) return;
    const items = Object.entries(quantities)
      .map(([orderItemId, qty]) => ({ orderItemId, quantity: Number(qty) }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) return;

    setSubmitting(true);
    setError(null);
    const result = await submitReturnRequest(orderServerId, items, notes.trim() || null);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSubmitted();
    onClose();
  }

  const hasSelection = Object.values(quantities).some((v) => Number(v) > 0);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Request Return</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !detail ? (
          <View style={styles.centerFill}>
            <Ionicons name="cloud-offline-outline" size={32} color={colors.textFaint} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={styles.sectionLabel}>Select items to return</Text>

              {detail.items.map((item) => {
                const max = remainingReturnable(item, detail);
                if (max <= 0) return null;
                return (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{item.productName}</Text>
                      <Text style={styles.itemMeta}>
                        Up to {formatQty(max)} {item.measurementUnit} returnable
                      </Text>
                    </View>
                    <TextInput
                      style={styles.qtyInput}
                      placeholder="0"
                      placeholderTextColor={colors.textFaint}
                      keyboardType="decimal-pad"
                      value={quantities[item.id] ?? ""}
                      onChangeText={(v) => setQuantities((prev) => ({ ...prev, [item.id]: v }))}
                    />
                  </View>
                );
              })}

              {detail.items.every((item) => remainingReturnable(item, detail) <= 0) && (
                <Text style={styles.emptyText}>
                  Nothing left to return on this order — every item is already returned or has a
                  pending return request.
                </Text>
              )}

              <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>Notes (optional)</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="Reason for the return..."
                placeholderTextColor={colors.textFaint}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
              />

              {detail.returnRequests.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>
                    Previous requests
                  </Text>
                  {detail.returnRequests.map((rr) => (
                    <View key={rr.id} style={styles.historyRow}>
                      <Text style={styles.historyStatus}>
                        {rr.status === "pending"
                          ? "Awaiting approval"
                          : rr.status === "approved"
                            ? "Approved"
                            : `Rejected: ${rr.rejectionReason ?? ""}`}
                      </Text>
                      <Text style={styles.historyMeta}>
                        {new Date(rr.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                  ))}
                </>
              )}

              {error && <Text style={styles.errorInline}>{error}</Text>}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
              <Pressable
                style={[
                  styles.submitButton,
                  (!hasSelection || submitting) && styles.submitButtonDisabled,
                ]}
                disabled={!hasSelection || submitting}
                onPress={handleSubmit}
              >
                <Text style={styles.submitButtonText}>
                  {submitting ? "Submitting..." : "Submit Return Request"}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    title: { fontSize: 20, fontWeight: "800", color: colors.text },
    centerFill: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.xl },
    errorText: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
    errorInline: { fontSize: 12, color: colors.danger, marginTop: spacing.md },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
    sectionLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginBottom: spacing.sm,
    },
    itemRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    itemName: { fontSize: 14, fontWeight: "700", color: colors.text },
    itemMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    qtyInput: {
      width: 72,
      height: 38,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 10,
      textAlign: "right",
      color: colors.text,
      backgroundColor: colors.surfaceMuted,
    },
    emptyText: { fontSize: 13, color: colors.textMuted, paddingVertical: spacing.md },
    notesInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      minHeight: 72,
      textAlignVertical: "top",
      color: colors.text,
      backgroundColor: colors.surfaceMuted,
    },
    historyRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: spacing.xs,
    },
    historyStatus: { fontSize: 13, color: colors.text, flex: 1 },
    historyMeta: { fontSize: 12, color: colors.textFaint },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    submitButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: "center",
    },
    submitButtonDisabled: { opacity: 0.5 },
    submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  });
}
