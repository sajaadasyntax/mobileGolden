import { getDb } from '@/lib/db/database';
import { useSyncStore, SyncError } from '@/stores/sync';
import { api } from '@/lib/api';

export type MutationType =
  | 'sales.invoices.create'
  | 'sales.invoices.void'
  | 'sales.goodsRequests.create'
  | 'sales.goodsRequests.submit';

interface UserContext {
  userId: string;
  branchId: string;
  shelfId?: string;
  warehouseId?: string;
  role: string;
}

interface QueueEntry {
  id: string;
  mutationType: MutationType;
  payload: any;
  userContext: UserContext;
  status: 'pending' | 'synced' | 'failed';
  localRef: string | null;
  serverResult: any | null;
  errorMessage: string | null;
  createdAt: number;
  syncedAt: number | null;
  retryCount: number;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generateLocalRef(type: MutationType): string {
  const prefix = type === 'sales.invoices.create' ? 'OFFLINE-INV' : 'OFFLINE-REQ';
  return `${prefix}-${Date.now()}`;
}

export async function enqueueMutation(
  mutationType: MutationType,
  payload: any,
  userContext: UserContext
): Promise<{ localRef: string; id: string }> {
  const db = getDb();
  const id = generateId();
  const localRef = generateLocalRef(mutationType);
  const now = Date.now();

  await db.runAsync(
    `INSERT INTO mutation_queue
       (id, mutation_type, payload, user_context, status, local_ref, created_at, retry_count)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, 0)`,
    [
      id,
      mutationType,
      JSON.stringify(payload),
      JSON.stringify(userContext),
      localRef,
      now,
    ]
  );

  await refreshPendingCount();
  return { localRef, id };
}

export async function getPendingMutations(): Promise<QueueEntry[]> {
  const db = getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM mutation_queue WHERE status = 'pending' ORDER BY created_at ASC`
  );
  return rows.map(deserializeRow);
}

export async function getAllMutations(): Promise<QueueEntry[]> {
  const db = getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM mutation_queue ORDER BY created_at DESC LIMIT 100`
  );
  return rows.map(deserializeRow);
}

function deserializeRow(row: any): QueueEntry {
  return {
    id: row.id,
    mutationType: row.mutation_type as MutationType,
    payload: JSON.parse(row.payload),
    userContext: JSON.parse(row.user_context),
    status: row.status,
    localRef: row.local_ref,
    serverResult: row.server_result ? JSON.parse(row.server_result) : null,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    syncedAt: row.synced_at,
    retryCount: row.retry_count,
  };
}

async function markSynced(id: string, serverResult: any): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE mutation_queue SET status = 'synced', server_result = ?, synced_at = ? WHERE id = ?`,
    [JSON.stringify(serverResult), Date.now(), id]
  );
}

async function markFailed(id: string, errorMessage: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE mutation_queue
     SET status = 'failed', error_message = ?, retry_count = retry_count + 1
     WHERE id = ?`,
    [errorMessage, id]
  );
}

async function replayOne(entry: QueueEntry): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    let result: any;
    switch (entry.mutationType) {
      case 'sales.invoices.create':
        result = await api.sales.createInvoice(entry.payload);
        break;
      case 'sales.invoices.void':
        result = await api.sales.voidInvoice(entry.payload.id, entry.payload.reason);
        break;
      case 'sales.goodsRequests.create':
        result = await api.sales.goodsRequests.create(entry.payload);
        break;
      case 'sales.goodsRequests.submit':
        result = await api.sales.goodsRequests.submit(entry.payload.id);
        break;
      default:
        throw new Error(`Unknown mutation type: ${entry.mutationType}`);
    }
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unknown error' };
  }
}

export async function flushMutationQueue(): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingMutations();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  const { clearSyncErrors, addSyncError, setPendingMutations } = useSyncStore.getState();
  clearSyncErrors();

  let synced = 0;
  let failed = 0;

  for (const entry of pending) {
    const outcome = await replayOne(entry);
    if (outcome.success) {
      await markSynced(entry.id, outcome.result);
      synced++;
    } else {
      await markFailed(entry.id, outcome.error || 'Failed');
      failed++;
      const syncError: SyncError = {
        id: entry.id,
        mutationType: entry.mutationType,
        localRef: entry.localRef,
        errorMessage: outcome.error || 'Failed',
        failedAt: Date.now(),
      };
      addSyncError(syncError);
    }
  }

  await refreshPendingCount();
  return { synced, failed };
}

export async function retryFailed(): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE mutation_queue SET status = 'pending', error_message = NULL WHERE status = 'failed'`
  );
  await refreshPendingCount();
}

export async function refreshPendingCount(): Promise<void> {
  const db = getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM mutation_queue WHERE status = 'pending'`
  );
  useSyncStore.getState().setPendingMutations(row?.count ?? 0);
}

export async function getLocalQueuedInvoices(): Promise<any[]> {
  const db = getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM mutation_queue
     WHERE mutation_type = 'sales.invoices.create' AND status = 'pending'
     ORDER BY created_at DESC`
  );
  return rows.map((row) => {
    const entry = deserializeRow(row);
    return {
      ...entry.payload,
      _localRef: entry.localRef,
      _queued: true,
      _createdAt: entry.createdAt,
    };
  });
}
