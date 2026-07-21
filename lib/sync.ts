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
  applyOrderItemAdjustments,
  setSyncIssue,
} from "@/lib/db";

type SyncResult =
  | { clientId: string; status: "synced" }
  | { clientId: string; status: "rejected"; reason: string };

/**
 * Fetches the current session, flagging (and persisting) the "not signed
 * in" case as a sync-blocking issue instead of failing silently — this is
 * the dead-refresh-token case that otherwise looks like queued orders never
 * syncing until logout/login.
 */
async function getSessionForSync() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (!session) {
    console.error("sync: no session", error);
    await setSyncIssue(
      error?.message
        ? `Not signed in (${error.message}). Log out and log back in to resume syncing.`
        : "Not signed in. Log out and log back in to resume syncing.",
    );
    return null;
  }
  return session;
}

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

    const session = await getSessionForSync();
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
      if (res.status === 401) {
        await setSyncIssue("Session expired. Log out and log back in to resume syncing.");
      }
      await resetSyncingToPending();
      return { synced: 0, rejected: 0 };
    }

    await setSyncIssue(null);
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

    const session = await getSessionForSync();
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
      console.error("runOrderSync: server responded", res.status, await res.text().catch(() => ""));
      if (res.status === 401) {
        await setSyncIssue("Session expired. Log out and log back in to resume syncing.");
      }
      await resetOrdersSyncingToPending();
      return { synced: 0, rejected: 0 };
    }

    await setSyncIssue(null);
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
  } catch (err) {
    console.error("runOrderSync: request failed", err);
    await resetOrdersSyncingToPending();
    return { synced: 0, rejected: 0 };
  } finally {
    orderSyncing = false;
  }
}

export type ServerOrder = {
  clientId: string | null;
  status: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  paymentMethod: "cash" | "bank_transfer" | "credit";
  bankAccount: string | null;
  notes: string | null;
  createdAt: string;
  items: {
    ceramicId: string;
    productName: string;
    quantity: number;
    priceAtSale: number;
  }[];
};

/**
 * Refreshes the seller's synced orders with their current admin-review
 * status, and returns the full list — used both to write back local status
 * (below) and, by the caller, to show orders synced from this seller's
 * *other* devices, which never have a local row here. Best-effort — returns
 * null and no-ops offline. Called on Queue tab focus / pull-to-refresh, not
 * part of the write-side sync above.
 */
export async function refreshOrderApprovalStatuses(): Promise<ServerOrder[] | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      console.error("refreshOrderApprovalStatuses: no session");
      return null;
    }

    const res = await fetch(`${API_BASE_URL}/api/orders?mine=1&limit=-1`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      console.error(
        "refreshOrderApprovalStatuses: server responded",
        res.status,
        await res.text().catch(() => ""),
      );
      return null;
    }

    const { data }: { data: ServerOrder[] } = await res.json();
    const updates = data
      .filter((o) => o.clientId)
      .map((o) => ({
        clientId: o.clientId as string,
        approvalStatus: o.status,
        rejectionReason: o.rejectionReason,
      }));
    await updateOrderApprovalStatuses(updates);

    for (const order of data) {
      if (order.status === "approved" && order.clientId) {
        await applyOrderItemAdjustments(order.clientId, order.items ?? []);
      }
    }

    return data;
  } catch (err) {
    console.error("refreshOrderApprovalStatuses: failed", err);
    return null;
  }
}
