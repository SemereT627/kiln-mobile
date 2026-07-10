import { supabase, API_BASE_URL } from "@/lib/supabase";
import {
  getPendingSales,
  markSyncing,
  markSynced,
  markRejected,
  resetSyncingToPending,
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
