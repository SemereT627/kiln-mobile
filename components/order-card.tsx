import { useRef, useEffect, useMemo } from "react";
import { View, Text, Pressable, Animated, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme-context";
import { radius, type ThemeColors, getShadow } from "@/constants/theme";
import type { PendingOrder } from "@/lib/db";

export function getSyncStatusMap(
  colors: ThemeColors,
): Record<PendingOrder["status"], { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> {
  return {
    pending: { label: "Queued", icon: "time-outline", color: colors.warning },
    syncing: { label: "Syncing…", icon: "sync-outline", color: colors.primary },
    synced: { label: "Synced", icon: "checkmark-circle", color: colors.success },
    rejected: { label: "Sync Failed", icon: "alert-circle", color: colors.danger },
  };
}

export function getApprovalMap(
  colors: ThemeColors,
): Record<NonNullable<PendingOrder["approvalStatus"]>, { label: string; color: string; bg: string }> {
  return {
    pending: { label: "Awaiting approval", color: colors.warning, bg: colors.warningSoft },
    approved: { label: "Approved", color: colors.success, bg: colors.successSoft },
    rejected: { label: "Rejected", color: colors.danger, bg: colors.dangerSoft },
  };
}

export const PAYMENT: Record<
  PendingOrder["paymentMethod"],
  { label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  cash: { label: "Cash", icon: "cash-outline" },
  bank_transfer: { label: "Bank Transfer", icon: "business-outline" },
  credit: { label: "Credit", icon: "time-outline" },
};

export const REASON_LABEL: Record<string, string> = {
  insufficient_stock: "Not enough stock left — adjust quantity or discard.",
  invalid_payload: "Invalid order data.",
  unknown_error: "Sync failed — will retry automatically.",
};

/** Short, stable reference from the sync id — this domain has no
 * human-assigned order number, so the first 6 chars stand in for one. */
export function orderRef(clientId: string) {
  return clientId.replace(/-/g, "").slice(0, 6).toUpperCase();
}

/** Quantities come from arbitrary m² math and can carry float noise
 * (e.g. 35.459999999999994) — always display at most 2 decimal places. */
export function formatQty(value: number) {
  return (Math.round(value * 100) / 100).toString();
}

function accentColor(order: PendingOrder, colors: ThemeColors): string {
  if (order.status === "rejected") return colors.danger;
  if (order.status !== "synced") return colors.warning;
  if (order.approvalStatus === "rejected") return colors.danger;
  if (order.approvalStatus === "pending") return colors.warning;
  return colors.success;
}

export function OrderCard({
  order,
  index,
  onPress,
  onDiscard,
}: {
  order: PendingOrder;
  index: number;
  onPress: (order: PendingOrder) => void;
  onDiscard: (clientId: string) => void;
}) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);
  const SYNC_STATUS = useMemo(() => getSyncStatusMap(colors), [colors]);
  const APPROVAL = useMemo(() => getApprovalMap(colors), [colors]);

  const enter = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 260,
      delay: Math.min(index, 8) * 35,
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  const quantity = order.items.reduce((sum, i) => sum + (i.finalQuantity ?? i.quantity), 0);
  const total = order.items.reduce(
    (sum, i) => sum + (i.finalQuantity ?? i.quantity) * (i.finalPriceAtSale ?? i.priceAtSale ?? 0),
    0,
  );
  const sync = SYNC_STATUS[order.status];
  const payment = PAYMENT[order.paymentMethod];

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          { scale: pressScale },
        ],
      }}
    >
      <Pressable
        onPress={() => onPress(order)}
        onPressIn={() =>
          Animated.spring(pressScale, { toValue: 0.98, useNativeDriver: true, speed: 40 }).start()
        }
        onPressOut={() =>
          Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, speed: 30 }).start()
        }
        style={[styles.card, { borderLeftColor: accentColor(order, colors) }]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.ref}>#{orderRef(order.clientId)}</Text>
          <View style={styles.syncBadge}>
            <Ionicons name={sync.icon} size={12} color={sync.color} />
            <Text style={[styles.syncText, { color: sync.color }]}>{sync.label}</Text>
          </View>
        </View>

        <View style={styles.totalsRow}>
          <Text style={styles.total} allowFontScaling={false}>
            {total.toFixed(2)}
            <Text style={styles.totalCurrency}> ETB</Text>
          </Text>
          <Text style={styles.totalsSub}>
            {order.items.length} item{order.items.length !== 1 ? "s" : ""} · {formatQty(quantity)} m²
            total
          </Text>
          {order.approvalStatus !== "approved" && (
            <Text style={styles.estimateNote}>
              Estimated — final total set when approved
            </Text>
          )}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.paymentChip}>
            <Ionicons name={payment.icon} size={12} color={colors.textMuted} />
            <Text style={styles.paymentChipText}>
              {payment.label}
              {order.bankAccount ? ` · ${order.bankAccount}` : ""}
            </Text>
          </View>
          <Text style={styles.time}>
            {new Date(order.createdAt).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}
          </Text>
        </View>

        <View style={styles.itemsPreview}>
          {order.items.slice(0, 2).map((line) => {
            const adjusted =
              (line.finalQuantity != null && line.finalQuantity !== line.quantity) ||
              (line.finalPriceAtSale != null && line.finalPriceAtSale !== line.priceAtSale);
            return (
              <View key={line.ceramicId} style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {line.ceramicName}
                </Text>
                {adjusted ? (
                  <Text style={styles.itemQty}>
                    <Text style={styles.itemQtyOriginal}>{formatQty(line.quantity)}</Text>{" "}
                    <Text style={styles.itemQtyFinal}>
                      {formatQty(line.finalQuantity ?? line.quantity)}
                    </Text>
                  </Text>
                ) : (
                  <Text style={styles.itemQty}>{formatQty(line.quantity)}</Text>
                )}
              </View>
            );
          })}
          {order.items.length > 2 && (
            <Text style={styles.moreItems}>+{order.items.length - 2} more · tap to view all</Text>
          )}
        </View>

        {order.status === "synced" && order.approvalStatus && (
          <View style={[styles.approvalPill, { backgroundColor: APPROVAL[order.approvalStatus].bg }]}>
            <Text style={[styles.approvalText, { color: APPROVAL[order.approvalStatus].color }]}>
              {APPROVAL[order.approvalStatus].label}
              {order.approvalStatus === "rejected" && order.rejectionReason
                ? `: ${order.rejectionReason}`
                : ""}
            </Text>
          </View>
        )}

        {order.status === "rejected" && (
          <>
            <Text style={styles.reason}>
              {REASON_LABEL[order.failReason ?? ""] ?? "This order could not be synced."}
            </Text>
            <Pressable style={styles.discardButton} onPress={() => onDiscard(order.clientId)}>
              <Ionicons name="trash-outline" size={13} color={colors.danger} />
              <Text style={styles.discardButtonText}>Discard</Text>
            </Pressable>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

function makeStyles(colors: ThemeColors, shadow: ReturnType<typeof getShadow>) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderLeftWidth: 3,
      padding: 14,
      marginBottom: 10,
      ...shadow.card,
    },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    ref: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textFaint,
      letterSpacing: 0.4,
    },
    syncBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
    syncText: { fontSize: 11, fontWeight: "700" },

    totalsRow: { marginTop: 6 },
    total: { fontSize: 22, fontWeight: "800", color: colors.text },
    totalCurrency: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
    totalsSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    estimateNote: { fontSize: 11, color: colors.textFaint, marginTop: 3, fontStyle: "italic" },

    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 10,
    },
    paymentChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    paymentChipText: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
    time: { fontSize: 11, color: colors.textFaint },

    itemsPreview: {
      marginTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 8,
      gap: 4,
    },
    itemRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    itemName: { flex: 1, fontSize: 12, color: colors.textMuted },
    itemQty: { fontSize: 12, fontWeight: "600", color: colors.text },
    itemQtyOriginal: { textDecorationLine: "line-through", color: colors.textFaint, fontWeight: "400" },
    itemQtyFinal: { color: colors.warning },
    moreItems: { fontSize: 11, color: colors.primary, fontWeight: "600" },

    approvalPill: {
      alignSelf: "flex-start",
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginTop: 10,
    },
    approvalText: { fontSize: 12, fontWeight: "700" },
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
}
