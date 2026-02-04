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
import { api } from '@/lib/api';

interface SalesOrder {
  id: string;
  orderNumber: string;
  orderDate: string;
  totalUsd: number;
  totalSdg: number;
  status: string;
  customer?: { name: string; nameAr?: string };
}

export default function WarehouseSalesOrdersScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const isRtl = locale === 'ar';

  useEffect(() => {
    loadOrders();
  }, [user?.branchId, filter]);

  const loadOrders = async () => {
    try {
      if (user?.branchId) {
        const result = await api.sales.salesOrders.list(user.branchId, {
          status: filter === 'pending' ? 'CONFIRMED' : undefined,
        });
        const rawData = result?.data || result || [];
        
        // Filter orders ready for delivery
        const filteredOrders = (Array.isArray(rawData) ? rawData : [])
          .filter((o: any) => filter === 'all' || ['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(o.status))
          .map((o: any) => ({
            id: o.id,
            orderNumber: o.orderNumber || `SO-${o.id?.substring(0, 8)}`,
            orderDate: o.orderDate || o.createdAt || new Date().toISOString(),
            totalUsd: Number(o.totalUsd) || 0,
            totalSdg: Number(o.totalSdg) || 0,
            status: o.status,
            customer: o.customer,
          }));
        
        setOrders(filteredOrders);
      }
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONFIRMED': return theme.primary;
      case 'PARTIALLY_DELIVERED': return theme.warning;
      case 'FULLY_DELIVERED': return theme.success;
      default: return theme.textMuted;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      CONFIRMED: { en: 'Ready to Deliver', ar: 'جاهز للتسليم' },
      PARTIALLY_DELIVERED: { en: 'Partially Delivered', ar: 'تسليم جزئي' },
      FULLY_DELIVERED: { en: 'Delivered', ar: 'تم التسليم' },
    };
    return locale === 'ar' ? labels[status]?.ar : labels[status]?.en || status;
  };

  const pendingCount = orders.filter(o => ['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(o.status)).length;

  const renderOrder = ({ item }: { item: SalesOrder }) => {
    const canDeliver = ['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(item.status);
    
    return (
      <TouchableOpacity
        style={[styles.orderCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
        onPress={() => router.push({ pathname: '/sales-order-detail', params: { id: item.id } })}
      >
        <View style={[styles.orderHeader, isRtl && styles.rowReverse]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.orderNumber, { color: theme.text }, isRtl && styles.textRtl]}>
              {item.orderNumber}
            </Text>
            <Text style={[styles.customerName, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {isRtl ? (item.customer?.nameAr || item.customer?.name) : item.customer?.name || '-'}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getStatusLabel(item.status)}
            </Text>
          </View>
        </View>

        <View style={[styles.orderFooter, { borderTopColor: theme.border }, isRtl && styles.rowReverse]}>
          <View style={styles.orderInfo}>
            <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
              {locale === 'ar' ? 'تاريخ الطلب' : 'Order Date'}
            </Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {item.orderDate?.split('T')[0]}
            </Text>
          </View>
          <View style={[styles.orderInfo, { alignItems: 'flex-end' }]}>
            <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
              {locale === 'ar' ? 'الإجمالي' : 'Total'}
            </Text>
            <Text style={[styles.totalValue, { color: theme.primary }]}>
              ${item.totalUsd.toLocaleString()}
            </Text>
          </View>
        </View>

        {canDeliver && (
          <TouchableOpacity
            style={[styles.deliverButton, { backgroundColor: theme.primary }]}
            onPress={() => router.push({ pathname: '/sales-order-detail', params: { id: item.id } })}
          >
            <Ionicons name="send-outline" size={18} color="#fff" />
            <Text style={styles.deliverButtonText}>
              {locale === 'ar' ? 'تسليم الطلب' : 'Deliver Order'}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header Stats */}
      <View style={[styles.statsCard, { backgroundColor: theme.primaryBackground }]}>
        <Ionicons name="send" size={28} color={theme.primary} />
        <View style={[styles.statsContent, isRtl && { marginLeft: 0, marginRight: 16 }]}>
          <Text style={[styles.statsLabel, { color: theme.primary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'طلبات في انتظار التسليم' : 'Orders Pending Delivery'}
          </Text>
          <Text style={[styles.statsValue, { color: theme.primary }]}>
            {pendingCount}
          </Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filterTabs, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'pending' && { backgroundColor: theme.primary }
          ]}
          onPress={() => setFilter('pending')}
        >
          <Text style={[
            styles.filterTabText,
            { color: filter === 'pending' ? '#fff' : theme.text }
          ]}>
            {locale === 'ar' ? 'في الانتظار' : 'Pending'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'all' && { backgroundColor: theme.primary }
          ]}
          onPress={() => setFilter('all')}
        >
          <Text style={[
            styles.filterTabText,
            { color: filter === 'all' ? '#fff' : theme.text }
          ]}>
            {locale === 'ar' ? 'الكل' : 'All'}
          </Text>
        </TouchableOpacity>
      </View>

      {orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-done-circle-outline" size={64} color={theme.success} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {filter === 'pending'
              ? (locale === 'ar' ? 'لا توجد طلبات في انتظار التسليم' : 'No orders pending delivery')
              : (locale === 'ar' ? 'لا توجد طلبات' : 'No orders')
            }
          </Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    margin: 16,
    borderRadius: 16,
  },
  statsContent: {
    marginLeft: 16,
    flex: 1,
  },
  statsLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  statsValue: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 4,
  },
  filterTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  orderCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  customerName: {
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    marginBottom: 12,
  },
  orderInfo: {},
  infoLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  deliverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  deliverButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  textRtl: {
    textAlign: 'right',
  },
});
