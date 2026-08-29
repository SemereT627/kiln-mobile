import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  ScrollView,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/theme-context";
import { radius, spacing, type ThemeColors, getShadow } from "@/constants/theme";
import type { PendingOrder } from "@/lib/db";
import {
  formatQty,
  orderRef,
  getSyncStatusMap,
  getApprovalMap,
  PAYMENT,
  REASON_LABEL,
} from "./order-card";
import { ReturnRequestSheet } from "./return-request-sheet";

const SCREEN_HEIGHT = Dimensions.get("window").height;

export function OrderDetailSheet({
  order,
  onClose,
  onDiscard,
}: {
  order: PendingOrder | null;
  onClose: () => void;
  onDiscard: (clientId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);
  const SYNC_STATUS = useMemo(() => getSyncStatusMap(colors), [colors]);
  const APPROVAL = useMemo(() => getApprovalMap(colors), [colors]);
  const [mounted, setMounted] = useState(false);
  const [returnSheetOpen, setReturnSheetOpen] = useState(false);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const lastOrder = useRef<PendingOrder | null>(null);

  useEffect(() => {
    if (order) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  if (!mounted) return null;

  // order may have just been cleared while the close animation plays —
  // keep rendering the last known order so content doesn't pop away early.
  const shown = order ?? lastOrder.current;
  if (order) lastOrder.current = order;
  if (!shown) return null;

  const quantity = shown.items.reduce((sum, i) => sum + (i.finalQuantity ?? i.quantity), 0);
  const total = shown.items.reduce(
    (sum, i) => sum + (i.finalQuantity ?? i.quantity) * (i.finalPriceAtSale ?? i.priceAtSale ?? 0),
    0,
  );
  const sync = SYNC_STATUS[shown.status];
  const payment = PAYMENT[shown.paymentMethod];

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + spacing.lg, transform: [{ translateY }] },
        ]}
      >
        <View style={styles.grabber} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.ref}>Order #{orderRef(shown.clientId)}</Text>
            <View style={styles.syncBadge}>
              <Ionicons name={sync.icon} size={13} color={sync.color} />
              <Text style={[styles.syncText, { color: sync.color }]}>{sync.label}</Text>
            </View>
          </View>

          <Text style={styles.total} allowFontScaling={false}>
            {total.toFixed(2)}
            <Text style={styles.totalCurrency}> ETB</Text>
          </Text>
          <Text style={styles.totalsSub}>
            {shown.items.length} item{shown.items.length !== 1 ? "s" : ""} · {formatQty(quantity)} m²
            total
          </Text>
          {shown.approvalStatus !== "approved" && (
            <Text style={styles.estimateNote}>
              Estimated — final total set when approved
            </Text>
          )}

          {shown.status === "synced" && shown.approvalStatus && (
            <View
              style={[styles.approvalPill, { backgroundColor: APPROVAL[shown.approvalStatus].bg }]}
            >
              <Text style={[styles.approvalText, { color: APPROVAL[shown.approvalStatus].color }]}>
                {APPROVAL[shown.approvalStatus].label}
                {shown.approvalStatus === "rejected" && shown.rejectionReason
                  ? `: ${shown.rejectionReason}`
                  : ""}
              </Text>
            </View>
          )}

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name={payment.icon} size={15} color={colors.textMuted} />
              <Text style={styles.infoLabel}>Payment</Text>
              <Text style={styles.infoValue}>
                {payment.label}
                {shown.bankAccount ? ` · ${shown.bankAccount}` : ""}
              </Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
              <Text style={styles.infoLabel}>Submitted</Text>
              <Text style={styles.infoValue}>
                {new Date(shown.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </Text>
            </View>
            {shown.notes && (
              <>
                <View style={styles.infoDivider} />
                <View style={styles.infoRow}>
                  <Ionicons name="document-text-outline" size={15} color={colors.textMuted} />
                  <Text style={styles.infoLabel}>Notes</Text>
                  <Text style={styles.infoValue}>{shown.notes}</Text>
                </View>
              </>
            )}
          </View>

          <Text style={styles.sectionLabel}>Items ({shown.items.length})</Text>
          <View style={styles.itemsCard}>
            {shown.items.map((line, i) => {
              const adjusted =
                (line.finalQuantity != null && line.finalQuantity !== line.quantity) ||
                (line.finalPriceAtSale != null && line.finalPriceAtSale !== line.priceAtSale);
              const finalQty = line.finalQuantity ?? line.quantity;
              const finalPrice = line.finalPriceAtSale ?? line.priceAtSale ?? 0;
              return (
                <View key={line.ceramicId}>
                  {i > 0 && <View style={styles.infoDivider} />}
                  <View style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{line.ceramicName}</Text>
                      <Text style={styles.itemPrice}>{finalPrice.toFixed(2)} ETB / m²</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      {adjusted ? (
                        <Text style={styles.itemQty}>
                          <Text style={styles.itemQtyOriginal}>{formatQty(line.quantity)}</Text>{" "}
                          <Text style={styles.itemQtyFinal}>{formatQty(finalQty)}</Text>
                        </Text>
                      ) : (
                        <Text style={styles.itemQty}>{formatQty(line.quantity)} m²</Text>
                      )}
                      <Text style={styles.itemLineTotal}>{(finalQty * finalPrice).toFixed(2)} ETB</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {shown.status === "synced" && shown.approvalStatus === "approved" && shown.serverId && (
            <Pressable
              style={styles.returnButton}
              onPress={() => setReturnSheetOpen(true)}
            >
              <Ionicons name="return-up-back-outline" size={15} color={colors.primary} />
              <Text style={styles.returnButtonText}>Request Return</Text>
            </Pressable>
          )}

          {shown.status === "rejected" && (
            <>
              <Text style={styles.reason}>
                {REASON_LABEL[shown.failReason ?? ""] ?? "This order could not be synced."}
              </Text>
              <Pressable
                style={styles.discardButton}
                onPress={() => {
                  onDiscard(shown.clientId);
                  onClose();
                }}
              >
                <Ionicons name="trash-outline" size={14} color={colors.danger} />
                <Text style={styles.discardButtonText}>Discard order</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </Animated.View>

      <ReturnRequestSheet
        orderServerId={shown.serverId}
        visible={returnSheetOpen}
        onClose={() => setReturnSheetOpen(false)}
        onSubmitted={() => {}}
      />
    </Modal>
  );
}

function makeStyles(colors: ThemeColors, shadow: ReturnType<typeof getShadow>) {
  return StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15,23,42,0.5)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: SCREEN_HEIGHT * 0.85,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.floating,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
  },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ref: { fontSize: 13, fontWeight: "700", color: colors.textFaint, letterSpacing: 0.3 },
  syncBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  syncText: { fontSize: 12, fontWeight: "700" },
  total: { fontSize: 30, fontWeight: "800", color: colors.text, marginTop: spacing.sm },
  totalCurrency: { fontSize: 15, fontWeight: "700", color: colors.textMuted },
  totalsSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  estimateNote: { fontSize: 12, color: colors.textFaint, marginTop: 3, fontStyle: "italic" },
  approvalPill: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: spacing.sm,
  },
  approvalText: { fontSize: 12, fontWeight: "700" },

  infoCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  infoLabel: { fontSize: 13, color: colors.textMuted, width: 82 },
  infoValue: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.text },
  infoDivider: { height: 1, backgroundColor: colors.border },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  itemsCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  itemRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.md },
  itemName: { fontSize: 14, fontWeight: "700", color: colors.text },
  itemPrice: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  itemQty: { fontSize: 14, fontWeight: "700", color: colors.text },
  itemQtyOriginal: { textDecorationLine: "line-through", color: colors.textFaint, fontWeight: "400" },
  itemQtyFinal: { color: colors.warning },
  itemLineTotal: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  returnButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  returnButtonText: { color: colors.primary, fontWeight: "700", fontSize: 14 },

  reason: { fontSize: 13, color: colors.danger, marginTop: spacing.lg },
  discardButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.md,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  discardButtonText: { color: colors.danger, fontWeight: "700", fontSize: 14 },
  });
}
