import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSyncStore } from '@/stores/sync';
import { useThemeStore } from '@/stores/theme';
import { connectivity } from '@/lib/connectivity';
import { useEffect, useState } from 'react';

export default function SyncStatusBadge() {
  const { pendingMutations, isSyncing, syncErrors, lastSyncAt } = useSyncStore();
  const { theme } = useThemeStore();
  const [isOnline, setIsOnline] = useState(connectivity.isOnline());

  useEffect(() => {
    const unsub = connectivity.onStatusChange(setIsOnline);
    return unsub;
  }, []);

  const getState = (): 'syncing' | 'error' | 'pending' | 'ok' | 'offline' => {
    if (!isOnline) return 'offline';
    if (isSyncing) return 'syncing';
    if (syncErrors.length > 0) return 'error';
    if (pendingMutations > 0) return 'pending';
    return 'ok';
  };

  const state = getState();

  const iconMap: Record<string, { name: string; color: string }> = {
    syncing: { name: 'sync-outline', color: '#3b82f6' },
    error: { name: 'warning-outline', color: '#ef4444' },
    pending: { name: 'time-outline', color: '#f59e0b' },
    ok: { name: 'checkmark-circle-outline', color: '#10b981' },
    offline: { name: 'cloud-offline-outline', color: '#9ca3af' },
  };

  const { name, color } = iconMap[state];

  return (
    <TouchableOpacity
      onPress={() => router.push('/(drawer)/sync-status' as any)}
      style={styles.container}
      activeOpacity={0.7}
    >
      <Ionicons name={name as any} size={22} color={color} />
      {(pendingMutations > 0 || syncErrors.length > 0) && (
        <View style={[styles.badge, { backgroundColor: syncErrors.length > 0 ? '#ef4444' : '#f59e0b' }]}>
          <Text style={styles.badgeText}>
            {syncErrors.length > 0 ? syncErrors.length : pendingMutations}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 4,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
