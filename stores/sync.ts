import { create } from 'zustand';

export interface SyncError {
  id: string;
  mutationType: string;
  localRef: string | null;
  errorMessage: string;
  failedAt: number;
}

interface SyncState {
  lastSyncAt: number | null;
  isSyncing: boolean;
  pendingMutations: number;
  syncErrors: SyncError[];
  staleTables: string[];

  setLastSyncAt: (ts: number) => void;
  setIsSyncing: (syncing: boolean) => void;
  setPendingMutations: (count: number) => void;
  addSyncError: (error: SyncError) => void;
  clearSyncErrors: () => void;
  setStaleTables: (tables: string[]) => void;
  reset: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  lastSyncAt: null,
  isSyncing: false,
  pendingMutations: 0,
  syncErrors: [],
  staleTables: [],

  setLastSyncAt: (ts) => set({ lastSyncAt: ts }),
  setIsSyncing: (syncing) => set({ isSyncing: syncing }),
  setPendingMutations: (count) => set({ pendingMutations: count }),
  addSyncError: (error) =>
    set((state) => ({ syncErrors: [...state.syncErrors, error] })),
  clearSyncErrors: () => set({ syncErrors: [] }),
  setStaleTables: (tables) => set({ staleTables: tables }),
  reset: () =>
    set({
      lastSyncAt: null,
      isSyncing: false,
      pendingMutations: 0,
      syncErrors: [],
      staleTables: [],
    }),
}));
