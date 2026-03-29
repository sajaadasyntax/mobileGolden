import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '@/stores/theme';
import { useLocaleStore } from '@/stores/locale';
import { useSyncStore } from '@/stores/sync';
import { useAuthStore } from '@/stores/auth';
import {
  getAllMutations,
  retryFailed,
  refreshPendingCount,
} from '@/lib/sync/mutationQueue';
import { performFullSync } from '@/lib/sync/syncManager';
import { connectivity } from '@/lib/connectivity';

export default function SyncStatusScreen() {
  const { theme } = useThemeStore();
  const { locale } = useLocaleStore();
  const { user } = useAuthStore();
  const { lastSyncAt, isSyncing, pendingMutations, syncErrors } = useSyncStore();
  const [mutations, setMutations] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(connectivity.isOnline());

  const isAr = locale === 'ar';

  useEffect(() => {
    loadMutations();
    const unsub = connectivity.onStatusChange(setIsOnline);
    return unsub;
  }, []);

  async function loadMutations() {
    const all = await getAllMutations();
    setMutations(all);
  }

  async function handleSyncNow() {
    if (!isOnline) {
      Alert.alert(
        isAr ? 'غير متصل' : 'Offline',
        isAr ? 'يجب الاتصال بالإنترنت للمزامنة' : 'Internet connection required to sync.'
      );
      return;
    }
    if (!user?.branchId) return;
    await performFullSync({
      userId: user.id,
      branchId: user.branchId,
      shelfId: user.shelf?.id,
      role: user.role,
    });
    await loadMutations();
  }

  async function handleRetryFailed() {
    await retryFailed();
    await refreshPendingCount();
    await loadMutations();
    if (isOnline) handleSyncNow();
  }

  const formatTime = (ts: number | null) => {
    if (!ts) return isAr ? 'لم تتم بعد' : 'Never';
    const d = new Date(ts);
    return d.toLocaleTimeString(isAr ? 'ar-SD' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const mutationLabel = (type: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      'sales.invoices.create': { en: 'Create Sales Invoice', ar: 'إنشاء فاتورة مبيعات' },
      'sales.invoices.void': { en: 'Void Invoice', ar: 'إلغاء فاتورة' },
      'sales.goodsRequests.create': { en: 'Create Goods Request', ar: 'إنشاء طلب بضاعة' },
      'sales.goodsRequests.submit': { en: 'Submit Goods Request', ar: 'إرسال طلب بضاعة' },
    };
    const label = labels[type];
    return label ? (isAr ? label.ar : label.en) : type;
  };

  const statusColor = (status: string) => {
    if (status === 'synced') return '#10b981';
    if (status === 'failed') return '#ef4444';
    return '#f59e0b';
  };

  const statusLabel = (status: string) => {
    if (status === 'synced') return isAr ? 'تمت' : 'Synced';
    if (status === 'failed') return isAr ? 'فشل' : 'Failed';
    return isAr ? 'معلق' : 'Pending';
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Status overview */}
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {isAr ? 'حالة المزامنة' : 'Sync Status'}
        </Text>

        <View style={styles.row}>
          <Ionicons
            name={isOnline ? 'wifi' : 'wifi-outline'}
            size={18}
            color={isOnline ? '#10b981' : '#ef4444'}
          />
          <Text style={[styles.rowText, { color: theme.text }]}>
            {isOnline
              ? isAr ? 'متصل' : 'Online'
              : isAr ? 'غير متصل' : 'Offline'}
          </Text>
        </View>

        <View style={styles.row}>
          <Ionicons name="time-outline" size={18} color={theme.textSecondary || '#9ca3af'} />
          <Text style={[styles.rowText, { color: theme.textSecondary || '#9ca3af' }]}>
            {isAr ? 'آخر مزامنة: ' : 'Last sync: '}
            {formatTime(lastSyncAt)}
          </Text>
        </View>

        {pendingMutations > 0 && (
          <View style={styles.row}>
            <Ionicons name="hourglass-outline" size={18} color="#f59e0b" />
            <Text style={[styles.rowText, { color: '#f59e0b' }]}>
              {isAr
                ? `${pendingMutations} عملية معلقة`
                : `${pendingMutations} pending change${pendingMutations > 1 ? 's' : ''}`}
            </Text>
          </View>
        )}

        {syncErrors.length > 0 && (
          <View style={styles.row}>
            <Ionicons name="warning-outline" size={18} color="#ef4444" />
            <Text style={[styles.rowText, { color: '#ef4444' }]}>
              {isAr
                ? `${syncErrors.length} عملية فشلت`
                : `${syncErrors.length} sync error${syncErrors.length > 1 ? 's' : ''}`}
            </Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.primary || '#3b82f6' }, !isOnline && styles.btnDisabled]}
          onPress={handleSyncNow}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="sync-outline" size={18} color="#fff" />
          )}
          <Text style={styles.btnText}>
            {isSyncing
              ? isAr ? 'جاري المزامنة...' : 'Syncing...'
              : isAr ? 'مزامنة الآن' : 'Sync Now'}
          </Text>
        </TouchableOpacity>

        {syncErrors.length > 0 && (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#f59e0b' }]}
            onPress={handleRetryFailed}
          >
            <Ionicons name="refresh-outline" size={18} color="#fff" />
            <Text style={styles.btnText}>
              {isAr ? 'إعادة المحاولة' : 'Retry Failed'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Mutation history */}
      {mutations.length > 0 && (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {isAr ? 'سجل العمليات' : 'Operation Log'}
          </Text>
          {mutations.map((m) => (
            <View key={m.id} style={[styles.mutationRow, { borderColor: theme.border || '#e5e7eb' }]}>
              <View style={styles.mutationHeader}>
                <Text style={[styles.mutationLabel, { color: theme.text }]}>
                  {mutationLabel(m.mutationType)}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(m.status) }]}>
                  <Text style={styles.statusText}>{statusLabel(m.status)}</Text>
                </View>
              </View>
              {m.localRef && (
                <Text style={[styles.mutationMeta, { color: theme.textSecondary || '#9ca3af' }]}>
                  {isAr ? 'المرجع: ' : 'Ref: '}{m.localRef}
                </Text>
              )}
              {m.serverResult?.invoiceNumber && (
                <Text style={[styles.mutationMeta, { color: '#10b981' }]}>
                  {isAr ? 'رقم الفاتورة: ' : 'Invoice #: '}{m.serverResult.invoiceNumber}
                </Text>
              )}
              {m.errorMessage && (
                <Text style={[styles.mutationError, { color: '#ef4444' }]}>
                  {m.errorMessage}
                </Text>
              )}
              <Text style={[styles.mutationMeta, { color: theme.textSecondary || '#9ca3af' }]}>
                {new Date(m.createdAt).toLocaleString(isAr ? 'ar-SD' : 'en-US')}
              </Text>
            </View>
          ))}
        </View>
      )}

      {mutations.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#10b981" />
          <Text style={[styles.emptyText, { color: theme.textSecondary || '#9ca3af' }]}>
            {isAr ? 'لا توجد عمليات معلقة' : 'No pending operations'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  rowText: { fontSize: 14 },
  actions: {
    gap: 10,
    marginBottom: 16,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 10,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  mutationRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  mutationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  mutationLabel: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  mutationMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  mutationError: {
    fontSize: 12,
    marginTop: 2,
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
  },
});
