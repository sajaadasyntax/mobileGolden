/**
 * Offline-aware API wrapper.
 *
 * For reads: tries the real API first; on success caches in SQLite; on failure (offline)
 * falls back to SQLite cache and returns { data, fromCache: true }.
 *
 * For offline-enabled writes: if online, calls the real API; if offline, validates
 * locally and enqueues in the mutation queue, returning { queued: true, localRef }.
 */

import { connectivity } from '@/lib/connectivity';
import { getDb } from '@/lib/db/database';
import { api } from '@/lib/api';
import { enqueueMutation, MutationType } from '@/lib/sync/mutationQueue';
import { useSyncStore } from '@/stores/sync';

export { getLocalQueuedInvoices } from '@/lib/sync/mutationQueue';

// ─── Cache readers ─────────────────────────────────────────────────────────────

export async function getCachedItems(): Promise<any[]> {
  const db = getDb();
  return db.getAllAsync<any>('SELECT * FROM items WHERE is_active = 1 ORDER BY name_en');
}

export async function getCachedItemCategories(): Promise<any[]> {
  const db = getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM item_categories WHERE is_active = 1');
  return rows.map(rowToCategory);
}

export async function getCachedUnits(): Promise<any[]> {
  const db = getDb();
  return db.getAllAsync<any>('SELECT * FROM units');
}

export async function getCachedCustomers(): Promise<any[]> {
  const db = getDb();
  return db.getAllAsync<any>('SELECT * FROM customers WHERE is_active = 1 ORDER BY name');
}

export async function getCachedWarehouses(): Promise<any[]> {
  const db = getDb();
  return db.getAllAsync<any>('SELECT * FROM warehouses ORDER BY name');
}

export async function getCachedShelves(): Promise<any[]> {
  const db = getDb();
  return db.getAllAsync<any>('SELECT * FROM shelves ORDER BY name');
}

export async function getCachedDayCycle(branchId: string): Promise<any | null> {
  const db = getDb();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM day_cycle WHERE branch_id = ? AND status = ?',
    [branchId, 'OPEN']
  );
  return row ? rowToDayCycle(row) : null;
}

export async function getCachedBatchesForShelf(shelfId: string): Promise<any[]> {
  const db = getDb();
  return db.getAllAsync<any>(
    'SELECT * FROM batches WHERE shelf_id = ? AND qty_remaining > 0 ORDER BY received_date ASC',
    [shelfId]
  );
}

export async function getCachedBatchesForWarehouse(warehouseId: string): Promise<any[]> {
  const db = getDb();
  return db.getAllAsync<any>(
    'SELECT * FROM batches WHERE warehouse_id = ? AND qty_remaining > 0 ORDER BY received_date ASC',
    [warehouseId]
  );
}

export async function getCachedStockForShelf(shelfId: string): Promise<any[]> {
  const db = getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT b.item_id, SUM(b.qty_remaining) as qty_remaining,
            i.name_en, i.name_ar, i.sku, i.unit_symbol, i.unit_name
     FROM batches b
     JOIN items i ON i.id = b.item_id
     WHERE b.shelf_id = ? AND b.qty_remaining > 0
     GROUP BY b.item_id`,
    [shelfId]
  );
  return rows;
}

export async function getCachedStockForWarehouse(warehouseId: string): Promise<any[]> {
  const db = getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT b.item_id, SUM(b.qty_remaining) as qty_remaining,
            i.name_en, i.name_ar, i.sku, i.unit_symbol, i.unit_name
     FROM batches b
     JOIN items i ON i.id = b.item_id
     WHERE b.warehouse_id = ? AND b.qty_remaining > 0
     GROUP BY b.item_id`,
    [warehouseId]
  );
  return rows;
}

export async function getCachedPricePolicies(branchId: string, shelfId?: string): Promise<any[]> {
  const db = getDb();
  if (shelfId) {
    return db.getAllAsync<any>(
      'SELECT * FROM price_policies WHERE branch_id = ? AND (shelf_id = ? OR shelf_id IS NULL)',
      [branchId, shelfId]
    );
  }
  return db.getAllAsync<any>(
    'SELECT * FROM price_policies WHERE branch_id = ?',
    [branchId]
  );
}

export async function getCachedPriceForItem(
  itemId: string,
  branchId: string,
  shelfId?: string
): Promise<any | null> {
  const db = getDb();
  // Prefer shelf-specific policy, fall back to branch-level
  if (shelfId) {
    const row = await db.getFirstAsync<any>(
      `SELECT * FROM price_policies
       WHERE item_id = ? AND branch_id = ? AND shelf_id = ?
       ORDER BY effective_from DESC LIMIT 1`,
      [itemId, branchId, shelfId]
    );
    if (row) return rowToPolicy(row);
  }
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM price_policies
     WHERE item_id = ? AND branch_id = ? AND shelf_id IS NULL AND warehouse_id IS NULL
     ORDER BY effective_from DESC LIMIT 1`,
    [itemId, branchId]
  );
  return row ? rowToPolicy(row) : null;
}

// ─── Row mappers ───────────────────────────────────────────────────────────────

function rowToCategory(row: any) {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar,
    parentId: row.parent_id,
    isActive: row.is_active === 1,
  };
}

function rowToDayCycle(row: any) {
  return {
    id: row.id,
    branchId: row.branch_id,
    cycleDate: row.cycle_date,
    exchangeRateUsdSdg: row.exchange_rate_usd_sdg,
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

function rowToPolicy(row: any) {
  return {
    id: row.id,
    itemId: row.item_id,
    branchId: row.branch_id,
    warehouseId: row.warehouse_id,
    shelfId: row.shelf_id,
    wholesalePriceUsd: row.wholesale_price_usd,
    retailPriceUsd: row.retail_price_usd,
    priceRangeMinUsd: row.price_range_min_usd,
    priceRangeMaxUsd: row.price_range_max_usd,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}

// ─── Offline-aware read helper ─────────────────────────────────────────────────

export async function offlineRead<T>(
  remoteFn: () => Promise<T>,
  cachedFn: () => Promise<T | null>
): Promise<{ data: T; fromCache: boolean }> {
  if (connectivity.isOnline()) {
    try {
      const data = await remoteFn();
      return { data, fromCache: false };
    } catch {
      // Fall through to cache
    }
  }
  const cached = await cachedFn();
  return { data: cached as T, fromCache: true };
}

// ─── Offline-capable mutations ─────────────────────────────────────────────────

interface UserContext {
  userId: string;
  branchId: string;
  shelfId?: string;
  warehouseId?: string;
  role: string;
}

export interface OfflineMutationResult {
  queued: boolean;
  localRef?: string;
  result?: any;
}

async function validateOfflineInvoice(
  payload: any,
  userContext: UserContext
): Promise<void> {
  // Check day cycle is known and was open
  const dayCycle = await getCachedDayCycle(userContext.branchId);
  if (!dayCycle) {
    throw new Error('Cannot create invoice offline: no open day cycle found in cache. Open the day first while online.');
  }

  // Check stock for each line (best-effort; server is authoritative on sync)
  if (userContext.shelfId && payload.lines?.length) {
    const db = getDb();
    for (const line of payload.lines) {
      const row = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(qty_remaining), 0) as total
         FROM batches WHERE item_id = ? AND shelf_id = ?`,
        [line.itemId, userContext.shelfId]
      );
      const available = row?.total ?? 0;
      if (available < line.qty) {
        throw new Error(
          `Insufficient stock for item (need ${line.qty}, available ${available.toFixed(2)}). Sync to refresh stock.`
        );
      }
    }
  }
}

export async function offlineCreateInvoice(
  payload: Parameters<typeof api.sales.createInvoice>[0],
  userContext: UserContext
): Promise<OfflineMutationResult> {
  if (connectivity.isOnline()) {
    const result = await api.sales.createInvoice(payload);
    return { queued: false, result };
  }

  await validateOfflineInvoice(payload, userContext);
  const { localRef, id } = await enqueueMutation(
    'sales.invoices.create' as MutationType,
    payload,
    userContext
  );

  return { queued: true, localRef, result: { invoiceNumber: localRef, _offline: true } };
}

export async function offlineVoidInvoice(
  id: string,
  reason: string | undefined,
  userContext: UserContext
): Promise<OfflineMutationResult> {
  if (connectivity.isOnline()) {
    const result = await api.sales.voidInvoice(id, reason);
    return { queued: false, result };
  }

  const { localRef } = await enqueueMutation(
    'sales.invoices.void' as MutationType,
    { id, reason },
    userContext
  );
  return { queued: true, localRef };
}

export async function offlineCreateGoodsRequest(
  payload: Parameters<typeof api.sales.goodsRequests.create>[0],
  userContext: UserContext
): Promise<OfflineMutationResult> {
  if (connectivity.isOnline()) {
    const result = await api.sales.goodsRequests.create(payload);
    return { queued: false, result };
  }

  const dayCycle = await getCachedDayCycle(userContext.branchId);
  if (!dayCycle) {
    throw new Error('Cannot create goods request offline: no open day cycle in cache.');
  }

  const { localRef } = await enqueueMutation(
    'sales.goodsRequests.create' as MutationType,
    payload,
    userContext
  );
  return { queued: true, localRef };
}

export async function offlineSubmitGoodsRequest(
  requestId: string,
  userContext: UserContext
): Promise<OfflineMutationResult> {
  if (connectivity.isOnline()) {
    const result = await api.sales.goodsRequests.submit(requestId);
    return { queued: false, result };
  }

  const { localRef } = await enqueueMutation(
    'sales.goodsRequests.submit' as MutationType,
    { id: requestId },
    userContext
  );
  return { queued: true, localRef };
}

// Convenience: is there any pending offline work?
export function hasPendingWork(): boolean {
  return useSyncStore.getState().pendingMutations > 0;
}
