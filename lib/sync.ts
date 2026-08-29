import { supabase, API_BASE_URL } from "@/lib/supabase";
import {
  getPendingOrders,
  markOrdersSyncing,
  markOrderSynced,
  markOrderRejectedSync,
  resetOrdersSyncingToPending,
  updateOrderApprovalStatuses,
  applyOrderItemAdjustments,
  setOrderServerId,
  setSyncIssue,
} from "@/lib/db";

type SyncResult =
  | { clientId: string; status: "synced"; id: string }
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

let orderSyncing = false;

/**
 * Pushes all locally-queued orders to POST /api/orders/sync. Safe to call
 * repeatedly (NetInfo reconnect, app foreground, pull-to-refresh) — a sync
 * already in flight is skipped rather than run twice, and the server dedupes
 * by client_id.
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
    const seen = new Set<string>();
    for (const result of results) {
      seen.add(result.clientId);
      if (result.status === "synced") {
        await markOrderSynced(result.clientId, result.id || null);
        synced++;
      } else {
        await markOrderRejectedSync(result.clientId, result.reason);
        rejected++;
      }
    }

    // The server is expected to report a result for every order it received —
    // if it dropped one (errored out mid-loop, response truncated), reset it
    // to 'pending' now rather than leaving it stuck "Syncing…" until the next
    // sync attempt's resetOrdersSyncingToPending() happens to catch it.
    const unmatched = pending.filter((o) => !seen.has(o.clientId)).map((o) => o.clientId);
    if (unmatched.length > 0) {
      console.error("runOrderSync: server omitted results for", unmatched);
      await resetOrdersSyncingToPending();
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
  id: string;
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
      if (order.clientId) {
        // Backfills rows that synced before server_id tracking existed, or
        // whose sync response was lost after the server had already
        // committed — this refresh is the fallback path either way.
        await setOrderServerId(order.clientId, order.id);
      }
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
