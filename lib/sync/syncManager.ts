import { getDb, getCacheMeta, updateCacheMeta } from '@/lib/db/database';
import { connectivity } from '@/lib/connectivity';
import { useSyncStore } from '@/stores/sync';
import { flushMutationQueue, refreshPendingCount } from '@/lib/sync/mutationQueue';
import { api } from '@/lib/api';

// How long (ms) before a table is considered stale and needs re-sync
const STALE_THRESHOLDS: Record<string, number> = {
  items: 5 * 60 * 1000,
  item_categories: 10 * 60 * 1000,
  units: 10 * 60 * 1000,
  unit_conversions: 10 * 60 * 1000,
  price_policies: 5 * 60 * 1000,
  customers: 5 * 60 * 1000,
  warehouses: 10 * 60 * 1000,
  shelves: 10 * 60 * 1000,
  day_cycle: 2 * 60 * 1000,
  batches: 2 * 60 * 1000,
};

interface UserContext {
  userId: string;
  branchId: string;
  shelfId?: string;
  warehouseId?: string;
  role: string;
}

let _syncInterval: ReturnType<typeof setInterval> | null = null;
let _connectivityUnsub: (() => void) | null = null;
let _currentUserContext: UserContext | null = null;

// ─── Sync individual tables ───────────────────────────────────────────────────

async function syncItemCategories(): Promise<void> {
  const data = await api.inventory.categories.list();
  const categories = data?.data || data || [];
  if (!Array.isArray(categories)) return;
  const db = getDb();

  await db.runAsync('DELETE FROM item_categories');
  for (const cat of categories) {
    await db.runAsync(
      `INSERT OR REPLACE INTO item_categories (id, name, name_ar, parent_id, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [cat.id, cat.name, cat.nameAr, cat.parentId ?? null, cat.isActive ? 1 : 0]
    );
  }
  await updateCacheMeta('item_categories');
}

async function syncUnits(): Promise<void> {
  const data = await api.inventory.units.list();
  const units = data?.data || data || [];
  if (!Array.isArray(units)) return;
  const db = getDb();

  await db.runAsync('DELETE FROM units');
  for (const u of units) {
    await db.runAsync(
      `INSERT OR REPLACE INTO units (id, name, name_ar, symbol) VALUES (?, ?, ?, ?)`,
      [u.id, u.name, u.nameAr, u.symbol]
    );
  }
  await updateCacheMeta('units');
}

async function syncUnitConversions(): Promise<void> {
  const data = await api.inventory.unitConversions.list();
  const conversions = data?.data || data || [];
  if (!Array.isArray(conversions)) return;
  const db = getDb();

  await db.runAsync('DELETE FROM unit_conversions');
  for (const c of conversions) {
    await db.runAsync(
      `INSERT OR REPLACE INTO unit_conversions (id, from_unit_id, to_unit_id, factor)
       VALUES (?, ?, ?, ?)`,
      [c.id, c.fromUnitId, c.toUnitId, c.factor]
    );
  }
  await updateCacheMeta('unit_conversions');
}

async function syncItems(): Promise<void> {
  const db = getDb();

  // Fetch all pages first, only clear + write if fetch succeeds
  const allItems: any[] = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const data = await api.inventory.items.list(page, pageSize);
    const items = data?.data || [];
    if (items.length === 0 && page === 1) break;
    allItems.push(...items);
    if (page >= (data?.totalPages ?? 1) || items.length === 0) break;
    page++;
  }

  await db.runAsync('DELETE FROM items');
  for (const item of allItems) {
    await db.runAsync(
      `INSERT OR REPLACE INTO items
         (id, sku, name_en, name_ar, category_id, unit_id, is_active, is_consignment,
          min_stock_level, max_stock_level, unit_symbol, unit_name, category_name, category_name_ar)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.sku,
        item.nameEn,
        item.nameAr,
        item.categoryId ?? null,
        item.unitId ?? null,
        item.isActive ? 1 : 0,
        item.isConsignment ? 1 : 0,
        item.minStockLevel ?? null,
        item.maxStockLevel ?? null,
        item.unit?.symbol ?? null,
        item.unit?.name ?? null,
        item.category?.name ?? null,
        item.category?.nameAr ?? null,
      ]
    );
  }

  await updateCacheMeta('items');
}

async function syncPricePolicies(branchId: string, shelfId?: string, warehouseId?: string): Promise<void> {
  const data = await api.inventory.pricePolicies.list(branchId, undefined, warehouseId, shelfId);
  const policies = data?.data || data || [];
  if (!Array.isArray(policies)) return;
  const db = getDb();
  await db.runAsync('DELETE FROM price_policies WHERE branch_id = ?', [branchId]);

  for (const policy of policies) {
    await db.runAsync(
      `INSERT OR REPLACE INTO price_policies
         (id, item_id, branch_id, warehouse_id, shelf_id, wholesale_price_usd, retail_price_usd,
          price_range_min_usd, price_range_max_usd, effective_from, effective_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        policy.id,
        policy.itemId,
        policy.branchId,
        policy.warehouseId ?? null,
        policy.shelfId ?? null,
        Number(policy.wholesalePriceUsd) || 0,
        Number(policy.retailPriceUsd) || 0,
        Number(policy.priceRangeMinUsd) || 0,
        Number(policy.priceRangeMaxUsd) || 0,
        policy.effectiveFrom,
        policy.effectiveTo ?? null,
      ]
    );
  }
  await updateCacheMeta('price_policies');
}

async function syncCustomers(): Promise<void> {
  const db = getDb();

  const allCustomers: any[] = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const data = await api.sales.customers.list(page, pageSize);
    const customers = data?.data || [];
    if (customers.length === 0 && page === 1) break;
    allCustomers.push(...customers);
    if (page >= (data?.totalPages ?? 1) || customers.length === 0) break;
    page++;
  }

  await db.runAsync('DELETE FROM customers');
  for (const c of allCustomers) {
    await db.runAsync(
      `INSERT OR REPLACE INTO customers
         (id, name, name_ar, phone, email, customer_type, is_active, credit_limit_sdg, balance_sdg)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id,
        c.name,
        c.nameAr ?? null,
        c.phone ?? null,
        c.email ?? null,
        c.customerType,
        c.isActive ? 1 : 0,
        c.creditLimitSdg ? Number(c.creditLimitSdg) : null,
        c.balanceSdg ? Number(c.balanceSdg) : 0,
      ]
    );
  }

  await updateCacheMeta('customers');
}

async function syncWarehouses(): Promise<void> {
  const data = await api.inventory.warehouses();
  const warehouses = data?.data || data || [];
  if (!Array.isArray(warehouses)) return;
  const db = getDb();

  await db.runAsync('DELETE FROM warehouses');
  for (const w of warehouses) {
    await db.runAsync(
      `INSERT OR REPLACE INTO warehouses (id, name, name_ar, code) VALUES (?, ?, ?, ?)`,
      [w.id, w.name, w.nameAr, w.code]
    );
  }
  await updateCacheMeta('warehouses');
}

async function syncShelves(): Promise<void> {
  const data = await api.inventory.shelves();
  const shelves = data?.data || data || [];
  if (!Array.isArray(shelves)) return;
  const db = getDb();

  await db.runAsync('DELETE FROM shelves');
  for (const s of shelves) {
    await db.runAsync(
      `INSERT OR REPLACE INTO shelves (id, name, name_ar, code, user_id) VALUES (?, ?, ?, ?, ?)`,
      [s.id, s.name, s.nameAr, s.code, s.userId ?? null]
    );
  }
  await updateCacheMeta('shelves');
}

async function syncDayCycle(branchId: string): Promise<void> {
  try {
    const dayCycle = await api.dayCycle.getCurrent(branchId);
    const db = getDb();

    await db.runAsync('DELETE FROM day_cycle WHERE branch_id = ?', [branchId]);

    if (dayCycle) {
      await db.runAsync(
        `INSERT OR REPLACE INTO day_cycle
           (id, branch_id, cycle_date, exchange_rate_usd_sdg, status, opened_at, closed_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dayCycle.id,
          dayCycle.branchId,
          dayCycle.cycleDate,
          Number(dayCycle.exchangeRateUsdSdg) || 1,
          dayCycle.status,
          dayCycle.openedAt ?? null,
          dayCycle.closedAt ?? null,
          Date.now(),
        ]
      );
    }
    await updateCacheMeta('day_cycle');
  } catch {
    // Day cycle errors should not block other sync
  }
}

async function syncBatches(ctx: UserContext): Promise<void> {
  const db = getDb();

  if (ctx.shelfId) {
    await db.runAsync('DELETE FROM batches WHERE shelf_id = ?', [ctx.shelfId]);
    try {
      const data = await api.inventory.stockManagement.getShelfStock(ctx.shelfId, { pageSize: 200 });
      const items = data?.data || [];

      for (const stockItem of items) {
        // Each stockItem may have multiple batches
        const batchData = await api.inventory.stockManagement.getBatches(stockItem.itemId ?? stockItem.id, {
          shelfId: ctx.shelfId,
        });
        const batches = batchData?.data || batchData || [];
        for (const b of batches) {
          await db.runAsync(
            `INSERT OR REPLACE INTO batches
               (id, item_id, warehouse_id, shelf_id, qty_remaining, unit_cost_usd, received_date, is_consignment)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              b.id,
              b.itemId,
              b.warehouseId ?? null,
              b.shelfId ?? null,
              Number(b.qtyRemaining) || 0,
              Number(b.unitCostUsd) || 0,
              b.receivedDate,
              b.isConsignment ? 1 : 0,
            ]
          );
        }
      }
    } catch {
      // Batch sync errors should not block
    }
  }

  if (ctx.warehouseId) {
    await db.runAsync('DELETE FROM batches WHERE warehouse_id = ?', [ctx.warehouseId]);
    try {
      const data = await api.inventory.stockManagement.getWarehouseStock(ctx.warehouseId, { pageSize: 200 });
      const items = data?.data || [];

      for (const stockItem of items) {
        const batchData = await api.inventory.stockManagement.getBatches(stockItem.itemId ?? stockItem.id, {
          warehouseId: ctx.warehouseId,
        });
        const batches = batchData?.data || batchData || [];
        for (const b of batches) {
          await db.runAsync(
            `INSERT OR REPLACE INTO batches
               (id, item_id, warehouse_id, shelf_id, qty_remaining, unit_cost_usd, received_date, is_consignment)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              b.id,
              b.itemId,
              b.warehouseId ?? null,
              b.shelfId ?? null,
              Number(b.qtyRemaining) || 0,
              Number(b.unitCostUsd) || 0,
              b.receivedDate,
              b.isConsignment ? 1 : 0,
            ]
          );
        }
      }
    } catch {
      // Batch sync errors should not block
    }
  }

  await updateCacheMeta('batches');
}

// ─── Staleness helpers ────────────────────────────────────────────────────────

async function isStale(tableName: string): Promise<boolean> {
  const lastSynced = await getCacheMeta(tableName);
  const threshold = STALE_THRESHOLDS[tableName] ?? 5 * 60 * 1000;
  return Date.now() - lastSynced > threshold;
}

async function getStaleTables(): Promise<string[]> {
  const tables = Object.keys(STALE_THRESHOLDS);
  const stale: string[] = [];
  for (const t of tables) {
    if (await isStale(t)) stale.push(t);
  }
  return stale;
}

// ─── Full and incremental sync ────────────────────────────────────────────────

export async function performFullSync(ctx: UserContext): Promise<void> {
  if (!connectivity.isOnline()) return;

  const { setIsSyncing, setLastSyncAt, setStaleTables } = useSyncStore.getState();
  setIsSyncing(true);

  try {
    // Flush any queued mutations first
    await flushMutationQueue();
    await refreshPendingCount();

    // Sync reference data (role-based)
    await Promise.allSettled([
      syncItemCategories(),
      syncUnits(),
      syncUnitConversions(),
      syncItems(),
      syncWarehouses(),
      syncShelves(),
      syncCustomers(),
    ]);

    // Sync branch-specific data
    if (ctx.branchId) {
      await syncPricePolicies(ctx.branchId, ctx.shelfId, ctx.warehouseId);
      await syncDayCycle(ctx.branchId);
    }

    // Sync stock/batch data for user's location
    await syncBatches(ctx);

    setLastSyncAt(Date.now());
    setStaleTables([]);
  } catch {
    // Errors are tolerated during sync; individual table errors are handled above
  } finally {
    setIsSyncing(false);
  }
}

export async function performIncrementalSync(ctx: UserContext): Promise<void> {
  if (!connectivity.isOnline()) return;

  const { setIsSyncing, setLastSyncAt, setStaleTables } = useSyncStore.getState();
  setIsSyncing(true);

  const stale = await getStaleTables();
  setStaleTables(stale);

  if (stale.length === 0) {
    setIsSyncing(false);
    return;
  }

  try {
    const tasks: Promise<void>[] = [];

    if (stale.includes('item_categories')) tasks.push(syncItemCategories());
    if (stale.includes('units')) tasks.push(syncUnits());
    if (stale.includes('unit_conversions')) tasks.push(syncUnitConversions());
    if (stale.includes('items')) tasks.push(syncItems());
    if (stale.includes('warehouses')) tasks.push(syncWarehouses());
    if (stale.includes('shelves')) tasks.push(syncShelves());
    if (stale.includes('customers')) tasks.push(syncCustomers());
    if (stale.includes('price_policies') && ctx.branchId) {
      tasks.push(syncPricePolicies(ctx.branchId, ctx.shelfId, ctx.warehouseId));
    }
    if (stale.includes('day_cycle') && ctx.branchId) {
      tasks.push(syncDayCycle(ctx.branchId));
    }
    if (stale.includes('batches')) {
      tasks.push(syncBatches(ctx));
    }

    await Promise.allSettled(tasks);

    setLastSyncAt(Date.now());
    setStaleTables(await getStaleTables());
  } catch {
    // Tolerated
  } finally {
    setIsSyncing(false);
  }
}

// ─── Start / stop background sync ────────────────────────────────────────────

export function startBackgroundSync(ctx: UserContext): void {
  _currentUserContext = ctx;

  // Flush queue and incremental sync on reconnect
  _connectivityUnsub?.();
  _connectivityUnsub = connectivity.onStatusChange(async (isOnline) => {
    if (isOnline && _currentUserContext) {
      await flushMutationQueue();
      await performIncrementalSync(_currentUserContext);
    }
  });

  // Periodic incremental sync every 5 minutes
  if (_syncInterval) clearInterval(_syncInterval);
  _syncInterval = setInterval(async () => {
    if (_currentUserContext && connectivity.isOnline()) {
      await performIncrementalSync(_currentUserContext);
    }
  }, 5 * 60 * 1000);
}

export function stopBackgroundSync(): void {
  if (_syncInterval) {
    clearInterval(_syncInterval);
    _syncInterval = null;
  }
  _connectivityUnsub?.();
  _connectivityUnsub = null;
  _currentUserContext = null;
}
