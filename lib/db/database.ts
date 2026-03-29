import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync('golden_offline.db');
  }
  return _db;
}

export async function initDatabase(): Promise<void> {
  const db = getDb();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- Track per-table sync timestamps
    CREATE TABLE IF NOT EXISTS cache_meta (
      table_name TEXT PRIMARY KEY,
      last_synced INTEGER NOT NULL DEFAULT 0
    );

    -- Item categories
    CREATE TABLE IF NOT EXISTS item_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      parent_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- Units
    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      symbol TEXT NOT NULL
    );

    -- Unit conversions
    CREATE TABLE IF NOT EXISTS unit_conversions (
      id TEXT PRIMARY KEY,
      from_unit_id TEXT NOT NULL,
      to_unit_id TEXT NOT NULL,
      factor REAL NOT NULL
    );

    -- Items (product catalog)
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL,
      name_en TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      category_id TEXT,
      unit_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_consignment INTEGER NOT NULL DEFAULT 0,
      min_stock_level REAL,
      max_stock_level REAL,
      unit_symbol TEXT,
      unit_name TEXT,
      category_name TEXT,
      category_name_ar TEXT
    );

    -- Price policies
    CREATE TABLE IF NOT EXISTS price_policies (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      warehouse_id TEXT,
      shelf_id TEXT,
      wholesale_price_usd REAL NOT NULL DEFAULT 0,
      retail_price_usd REAL NOT NULL DEFAULT 0,
      price_range_min_usd REAL NOT NULL DEFAULT 0,
      price_range_max_usd REAL NOT NULL DEFAULT 0,
      effective_from TEXT NOT NULL,
      effective_to TEXT
    );

    -- Customers
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ar TEXT,
      phone TEXT,
      email TEXT,
      customer_type TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      credit_limit_sdg REAL,
      balance_sdg REAL DEFAULT 0
    );

    -- Warehouses
    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      code TEXT NOT NULL
    );

    -- Shelves
    CREATE TABLE IF NOT EXISTS shelves (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      code TEXT NOT NULL,
      user_id TEXT
    );

    -- Current day cycle snapshot
    CREATE TABLE IF NOT EXISTS day_cycle (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL,
      cycle_date TEXT NOT NULL,
      exchange_rate_usd_sdg REAL NOT NULL,
      status TEXT NOT NULL,
      opened_at TEXT,
      closed_at TEXT,
      synced_at INTEGER NOT NULL DEFAULT 0
    );

    -- Batch / stock data for user's location
    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      warehouse_id TEXT,
      shelf_id TEXT,
      qty_remaining REAL NOT NULL DEFAULT 0,
      unit_cost_usd REAL NOT NULL DEFAULT 0,
      received_date TEXT NOT NULL,
      is_consignment INTEGER NOT NULL DEFAULT 0
    );

    -- Offline mutation queue
    CREATE TABLE IF NOT EXISTS mutation_queue (
      id TEXT PRIMARY KEY,
      mutation_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      user_context TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      local_ref TEXT,
      server_result TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      synced_at INTEGER,
      retry_count INTEGER NOT NULL DEFAULT 0
    );

    -- Create indexes for frequently queried columns
    CREATE INDEX IF NOT EXISTS idx_price_policies_item_branch ON price_policies(item_id, branch_id);
    CREATE INDEX IF NOT EXISTS idx_batches_item ON batches(item_id);
    CREATE INDEX IF NOT EXISTS idx_batches_shelf ON batches(shelf_id);
    CREATE INDEX IF NOT EXISTS idx_batches_warehouse ON batches(warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_mutation_queue_status ON mutation_queue(status);
    CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku);
  `);
}

export async function getCacheMeta(tableName: string): Promise<number> {
  const db = getDb();
  const row = await db.getFirstAsync<{ last_synced: number }>(
    'SELECT last_synced FROM cache_meta WHERE table_name = ?',
    [tableName]
  );
  return row?.last_synced ?? 0;
}

export async function updateCacheMeta(tableName: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO cache_meta (table_name, last_synced) VALUES (?, ?)',
    [tableName, Date.now()]
  );
}

export async function clearAllCaches(): Promise<void> {
  const db = getDb();
  await db.execAsync(`
    DELETE FROM item_categories;
    DELETE FROM units;
    DELETE FROM unit_conversions;
    DELETE FROM items;
    DELETE FROM price_policies;
    DELETE FROM customers;
    DELETE FROM warehouses;
    DELETE FROM shelves;
    DELETE FROM day_cycle;
    DELETE FROM batches;
    DELETE FROM cache_meta;
  `);
}
