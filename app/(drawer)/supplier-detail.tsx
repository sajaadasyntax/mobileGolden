import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface Supplier {
  id: string;
  name: string;
  nameAr?: string;
  phone?: string;
  email?: string;
  balanceSdg: number;
  isActive: boolean;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  orderDate: string;
  totalSdg: number;
  status: string;
  supplier?: { name: string; nameAr?: string };
}

type TabType = 'outstanding' | 'all' | 'pending';

export default function SupplierDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('outstanding');

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      if (!id || !user?.branchId) return;

      // Fetch supplier data
      const supplierData = await api.procurement.suppliers.getById(id);
      const supplierResult = supplierData?.result?.data?.json || supplierData?.result?.data || supplierData;
      
      setSupplier({
        id: supplierResult.id,
        name: supplierResult.name,
        nameAr: supplierResult.nameAr,
        phone: supplierResult.phone,
        email: supplierResult.email,
        balanceSdg: Number(supplierResult.balanceSdg) || 0,
        isActive: supplierResult.isActive ?? true,
      });

      // Fetch orders for this supplier
      try {
        const ordersData = await api.procurement.orders(user.branchId, 1, { supplierId: id });
        const ordersResult = ordersData?.result?.data?.data || ordersData?.data || ordersData || [];
        const allOrders = (Array.isArray(ordersResult) ? ordersResult : []).map((o: any) => ({
          id: o.id,
          poNumber: o.poNumber || `PO-${o.id?.substring(0, 8)}`,
          orderDate: o.orderDate || o.createdAt || new Date().toISOString(),
          totalSdg: Number(o.totalSdg) || 0,
          status: o.status || 'DRAFT',
          supplier: o.supplier,
        }));

        setOrders(allOrders);
      } catch (orderError) {
        console.error('Failed to load orders:', orderError);
        setOrders([]);
      }
    } catch (error) {
      console.error('Failed to load supplier details:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
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

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      DRAFT: { en: 'Draft', ar: 'مسودة' },
      APPROVED: { en: 'Approved', ar: 'معتمد' },
      PARTIALLY_RECEIVED: { en: 'Partially Received', ar: 'استلام جزئي' },
      FULLY_RECEIVED: { en: 'Fully Received', ar: 'مستلم بالكامل' },
      CLOSED: { en: 'Closed', ar: 'مغلق' },
      CANCELLED: { en: 'Cancelled', ar: 'ملغي' },
    };
    return locale === 'ar' ? labels[status]?.ar : labels[status]?.en || status;
  };

  const formatCurrency = (amount: number) => {
    return `${amount.toLocaleString()} ${locale === 'ar' ? 'ج.س' : 'SDG'}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Filter orders based on active tab
  const getFilteredOrders = () => {
    switch (activeTab) {
      case 'outstanding':
        // Orders that are not fully received, closed, or cancelled
        return orders.filter(
          (o) => !['FULLY_RECEIVED', 'CLOSED', 'CANCELLED'].includes(o.status)
        );
      case 'pending':
        // Orders that are DRAFT or APPROVED
        return orders.filter((o) => ['DRAFT', 'APPROVED'].includes(o.status));
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
                {getStatusLabel(item.status)}
              </Text>
            </View>
          </View>
          <Text style={[styles.orderDate, { color: theme.textMuted }, isRtl && styles.textRtl]}>
            {formatDate(item.orderDate)}
          </Text>
        </View>
        <View style={[styles.orderAmount, isRtl && styles.orderAmountRtl]}>
          <Text style={[styles.amountValue, { color: theme.primary }]}>
            {formatCurrency(item.totalSdg)}
          </Text>
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

  if (!supplier) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <Ionicons name="business-outline" size={48} color={theme.textSecondary} />
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          {locale === 'ar' ? 'المورد غير موجود' : 'Supplier not found'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Supplier Header Card */}
        <View style={[styles.headerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.supplierHeader, isRtl && styles.supplierHeaderRtl]}>
            <View style={[styles.supplierIcon, { backgroundColor: '#3b82f620' }]}>
              <Ionicons name="business" size={32} color="#3b82f6" />
            </View>
            <View style={[styles.supplierInfo, isRtl && styles.supplierInfoRtl]}>
              <Text style={[styles.supplierName, { color: theme.text }, isRtl && styles.textRtl]}>
                {locale === 'ar' && supplier.nameAr ? supplier.nameAr : supplier.name}
              </Text>
              {supplier.phone && (
                <View style={[styles.contactRow, isRtl && styles.contactRowRtl]}>
                  <Ionicons name="call-outline" size={14} color={theme.textSecondary} />
                  <Text style={[styles.contactText, { color: theme.textSecondary }]}>
                    {supplier.phone}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Amount Owed */}
          <View style={[styles.balanceCard, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
            <Text style={[styles.balanceLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'المبلغ المستحق' : 'Amount Owed'}
            </Text>
            <Text style={[styles.balanceAmount, { color: supplier.balanceSdg > 0 ? theme.error : theme.success }, isRtl && styles.textRtl]}>
              {formatCurrency(Math.abs(supplier.balanceSdg))}
            </Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={[styles.tabsContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'outstanding' && [styles.activeTab, { backgroundColor: theme.primary }],
              isRtl && styles.tabRtl,
            ]}
            onPress={() => setActiveTab('outstanding')}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'outstanding' ? '#fff' : theme.textSecondary },
              ]}
            >
              {locale === 'ar' ? 'المعلقة' : 'Outstanding'}
            </Text>
            {activeTab === 'outstanding' && (
              <View style={[styles.tabBadge, { backgroundColor: '#fff20' }]}>
                <Text style={[styles.tabBadgeText, { color: '#fff' }]}>
                  {orders.filter((o) => !['FULLY_RECEIVED', 'CLOSED', 'CANCELLED'].includes(o.status)).length}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'pending' && [styles.activeTab, { backgroundColor: theme.primary }],
              isRtl && styles.tabRtl,
            ]}
            onPress={() => setActiveTab('pending')}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'pending' ? '#fff' : theme.textSecondary },
              ]}
            >
              {locale === 'ar' ? 'قيد الانتظار' : 'Pending'}
            </Text>
            {activeTab === 'pending' && (
              <View style={[styles.tabBadge, { backgroundColor: '#fff20' }]}>
                <Text style={[styles.tabBadgeText, { color: '#fff' }]}>
                  {orders.filter((o) => ['DRAFT', 'APPROVED'].includes(o.status)).length}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'all' && [styles.activeTab, { backgroundColor: theme.primary }],
              isRtl && styles.tabRtl,
            ]}
            onPress={() => setActiveTab('all')}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'all' ? '#fff' : theme.textSecondary },
              ]}
            >
              {locale === 'ar' ? 'الكل' : 'All Orders'}
            </Text>
            {activeTab === 'all' && (
              <View style={[styles.tabBadge, { backgroundColor: '#fff20' }]}>
                <Text style={[styles.tabBadgeText, { color: '#fff' }]}>{orders.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Orders List */}
        <View style={styles.ordersSection}>
          <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'أوامر الشراء' : 'Purchase Orders'} ({filteredOrders.length})
          </Text>
          {filteredOrders.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'لا توجد أوامر' : 'No orders found'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredOrders}
              keyExtractor={(item) => item.id}
              renderItem={renderOrder}
              scrollEnabled={false}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  headerCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  supplierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  supplierHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  supplierIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  supplierInfo: {
    flex: 1,
    marginLeft: 12,
  },
  supplierInfoRtl: {
    marginLeft: 0,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  supplierName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  contactRowRtl: {
    flexDirection: 'row-reverse',
  },
  contactText: {
    fontSize: 14,
  },
  balanceCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '700',
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 6,
  },
  tabRtl: {
    flexDirection: 'row-reverse',
  },
  activeTab: {
    backgroundColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  ordersSection: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  listContent: {
    gap: 12,
  },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
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
    marginBottom: 4,
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
  orderDate: {
    fontSize: 12,
  },
  orderAmount: {
    alignItems: 'flex-end',
  },
  orderAmountRtl: {
    alignItems: 'flex-start',
  },
  amountValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  textRtl: {
    textAlign: 'right',
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
});
