# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Offline Sync Model

This app is offline-first: every write queues locally in SQLite (`lib/db.ts`,
`expo-sqlite`) before it's pushed to the web backend
(`acsm-web`'s `POST /api/orders/sync`), and the UI always reads from the local
queue, never from an in-flight network call.

### Orders are the only write path

Orders (`pending_orders` + `pending_order_items`) are the sole way a sale
reaches the `sales` table — there is no direct "quick sale" path from this
app. (An older `pending_sales`/`enqueueSale` pipeline existed for that but was
dead code — no call site ever invoked it — and has been removed.) An order
submitted here sits at `pending` on the server until an admin approves it on
the web dashboard; only approval creates the actual `sales` row (with
possible admin price/quantity overrides — see `finalQuantity`/
`finalPriceAtSale` on `OrderCartItem`).

### Sync lifecycle

Each queued order has a local `status`: `pending` → `syncing` → `synced` |
`rejected`.

- `runOrderSync()` (`lib/sync.ts`) is the only thing that moves orders out of
  `pending`. It's called on network reconnect, app foreground, and pull-to-
  refresh (`hooks/use-auto-sync.ts`) — always safe to call repeatedly; a sync
  already in flight is skipped via the `orderSyncing` module-level flag.
- Before reading pending orders, it always calls `resetOrdersSyncingToPending()`
  first — a previous attempt may have crashed mid-flight, and those rows are
  safe to retry.
- `client_id` (a client-generated UUID) is the idempotency key. The server
  has a UNIQUE constraint on `orders.client_id`; a `23505` unique-violation on
  retry means this order already synced in a prior attempt, and is reported
  back as `synced` rather than an error — never treat a unique-violation as a
  real rejection.
- If the server's `results` array is missing an entry for a `clientId` that
  was submitted (dropped mid-loop, truncated response), that row is reset
  back to `pending` immediately in the same call (see the `unmatched` check
  in `runOrderSync`) rather than waiting for the next sync attempt's blanket
  reset to catch it.
- A `rejected` status is a genuine, confirmed-by-server rejection (e.g.
  `insufficient_stock`, `invalid_ceramic`) — no order was created. The
  Discard button is only ever shown for `rejected` orders for exactly this
  reason; don't offer it for `pending`/`syncing`/`synced` rows.

### Auth

`supabase.auth.startAutoRefresh()`/`stopAutoRefresh()` are wired to
`AppState` in `lib/supabase.ts` — the refresh timer only runs while
foregrounded. `getSessionForSync()` in `lib/sync.ts` treats "no session" and a
401 response as a blocking `sync_state.issue` (surfaced in the Queue screen),
distinct from a per-order `fail_reason`.

### Local preferences

Small non-sensitive local state (currently: theme) goes in the `preferences`
key/value table (`lib/db.ts` — `getPreference`/`setPreference`), not
`expo-secure-store`. SecureStore is reserved for the actual session token —
it's keychain-backed and slower, and using it for things like theme blocks
first paint on a synchronous read.
