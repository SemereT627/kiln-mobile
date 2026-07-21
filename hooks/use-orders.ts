import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getAllOrders, type PendingOrder } from "@/lib/db";
import { refreshOrderApprovalStatuses, runOrderSync, type ServerOrder } from "@/lib/sync";

/** Turns a cross-device server order into the same shape the UI already
 * knows how to render — there's no local original on this device to diff
 * finalQuantity/finalPriceAtSale against, so those are left unset. */
function serverOrderToPendingOrder(order: ServerOrder): PendingOrder {
  return {
    clientId: order.clientId as string,
    paymentMethod: order.paymentMethod,
    bankAccount: order.bankAccount,
    notes: order.notes,
    status: "synced",
    failReason: null,
    approvalStatus: order.status,
    rejectionReason: order.rejectionReason,
    createdAt: order.createdAt,
    items: order.items.map((i) => ({
      ceramicId: i.ceramicId,
      ceramicName: i.productName,
      quantity: i.quantity,
      priceAtSale: i.priceAtSale,
    })),
  };
}

/**
 * The seller's full order list: local SQLite rows (this device's queue,
 * including not-yet-synced ones) merged with the server's view of every
 * order they've ever submitted, from any device — cross-device orders never
 * get a local row here, so they're merged in by clientId. The server slice
 * is kept in memory only (see refreshOrderApprovalStatuses) — a failed
 * fetch just leaves the last known list in place instead of clearing it.
 */
export function useOrders() {
  const [localOrders, setLocalOrders] = useState<PendingOrder[]>([]);
  const [serverOrders, setServerOrders] = useState<ServerOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Null until the server has ever answered successfully — lets the UI tell
  // "confirmed empty" apart from "never synced, showing whatever's local."
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const loadLocal = useCallback(async () => {
    setLocalOrders(await getAllOrders());
    setLoaded(true);
  }, []);

  const refresh = useCallback(async () => {
    const fetched = await refreshOrderApprovalStatuses();
    if (fetched) {
      setServerOrders(fetched);
      setLastSyncedAt(new Date());
    }
    await loadLocal();
  }, [loadLocal]);

  useFocusEffect(
    useCallback(() => {
      loadLocal();
      refresh();
    }, [loadLocal, refresh]),
  );

  async function syncAndRefresh() {
    setRefreshing(true);
    await runOrderSync();
    await refresh();
    setRefreshing(false);
  }

  const orders = [
    ...localOrders,
    ...serverOrders
      .filter((o) => o.clientId && !localOrders.some((l) => l.clientId === o.clientId))
      .map(serverOrderToPendingOrder),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    orders,
    loaded,
    refreshing,
    refresh: syncAndRefresh,
    reload: loadLocal,
    lastSyncedAt,
  };
}
