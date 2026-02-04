import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface PurchaseOrder {
  id: string;
  poNumber: string;
  orderDate: string;
  totalSdg: number;
  totalUsd: number;
  status: string;
  supplier?: { name: string; nameAr: string };
}

export default function ProcurementScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ pending: 0, draft: 0, completed: 0, outstanding: 0 });
  const [activeFilter, setActiveFilter] = useState<'all' | 'outstanding' | 'pending' | 'draft' | 'completed'>('all');
  const isRtl = locale === 'ar';

  const loadOrders = async () => {
    try {
      if (user?.branchId) {
        const result = await api.procurement.orders(user.branchId);
        const rawData = result?.result?.data?.data || result?.data || result || [];
        
        // Map the data to ensure correct field names
        const data = (Array.isArray(rawData) ? rawData : []).map((o: any) => ({
          id: o.id,
          poNumber: o.poNumber || o.orderNumber || `PO-${o.id?.substring(0, 8)}`,
          orderDate: o.orderDate || o.createdAt || new Date().toISOString(),
          totalSdg: Number(o.totalSdg) || 0,
          totalUsd: Number(o.totalUsd) || (Number(o.totalSdg) / 600) || 0,
          // Preserve exact status from API, default to DRAFT if missing
          status: o.status || 'DRAFT',
          supplier: o.supplier,
        }));
        
        setOrders(data);
        
        // Calculate stats with proper status matching
        setStats({
          pending: data.filter((o: any) => ['APPROVED', 'PARTIALLY_RECEIVED'].includes(o.status)).length,
          draft: data.filter((o: any) => o.status === 'DRAFT').length,
          completed: data.filter((o: any) => ['FULLY_RECEIVED', 'CLOSED'].includes(o.status)).length,
          outstanding: data.filter((o: any) => !['FULLY_RECEIVED', 'CLOSED', 'CANCELLED'].includes(o.status)).length,
        });
      }
    } catch (error) {
      console.error('Failed to load orders:', error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FULLY_RECEIVED':
      case 'CLOSED':
        return theme.success;
      case 'APPROVED':
        return theme.primary;
      case 'PARTIALLY_RECEIVED':
        return theme.warning;
      case 'DRAFT':
        return theme.textSecondary;
      case 'CANCELLED':
        return theme.error;
      default:
        return theme.textMuted;
    }
  };

  // Check if user can create procurement orders (not warehouse users)
  const canCreateProcurement = ['ADMIN', 'MANAGER', 'PROCUREMENT'].includes(user?.role || '');

  const formatCurrency = (amount: number, currency: string = 'SDG') => {
    return `${amount.toLocaleString()} ${currency === 'USD' ? t('usd', locale) : t('sdg', locale)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Filter orders based on active filter
  const getFilteredOrders = () => {
    switch (activeFilter) {
      case 'outstanding':
        // Orders that are not fully received, closed, or cancelled
        return orders.filter((o) => !['FULLY_RECEIVED', 'CLOSED', 'CANCELLED'].includes(o.status));
      case 'pending':
        // Orders that are APPROVED or PARTIALLY_RECEIVED
        return orders.filter((o) => ['APPROVED', 'PARTIALLY_RECEIVED'].includes(o.status));
      case 'draft':
        return orders.filter((o) => o.status === 'DRAFT');
      case 'completed':
        return orders.filter((o) => ['FULLY_RECEIVED', 'CLOSED'].includes(o.status));
      case 'all':
      default:
        return orders;
    }
  };

  const filteredOrders = getFilteredOrders();

  const renderOrder = ({ item }: { item: PurchaseOrder }) => {
    const statusColor = getStatusColor(item.status);
    return (
      <TouchableOpacity 
        style={[styles.orderCard, { backgroundColor: theme.card }, isRtl && styles.orderCardRtl]}
        onPress={() => router.push({ pathname: '/po-detail', params: { id: item.id } })}
      >
        <View style={[styles.orderIcon, { backgroundColor: theme.warningBackground }]}>
          <Ionicons name="document-text" size={24} color={theme.warning} />
        </View>
        <View style={[styles.orderContent, isRtl && styles.orderContentRtl]}>
          <View style={[styles.orderHeader, isRtl && styles.orderHeaderRtl]}>
            <Text style={[styles.orderNumber, { color: theme.text }]}>{item.poNumber}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {t((item.status || 'draft').toLowerCase() as any, locale) || item.status || 'Draft'}
              </Text>
            </View>
          </View>
          <Text style={[styles.supplierName, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? item.supplier?.nameAr : item.supplier?.name}
          </Text>
          <Text style={[styles.orderDate, { color: theme.textMuted }, isRtl && styles.textRtl]}>{formatDate(item.orderDate)}</Text>
        </View>
        <View style={[styles.orderAmount, isRtl && styles.orderAmountRtl]}>
          <Text style={[styles.amountValue, { color: theme.success }]}>{formatCurrency(Number(item.totalUsd || 0), 'USD')}</Text>
          <Text style={[styles.amountSdg, { color: theme.textSecondary }]}>{formatCurrency(Number(item.totalSdg))}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* New Purchase Button - Only for Admin/Manager/Procurement users */}
      {canCreateProcurement && (
        <TouchableOpacity 
          style={[styles.newPurchaseButton, isRtl && styles.newPurchaseButtonRtl]}
          onPress={() => router.push('/create-procurement-invoice')}
        >
          <Ionicons name="add" size={24} color="#fff" />
          <Text style={styles.newPurchaseText}>
            {locale === 'ar' ? 'إنشاء فاتورة مشتريات' : 'New Purchase Invoice'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Quick Stats */}
      <View style={[styles.statsRow, isRtl && styles.statsRowRtl]}>
        <TouchableOpacity 
          style={[styles.statCard, { backgroundColor: theme.card }, activeFilter === 'outstanding' && { backgroundColor: theme.primaryBackground }]}
          onPress={() => setActiveFilter('outstanding')}
        >
          <Text style={[styles.statValue, { color: activeFilter === 'outstanding' ? theme.primary : theme.text }]}>{stats.outstanding}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'المعلقة' : 'Outstanding'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.statCard, { backgroundColor: theme.card }, activeFilter === 'pending' && { backgroundColor: theme.primaryBackground }]}
          onPress={() => setActiveFilter('pending')}
        >
          <Text style={[styles.statValue, { color: activeFilter === 'pending' ? theme.primary : theme.text }]}>{stats.pending}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>{t('pending', locale)}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.statCard, { backgroundColor: theme.card }, activeFilter === 'draft' && { backgroundColor: theme.primaryBackground }]}
          onPress={() => setActiveFilter('draft')}
        >
          <Text style={[styles.statValue, { color: activeFilter === 'draft' ? theme.primary : theme.text }]}>{stats.draft}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>{t('draft', locale)}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.statCard, { backgroundColor: theme.card }, activeFilter === 'completed' && { backgroundColor: theme.primaryBackground }]}
          onPress={() => setActiveFilter('completed')}
        >
          <Text style={[styles.statValue, { color: activeFilter === 'completed' ? theme.primary : theme.text }]}>{stats.completed}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>{t('completed', locale)}</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filterTabs, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TouchableOpacity
          style={[
            styles.filterTab,
            activeFilter === 'all' && [styles.activeFilterTab, { backgroundColor: theme.primary }],
            isRtl && styles.filterTabRtl,
          ]}
          onPress={() => setActiveFilter('all')}
        >
          <Text style={[styles.filterTabText, { color: activeFilter === 'all' ? '#fff' : theme.textSecondary }]}>
            {locale === 'ar' ? 'الكل' : 'All'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterTab,
            activeFilter === 'outstanding' && [styles.activeFilterTab, { backgroundColor: theme.primary }],
            isRtl && styles.filterTabRtl,
          ]}
          onPress={() => setActiveFilter('outstanding')}
        >
          <Text style={[styles.filterTabText, { color: activeFilter === 'outstanding' ? '#fff' : theme.textSecondary }]}>
            {locale === 'ar' ? 'المعلقة' : 'Outstanding'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterTab,
            activeFilter === 'pending' && [styles.activeFilterTab, { backgroundColor: theme.primary }],
            isRtl && styles.filterTabRtl,
          ]}
          onPress={() => setActiveFilter('pending')}
        >
          <Text style={[styles.filterTabText, { color: activeFilter === 'pending' ? '#fff' : theme.textSecondary }]}>
            {t('pending', locale)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Orders List */}
      <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
        {t('purchaseOrders', locale)} ({filteredOrders.length})
      </Text>
      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrder}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noData', locale)}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newPurchaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f59e0b',
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  newPurchaseButtonRtl: {
    flexDirection: 'row-reverse',
  },
  newPurchaseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  statsRowRtl: {
    flexDirection: 'row-reverse',
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    minHeight: 80,
    justifyContent: 'center',
  },
  filterTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  filterTabRtl: {
    flexDirection: 'row-reverse',
  },
  activeFilterTab: {
    backgroundColor: '#3b82f6',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  orderCardRtl: {
    flexDirection: 'row-reverse',
  },
  orderIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderContent: {
    flex: 1,
    marginLeft: 12,
  },
  orderContentRtl: {
    marginLeft: 0,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  supplierName: {
    fontSize: 13,
    marginTop: 4,
  },
  orderDate: {
    fontSize: 11,
    marginTop: 4,
  },
  orderAmount: {
    alignItems: 'flex-end',
  },
  orderAmountRtl: {
    alignItems: 'flex-start',
  },
  amountValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  amountSdg: {
    fontSize: 11,
    marginTop: 2,
  },
  textRtl: {
    textAlign: 'right',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
});
