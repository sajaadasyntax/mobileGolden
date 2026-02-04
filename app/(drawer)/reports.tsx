import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';
import PieChart from '@/components/PieChart';

const { width: screenWidth } = Dimensions.get('window');

// Chart colors palette
const CHART_COLORS = [
  '#6366f1', // Primary indigo
  '#10b981', // Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#84cc16', // Lime
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#a855f7', // Violet
  '#eab308', // Yellow
];

interface ProductData {
  id: string;
  name: string;
  nameAr: string;
  unitsSold: number;
  revenue: number;
}

interface SellerData {
  id: string;
  name: string;
  nameAr: string;
  salesCount: number;
  totalSales: number;
}

interface CustomerData {
  id: string;
  name: string;
  nameAr: string;
  purchaseCount: number;
  totalPurchases: number;
}

type ChartType = 'products' | 'sellers' | 'customers';

export default function ReportsScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedChart, setSelectedChart] = useState<ChartType | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  
  const [products, setProducts] = useState<ProductData[]>([]);
  const [sellers, setSellers] = useState<SellerData[]>([]);
  const [customers, setCustomers] = useState<CustomerData[]>([]);

  useEffect(() => {
    loadReportsData();
  }, [user?.branchId, selectedMonth]);

  const loadReportsData = async () => {
    try {
      if (!user?.branchId) return;
      
      // Load dashboard/reports data from backend
      const dashboardData = await api.accounting.reports.dashboard(user.branchId);
      
      // Transform backend data or use fallback
      if (dashboardData?.topProducts) {
        setProducts(dashboardData.topProducts.map((p: any, idx: number) => ({
          id: p.id || String(idx),
          name: p.name || p.nameEn || 'Unknown',
          nameAr: p.nameAr || p.name || 'غير معروف',
          unitsSold: Number(p.unitsSold) || 0,
          revenue: Number(p.revenue) || 0,
        })));
      }
      
      if (dashboardData?.topSellers) {
        setSellers(dashboardData.topSellers.map((s: any, idx: number) => ({
          id: s.id || String(idx),
          name: s.name || 'Unknown',
          nameAr: s.nameAr || s.name || 'غير معروف',
          salesCount: Number(s.salesCount) || 0,
          totalSales: Number(s.totalSales) || 0,
        })));
      }
      
      if (dashboardData?.topCustomers) {
        setCustomers(dashboardData.topCustomers.map((c: any, idx: number) => ({
          id: c.id || String(idx),
          name: c.name || 'Unknown',
          nameAr: c.nameAr || c.name || 'غير معروف',
          purchaseCount: Number(c.purchaseCount) || 0,
          totalPurchases: Number(c.totalPurchases) || 0,
        })));
      }
    } catch (error) {
      console.error('Failed to load reports data:', error);
      // Set empty arrays on error
      setProducts([]);
      setSellers([]);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReportsData();
    setRefreshing(false);
  };

  const getChartData = (type: ChartType) => {
    switch (type) {
      case 'products':
        return products.map((item, index) => ({
          label: isRtl ? item.nameAr : item.name,
          value: item.unitsSold,
          color: CHART_COLORS[index % CHART_COLORS.length],
        }));
      case 'sellers':
        return sellers.map((item, index) => ({
          label: isRtl ? item.nameAr : item.name,
          value: item.totalSales,
          color: CHART_COLORS[index % CHART_COLORS.length],
        }));
      case 'customers':
        return customers.map((item, index) => ({
          label: isRtl ? item.nameAr : item.name,
          value: item.totalPurchases,
          color: CHART_COLORS[index % CHART_COLORS.length],
        }));
    }
  };

  const getChartTitle = (type: ChartType) => {
    switch (type) {
      case 'products':
        return t('productsSoldChart', locale);
      case 'sellers':
        return t('sellersSalesChart', locale);
      case 'customers':
        return t('customersPurchasesChart', locale);
    }
  };

  const TopListCard = ({ 
    title, 
    data, 
    type,
    valueLabel,
    valueKey,
  }: { 
    title: string;
    data: any[];
    type: ChartType;
    valueLabel: string;
    valueKey: 'unitsSold' | 'totalSales' | 'totalPurchases';
  }) => (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <View style={[styles.cardHeader, { borderBottomColor: theme.border }, isRtl && styles.rowReverse]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
        <TouchableOpacity 
          style={[styles.chartButton, { backgroundColor: theme.primaryBackground }]}
          onPress={() => setSelectedChart(type)}
          disabled={data.length === 0}
        >
          <Ionicons name="pie-chart" size={16} color={theme.primary} />
          <Text style={[styles.chartButtonText, { color: theme.primary }]}>
            {t('viewFullChart', locale)}
          </Text>
        </TouchableOpacity>
      </View>

      {data.length > 0 ? (
        <>
          {/* Mini Chart Preview */}
          <View style={styles.miniChartContainer}>
            <PieChart
              data={getChartData(type).slice(0, 5)}
              size={120}
              innerRadius={30}
              showLabels={false}
              theme={theme}
              locale={locale}
            />
          </View>

          {/* Top 5 List */}
          <View style={styles.topList}>
            {data.slice(0, 5).map((item, index) => (
              <View 
                key={item.id} 
                style={[
                  styles.topListItem, 
                  { borderBottomColor: theme.border },
                  isRtl && styles.rowReverse
                ]}
              >
                <View style={[styles.rankBadge, { backgroundColor: CHART_COLORS[index] }]}>
                  <Text style={styles.rankText}>{index + 1}</Text>
                </View>
                <View style={[styles.itemInfo, isRtl && { alignItems: 'flex-end' }]}>
                  <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>
                    {isRtl ? item.nameAr : item.name}
                  </Text>
                  <Text style={[styles.itemSubtext, { color: theme.textSecondary }]}>
                    {valueLabel}
                  </Text>
                </View>
                <Text style={[styles.itemValue, { color: theme.primary }]}>
                  {valueKey === 'unitsSold' 
                    ? item[valueKey].toLocaleString()
                    : `$${item[valueKey].toLocaleString()}`
                  }
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.emptyCard}>
          <Ionicons name="bar-chart-outline" size={40} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {locale === 'ar' ? 'لا توجد بيانات متاحة' : 'No data available'}
          </Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Month Selector */}
      <View style={[styles.monthSelector, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Ionicons name="calendar" size={20} color={theme.primary} />
        <Text style={[styles.monthLabel, { color: theme.text }]}>
          {new Date(selectedMonth + '-01').toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-US', { 
            year: 'numeric', 
            month: 'long' 
          })}
        </Text>
        <Ionicons name="chevron-down" size={20} color={theme.textSecondary} />
      </View>

      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {/* Top Products Card */}
        <TopListCard
          title={t('top5Products', locale)}
          data={products}
          type="products"
          valueLabel={t('unitsSold', locale)}
          valueKey="unitsSold"
        />

        {/* Top Sellers Card */}
        <TopListCard
          title={t('top5Sellers', locale)}
          data={sellers}
          type="sellers"
          valueLabel={t('salesAmount', locale)}
          valueKey="totalSales"
        />

        {/* Top Customers Card */}
        <TopListCard
          title={t('top5Customers', locale)}
          data={customers}
          type="customers"
          valueLabel={t('purchasesAmount', locale)}
          valueKey="totalPurchases"
        />
      </ScrollView>

      {/* Full Chart Modal */}
      <Modal visible={selectedChart !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {selectedChart && getChartTitle(selectedChart)}
              </Text>
              <TouchableOpacity onPress={() => setSelectedChart(null)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {selectedChart && getChartData(selectedChart).length > 0 && (
                <View style={styles.fullChartContainer}>
                  <PieChart
                    data={getChartData(selectedChart)}
                    size={screenWidth - 80}
                    innerRadius={(screenWidth - 80) / 4}
                    showLabels={true}
                    theme={theme}
                    locale={locale}
                  />
                </View>
              )}

              {/* Full List */}
              {selectedChart && (
                <View style={styles.fullList}>
                  <Text style={[styles.fullListTitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                    {locale === 'ar' ? 'القائمة الكاملة' : 'Full List'}
                  </Text>
                  {(selectedChart === 'products' ? products : 
                    selectedChart === 'sellers' ? sellers : 
                    customers
                  ).map((item: any, index) => (
                    <View 
                      key={item.id} 
                      style={[
                        styles.fullListItem, 
                        { backgroundColor: theme.card, borderColor: theme.cardBorder },
                        isRtl && styles.rowReverse
                      ]}
                    >
                      <View style={[styles.rankBadge, { backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }]}>
                        <Text style={styles.rankText}>{index + 1}</Text>
                      </View>
                      <View style={[styles.itemInfo, isRtl && { alignItems: 'flex-end' }]}>
                        <Text style={[styles.itemName, { color: theme.text }]}>
                          {isRtl ? item.nameAr : item.name}
                        </Text>
                      </View>
                      <Text style={[styles.itemValue, { color: theme.primary }]}>
                        {selectedChart === 'products' 
                          ? item.unitsSold.toLocaleString()
                          : `$${(item.totalSales || item.totalPurchases).toLocaleString()}`
                        }
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
    borderBottomWidth: 1,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  chartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  chartButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  miniChartContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
  },
  topList: {
    padding: 8,
  },
  topListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
  },
  itemSubtext: {
    fontSize: 11,
    marginTop: 2,
  },
  itemValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalScroll: {
    padding: 16,
  },
  fullChartContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  fullList: {
    marginTop: 24,
    paddingBottom: 40,
  },
  fullListTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  fullListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  textRtl: {
    textAlign: 'right',
  },
});
