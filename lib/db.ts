import * as SQLite from "expo-sqlite";

export type SyncStatus = "pending" | "syncing" | "synced" | "rejected";

export type PendingSale = {
  clientId: string;
  ceramicId: string;
  ceramicName: string;
  quantity: number;
  priceAtSale: number | null;
  soldAt: string;
  status: SyncStatus;
  failReason: string | null;
  createdAt: string;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("acsm-sales.db").then(async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS pending_sales (
          client_id TEXT PRIMARY KEY NOT NULL,
          ceramic_id TEXT NOT NULL,
          ceramic_name TEXT NOT NULL,
          quantity REAL NOT NULL,
          price_at_sale REAL,
          sold_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          fail_reason TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS catalog_cache (
          id TEXT PRIMARY KEY NOT NULL,
          data TEXT NOT NULL
        );
      `);
      return db;
    });
  }
  return dbPromise;
}

function rowToSale(row: any): PendingSale {
  return {
    clientId: row.client_id,
    ceramicId: row.ceramic_id,
    ceramicName: row.ceramic_name,
    quantity: row.quantity,
    priceAtSale: row.price_at_sale,
    soldAt: row.sold_at,
    status: row.status,
    failReason: row.fail_reason,
    createdAt: row.created_at,
  };
}

export async function enqueueSale(input: {
  clientId: string;
  ceramicId: string;
  ceramicName: string;
  quantity: number;
  priceAtSale: number | null;
  soldAt: string;
}) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO pending_sales
      (client_id, ceramic_id, ceramic_name, quantity, price_at_sale, sold_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      input.clientId,
      input.ceramicId,
      input.ceramicName,
      input.quantity,
      input.priceAtSale,
      input.soldAt,
      new Date().toISOString(),
    ],
  );
}

export async function getAllSales(): Promise<PendingSale[]> {
  const db = await getDb();
  const rows = await db.getAllAsync(
    "SELECT * FROM pending_sales ORDER BY created_at DESC",
  );
  return rows.map(rowToSale);
}

export async function getPendingSales(): Promise<PendingSale[]> {
  const db = await getDb();
  const rows = await db.getAllAsync(
    "SELECT * FROM pending_sales WHERE status IN ('pending', 'syncing') ORDER BY created_at ASC",
  );
  return rows.map(rowToSale);
}

export async function markSyncing(clientIds: string[]) {
  if (clientIds.length === 0) return;
  const db = await getDb();
  const placeholders = clientIds.map(() => "?").join(",");
  await db.runAsync(
    `UPDATE pending_sales SET status = 'syncing' WHERE client_id IN (${placeholders})`,
    clientIds,
  );
}

export async function markSynced(clientId: string) {
  const db = await getDb();
  // Keep synced rows around for the rep's visible history instead of
  // deleting immediately; they're cheap and useful for a quick audit trail.
  await db.runAsync(
    "UPDATE pending_sales SET status = 'synced', fail_reason = NULL WHERE client_id = ?",
    [clientId],
  );
}

export async function markRejected(clientId: string, reason: string) {
  const db = await getDb();
  await db.runAsync(
    "UPDATE pending_sales SET status = 'rejected', fail_reason = ? WHERE client_id = ?",
    [reason, clientId],
  );
}

/** Revert stuck 'syncing' rows back to 'pending' (e.g. after a crash mid-sync). */
export async function resetSyncingToPending() {
  const db = await getDb();
  await db.runAsync(
    "UPDATE pending_sales SET status = 'pending' WHERE status = 'syncing'",
  );
}

export async function discardSale(clientId: string) {
  const db = await getDb();
  await db.runAsync("DELETE FROM pending_sales WHERE client_id = ?", [
    clientId,
  ]);
}

/** Sum of this device's not-yet-synced quantities for a ceramic, for the
 * "estimated stock" display — the real check only happens server-side. */
export async function getUnsyncedQuantity(ceramicId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT SUM(quantity) as total FROM pending_sales
     WHERE ceramic_id = ? AND status IN ('pending', 'syncing')`,
    [ceramicId],
  );
  return row?.total ?? 0;
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
