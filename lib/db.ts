import * as SQLite from "expo-sqlite";

export type SyncStatus = "pending" | "syncing" | "synced" | "rejected";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("acsm-sales.db").then(async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS catalog_cache (
          id TEXT PRIMARY KEY NOT NULL,
          data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pending_orders (
          client_id TEXT PRIMARY KEY NOT NULL,
          payment_method TEXT NOT NULL,
          bank_account TEXT,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          fail_reason TEXT,
          approval_status TEXT,
          rejection_reason TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pending_order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_client_id TEXT NOT NULL,
          ceramic_id TEXT NOT NULL,
          ceramic_name TEXT NOT NULL,
          quantity REAL NOT NULL,
          price_at_sale REAL
        );
        CREATE TABLE IF NOT EXISTS sync_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          issue TEXT,
          issue_at TEXT
        );
        CREATE TABLE IF NOT EXISTS preferences (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      // This device's bundled SQLite doesn't support ADD COLUMN IF NOT
      // EXISTS — added defensively so re-running on an already-migrated
      // install doesn't throw.
      for (const alterStatement of [
        "ALTER TABLE pending_order_items ADD COLUMN final_quantity REAL",
        "ALTER TABLE pending_order_items ADD COLUMN final_price_at_sale REAL",
        // The real server-side orders.id, learned once this order syncs —
        // needed to call order-scoped endpoints (e.g. return requests)
        // against an order this device originated.
        "ALTER TABLE pending_orders ADD COLUMN server_id TEXT",
      ]) {
        try {
          await db.execAsync(alterStatement);
        } catch (err: any) {
          if (!String(err?.message ?? err).includes("duplicate column name")) throw err;
        }
      }
      return db;
    });
  }
  return dbPromise;
}

export type CachedCeramic = {
  id: string;
  name: string;
  productId: string;
  brand: string;
  size: string;
  measurementUnit: string;
  pricePerUnit: number | null;
  currentStock: number;
  imageUrl: string | null;
};

/** Replaces the whole cached catalog — called after every successful fetch
 * so the last-known snapshot is always what's shown offline. */
export async function cacheCatalog(items: CachedCeramic[]) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM catalog_cache");
    for (const item of items) {
      await db.runAsync(
        "INSERT INTO catalog_cache (id, data) VALUES (?, ?)",
        [item.id, JSON.stringify(item)],
      );
    }
  });
}

export async function getCachedCatalog(): Promise<CachedCeramic[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ data: string }>(
    "SELECT data FROM catalog_cache",
  );
  return rows.map((r) => JSON.parse(r.data));
}

export type PaymentMethod = "cash" | "bank_transfer" | "credit";
export type OrderApprovalStatus = "pending" | "approved" | "rejected";

export type OrderCartItem = {
  ceramicId: string;
  ceramicName: string;
  quantity: number;
  priceAtSale: number | null;
  /** Set once the admin's approval differs from what was submitted — see
   * applyOrderItemAdjustments. Absent until a post-approval sync writes it. */
  finalQuantity?: number | null;
  finalPriceAtSale?: number | null;
};

export type PendingOrder = {
  clientId: string;
  serverId: string | null;
  paymentMethod: PaymentMethod;
  bankAccount: string | null;
  notes: string | null;
  status: SyncStatus;
  failReason: string | null;
  approvalStatus: OrderApprovalStatus | null;
  rejectionReason: string | null;
  createdAt: string;
  items: OrderCartItem[];
};

/** Raw shape of a `pending_orders` row, as SQLite returns it (snake_case). */
type PendingOrderRow = {
  client_id: string;
  server_id: string | null;
  payment_method: PaymentMethod;
  bank_account: string | null;
  notes: string | null;
  status: SyncStatus;
  fail_reason: string | null;
  approval_status: OrderApprovalStatus | null;
  rejection_reason: string | null;
  created_at: string;
};

/** Raw shape of a `pending_order_items` row, as SQLite returns it. */
type PendingOrderItemRow = {
  id: number;
  order_client_id: string;
  ceramic_id: string;
  ceramic_name: string;
  quantity: number;
  price_at_sale: number | null;
  final_quantity: number | null;
  final_price_at_sale: number | null;
};

function rowToOrder(row: PendingOrderRow, items: OrderCartItem[]): PendingOrder {
  return {
    clientId: row.client_id,
    serverId: row.server_id,
    paymentMethod: row.payment_method,
    bankAccount: row.bank_account,
    notes: row.notes,
    status: row.status,
    failReason: row.fail_reason,
    approvalStatus: row.approval_status,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    items,
  };
}

/** Queues a multi-item order awaiting admin approval — this device's only
 * offline-first write path (orders are the sole way a sale reaches Sales). */
export async function enqueueOrder(input: {
  clientId: string;
  paymentMethod: PaymentMethod;
  bankAccount: string | null;
  notes: string | null;
  items: OrderCartItem[];
}) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO pending_orders
        (client_id, payment_method, bank_account, notes, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [
        input.clientId,
        input.paymentMethod,
        input.bankAccount,
        input.notes,
        new Date().toISOString(),
      ],
    );
    for (const item of input.items) {
      await db.runAsync(
        `INSERT INTO pending_order_items
          (order_client_id, ceramic_id, ceramic_name, quantity, price_at_sale)
         VALUES (?, ?, ?, ?, ?)`,
        [input.clientId, item.ceramicId, item.ceramicName, item.quantity, item.priceAtSale],
      );
    }
  });
}

async function attachOrderItems(
  db: SQLite.SQLiteDatabase,
  orders: PendingOrderRow[],
): Promise<PendingOrder[]> {
  const result: PendingOrder[] = [];
  for (const row of orders) {
    const itemRows = await db.getAllAsync<PendingOrderItemRow>(
      "SELECT * FROM pending_order_items WHERE order_client_id = ?",
      [row.client_id],
    );
    result.push(
      rowToOrder(
        row,
        itemRows.map((r) => ({
          ceramicId: r.ceramic_id,
          ceramicName: r.ceramic_name,
          quantity: r.quantity,
          priceAtSale: r.price_at_sale,
          finalQuantity: r.final_quantity,
          finalPriceAtSale: r.final_price_at_sale,
        })),
      ),
    );
  }
  return result;
}

export async function getAllOrders(): Promise<PendingOrder[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PendingOrderRow>(
    "SELECT * FROM pending_orders ORDER BY created_at DESC",
  );
  return attachOrderItems(db, rows);
}

export async function getPendingOrders(): Promise<PendingOrder[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PendingOrderRow>(
    "SELECT * FROM pending_orders WHERE status IN ('pending', 'syncing') ORDER BY created_at ASC",
  );
  return attachOrderItems(db, rows);
}

export async function markOrdersSyncing(clientIds: string[]) {
  if (clientIds.length === 0) return;
  const db = await getDb();
  const placeholders = clientIds.map(() => "?").join(",");
  await db.runAsync(
    `UPDATE pending_orders SET status = 'syncing' WHERE client_id IN (${placeholders})`,
    clientIds,
  );
}

export async function markOrderSynced(clientId: string, serverId: string | null) {
  const db = await getDb();
  await db.runAsync(
    "UPDATE pending_orders SET status = 'synced', fail_reason = NULL, server_id = COALESCE(?, server_id) WHERE client_id = ?",
    [serverId, clientId],
  );
}

/** Backfills server_id for a local row once the server-merge path learns it
 * (e.g. a row that synced before this device tracked server_id at all). */
export async function setOrderServerId(clientId: string, serverId: string) {
  const db = await getDb();
  await db.runAsync(
    "UPDATE pending_orders SET server_id = ? WHERE client_id = ? AND server_id IS NULL",
    [serverId, clientId],
  );
}

export async function markOrderRejectedSync(clientId: string, reason: string) {
  const db = await getDb();
  await db.runAsync(
    "UPDATE pending_orders SET status = 'rejected', fail_reason = ? WHERE client_id = ?",
    [reason, clientId],
  );
}

export async function resetOrdersSyncingToPending() {
  const db = await getDb();
  await db.runAsync(
    "UPDATE pending_orders SET status = 'pending' WHERE status = 'syncing'",
  );
}

export async function discardOrder(clientId: string) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM pending_order_items WHERE order_client_id = ?", [clientId]);
    await db.runAsync("DELETE FROM pending_orders WHERE client_id = ?", [clientId]);
  });
}

/** Updates the server-side approval status for synced orders, matched by
 * client_id — called after a GET /api/orders?mine=1 refresh. */
export async function updateOrderApprovalStatuses(
  updates: { clientId: string; approvalStatus: OrderApprovalStatus; rejectionReason: string | null }[],
) {
  const db = await getDb();
  for (const u of updates) {
    await db.runAsync(
      "UPDATE pending_orders SET approval_status = ?, rejection_reason = ? WHERE client_id = ?",
      [u.approvalStatus, u.rejectionReason, u.clientId],
    );
  }
}

/** Writes back the admin-approved final quantity/price for an order's line
 * items, matched to local rows by ceramicId within the order (there's no
 * per-item server id synced to the device). Called on every refresh for any
 * already-approved order (level-triggered, not just on the pending→approved
 * transition) — safe because it's idempotent, always overwriting with the
 * current server values rather than accumulating. See
 * refreshOrderApprovalStatuses. */
export async function applyOrderItemAdjustments(
  clientId: string,
  items: { ceramicId: string; quantity: number; priceAtSale: number }[],
) {
  const db = await getDb();
  for (const item of items) {
    await db.runAsync(
      `UPDATE pending_order_items
       SET final_quantity = ?, final_price_at_sale = ?
       WHERE order_client_id = ? AND ceramic_id = ?`,
      [item.quantity, item.priceAtSale, clientId, item.ceramicId],
    );
  }
}

/** Sum of this device's not-yet-synced order quantities per ceramic, for the
 * "estimated stock" display — the real check only happens server-side. */
export async function getUnsyncedOrderQuantities(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ ceramic_id: string; total: number }>(
    `SELECT oi.ceramic_id as ceramic_id, SUM(oi.quantity) as total
     FROM pending_order_items oi
     JOIN pending_orders o ON o.client_id = oi.order_client_id
     WHERE o.status IN ('pending', 'syncing')
     GROUP BY oi.ceramic_id`,
  );
  return Object.fromEntries(rows.map((r) => [r.ceramic_id, r.total]));
}

export type SyncIssue = { message: string; at: string };

/** Records a blocking sync problem (e.g. dead session) so it survives app
 * restarts and can be surfaced in the Queue screen — cleared once a sync
 * actually succeeds. Not for per-order failures, which use fail_reason. */
export async function setSyncIssue(message: string | null) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_state (id, issue, issue_at) VALUES (1, ?, ?)
     ON CONFLICT (id) DO UPDATE SET issue = excluded.issue, issue_at = excluded.issue_at`,
    [message, message ? new Date().toISOString() : null],
  );
}

export async function getSyncIssue(): Promise<SyncIssue | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ issue: string | null; issue_at: string | null }>(
    "SELECT issue, issue_at FROM sync_state WHERE id = 1",
  );
  if (!row?.issue) return null;
  return { message: row.issue, at: row.issue_at ?? new Date().toISOString() };
}

/** Generic key/value store for small, non-sensitive local preferences (e.g.
 * theme) — plain on-disk SQLite, not the keychain-backed SecureStore used
 * for the session, so reads/writes here are cheap. */
export async function getPreference(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM preferences WHERE key = ?",
    [key],
  );
  return row?.value ?? null;
}

export async function setPreference(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO preferences (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}
