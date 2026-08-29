import { supabase, API_BASE_URL } from "@/lib/supabase";

/**
 * Return requests are a much rarer, lower-frequency action than a sale, and
 * only ever make sense against an order the seller can already see synced —
 * so unlike orders, this is a direct API call with no local offline queue.
 * If offline, the caller just sees an error and retries once connected.
 */

export type OrderDetailItem = {
  id: string;
  ceramicId: string;
  productName: string;
  productCode: string;
  quantity: number;
  priceAtSale: number;
  measurementUnit: string;
  returnedQuantity: number;
};

export type OrderReturnRequestSummary = {
  id: string;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  rejectionReason: string | null;
  createdAt: string;
  items: { id: string; orderItemId: string; quantity: number }[];
};

export type OrderDetail = {
  id: string;
  status: string;
  items: OrderDetailItem[];
  returnRequests: OrderReturnRequestSummary[];
};

/** Fresh, live fetch of the full order — used only when the return-request
 * sheet opens, so it always reflects the true current returnable amount
 * (other pending requests, prior returns) rather than a locally cached
 * snapshot that was never plumbed through the offline sync pipeline. */
export async function fetchOrderDetail(serverId: string): Promise<OrderDetail | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/orders/${serverId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("fetchOrderDetail: failed", err);
    return null;
  }
}

export async function submitReturnRequest(
  serverId: string,
  items: { orderItemId: string; quantity: number }[],
  notes: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  try {
    const res = await fetch(`${API_BASE_URL}/api/orders/${serverId}/return-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ items, notes }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: json.error || "Failed to submit return request." };
    }
    return { ok: true };
  } catch (err) {
    console.error("submitReturnRequest: failed", err);
    return { ok: false, error: "Network error — check your connection and try again." };
  }
}
