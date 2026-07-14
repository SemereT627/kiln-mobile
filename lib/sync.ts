import { supabase, API_BASE_URL } from "@/lib/supabase";
import {
  getPendingSales,
  markSyncing,
  markSynced,
  markRejected,
  resetSyncingToPending,
  getPendingOrders,
  markOrdersSyncing,
  markOrderSynced,
  markOrderRejectedSync,
  resetOrdersSyncingToPending,
  updateOrderApprovalStatuses,
} from "@/lib/db";

type SyncResult =
  | { clientId: string; status: "synced" }
  | { clientId: string; status: "rejected"; reason: string };

let syncing = false;

/**
 * Pushes all locally-queued sales to POST /api/sales/sync. Safe to call
 * repeatedly (NetInfo reconnect, app foreground, pull-to-refresh) — a sync
 * already in flight is skipped rather than run twice.
 */
export async function runSync(): Promise<{ synced: number; rejected: number }> {
  if (syncing) return { synced: 0, rejected: 0 };
  syncing = true;

  try {
    // A previous sync attempt may have crashed mid-flight; those rows are
    // safe to retry (the server dedupes by client_id).
    await resetSyncingToPending();

    const pending = await getPendingSales();
    if (pending.length === 0) return { synced: 0, rejected: 0 };

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return { synced: 0, rejected: 0 };

    await markSyncing(pending.map((s) => s.clientId));

    const res = await fetch(`${API_BASE_URL}/api/sales/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        sales: pending.map((s) => ({
          clientId: s.clientId,
          ceramicId: s.ceramicId,
          quantity: s.quantity,
          priceAtSale: s.priceAtSale,
          soldAt: s.soldAt,
        })),
      }),
    });

    if (!res.ok) {
      // Network reachable but the request itself failed (e.g. 401 from an
      // expired refresh) — leave rows as 'pending' for the next attempt.
      await resetSyncingToPending();
      return { synced: 0, rejected: 0 };
    }

    const { results }: { results: SyncResult[] } = await res.json();

    let synced = 0;
    let rejected = 0;
    for (const result of results) {
      if (result.status === "synced") {
        await markSynced(result.clientId);
        synced++;
      } else {
        await markRejected(result.clientId, result.reason);
        rejected++;
      }
    }
    return { synced, rejected };
  } catch {
    // Offline mid-request or some other transient failure — rows already
    // marked 'syncing' get reset on the next runSync() call.
    await resetSyncingToPending();
    return { synced: 0, rejected: 0 };
  } finally {
    syncing = false;
  }
}

let orderSyncing = false;

/**
 * Pushes all locally-queued orders to POST /api/orders/sync. Same
 * best-effort, safe-to-repeat shape as runSync() above — a sync already in
 * flight is skipped, and the server dedupes by client_id.
 */
export async function runOrderSync(): Promise<{ synced: number; rejected: number }> {
  if (orderSyncing) return { synced: 0, rejected: 0 };
  orderSyncing = true;

  try {
    await resetOrdersSyncingToPending();

    const pending = await getPendingOrders();
    if (pending.length === 0) return { synced: 0, rejected: 0 };

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return { synced: 0, rejected: 0 };

    await markOrdersSyncing(pending.map((o) => o.clientId));

    const res = await fetch(`${API_BASE_URL}/api/orders/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        orders: pending.map((o) => ({
          clientId: o.clientId,
          paymentMethod: o.paymentMethod,
          bankAccount: o.bankAccount,
          notes: o.notes,
          items: o.items.map((i) => ({ ceramicId: i.ceramicId, quantity: i.quantity })),
        })),
      }),
    });

    if (!res.ok) {
      await resetOrdersSyncingToPending();
      return { synced: 0, rejected: 0 };
    }

    const { results }: { results: SyncResult[] } = await res.json();

    let synced = 0;
    let rejected = 0;
    for (const result of results) {
      if (result.status === "synced") {
        await markOrderSynced(result.clientId);
        synced++;
      } else {
        await markOrderRejectedSync(result.clientId, result.reason);
        rejected++;
      }
    }
    return { synced, rejected };
  } catch {
    await resetOrdersSyncingToPending();
    return { synced: 0, rejected: 0 };
  } finally {
    orderSyncing = false;
  }
}

type MyOrderStatus = {
  clientId: string | null;
  status: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
};

/**
 * Refreshes the seller's synced orders with their current admin-review
 * status. Best-effort — silently no-ops offline. Called on Queue tab
 * focus / pull-to-refresh, not part of the write-side sync above.
 */
export async function refreshOrderApprovalStatuses(): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`${API_BASE_URL}/api/orders?mine=1&limit=-1`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return;

    const { data }: { data: MyOrderStatus[] } = await res.json();
    const updates = data
      .filter((o) => o.clientId)
      .map((o) => ({
        clientId: o.clientId as string,
        approvalStatus: o.status,
        rejectionReason: o.rejectionReason,
      }));
    await updateOrderApprovalStatuses(updates);
  } catch {
    // Offline or transient failure — local statuses stay as last known.
  }
}
