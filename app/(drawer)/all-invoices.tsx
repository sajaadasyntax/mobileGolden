import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface Invoice {
  id: string;
  invoiceNumber: string;
  supplier?: { name: string; nameAr?: string };
  totalSdg: number;
  status: string;
  invoiceDate: string;
}

export default function AllInvoicesScreen() {
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    loadInvoices();
  }, [user?.branchId]);

  const loadInvoices = async () => {
    try {
      if (!user?.branchId) return;
      
      // Use accounting endpoint which lists all supplier invoices
      const result = await api.accounting.supplierInvoices.list();
      
      // Handle different response structures
      const rawData = result?.data || result || [];
      const invoicesData = Array.isArray(rawData) ? rawData : [];
      
      // Map to expected format
      setInvoices(invoicesData.map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber || 'N/A',
        supplier: inv.supplier || null,
        totalSdg: Number(inv.totalSdg) || 0,
        status: inv.status || 'DRAFT',
        invoiceDate: inv.invoiceDate || inv.createdAt || new Date().toISOString(),
      })));
    } catch (error) {
      console.error('Failed to load invoices:', error);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInvoices();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'DRAFT': return theme.textMuted;
      case 'CONFIRMED': return theme.info; // Issued - invoice created
      case 'OUTSTANDING': return theme.warning; // Goods received, awaiting payment
      case 'SCHEDULED': return theme.primary; // Payment scheduled
      case 'PAID': return theme.success; // Completed - paid
      case 'CANCELLED': return theme.error;
      default: return theme.textSecondary;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      DRAFT: { en: 'Draft', ar: 'مسودة' },
      CONFIRMED: { en: 'Issued', ar: 'صادرة' }, // Created = Issued
      OUTSTANDING: { en: 'Outstanding', ar: 'قائمة' }, // Goods received, awaiting payment
      SCHEDULED: { en: 'Scheduled', ar: 'مجدولة' },
      PAID: { en: 'Completed', ar: 'مكتملة' }, // Paid = Completed
      CANCELLED: { en: 'Cancelled', ar: 'ملغاة' },
    };
    return labels[status?.toUpperCase()]?.[locale] || status;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US').format(amount);
  };

  const filters = [
    { key: null, label: t('all', locale) },
    { key: 'DRAFT', label: locale === 'ar' ? 'مسودة' : 'Draft' },
    { key: 'CONFIRMED', label: locale === 'ar' ? 'صادرة' : 'Issued' },
    { key: 'OUTSTANDING', label: locale === 'ar' ? 'قائمة' : 'Outstanding' },
    { key: 'SCHEDULED', label: locale === 'ar' ? 'مجدولة' : 'Scheduled' },
    { key: 'PAID', label: locale === 'ar' ? 'مكتملة' : 'Completed' },
  ];

  const filteredInvoices = filter 
    ? invoices.filter(inv => inv.status?.toUpperCase() === filter)
    : invoices;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Filter Tabs */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={[styles.filterContainer, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}
        contentContainerStyle={styles.filterContent}
      >
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key || 'all'}
            style={[
              styles.filterTab,
              { backgroundColor: filter === f.key ? theme.primary : theme.backgroundTertiary },
            ]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[
              styles.filterText,
              { color: filter === f.key ? '#fff' : theme.textSecondary },
            ]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Invoice List */}
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {filteredInvoices.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noData', locale)}</Text>
          </View>
        ) : (
          filteredInvoices.map((invoice) => (
            <TouchableOpacity
              key={invoice.id}
              style={[styles.invoiceCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
              onPress={() => router.push({ pathname: '/supplier-invoice-detail', params: { id: invoice.id } })}
            >
              <View style={[styles.invoiceHeader, isRtl && styles.rowReverse]}>
                <View style={[styles.invoiceInfo, isRtl && { alignItems: 'flex-end' }]}>
                  <Text style={[styles.invoiceNumber, { color: theme.text }, isRtl && styles.textRtl]}>
                    {invoice.invoiceNumber}
                  </Text>
                  <Text style={[styles.supplierName, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                    {locale === 'ar' 
                      ? invoice.supplier?.nameAr || invoice.supplier?.name || 'غير معروف'
                      : invoice.supplier?.name || 'Unknown'
                    }
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: `${getStatusColor(invoice.status)}20` }
                ]}>
                  <Text style={[styles.statusText, { color: getStatusColor(invoice.status) }]}>
                    {getStatusLabel(invoice.status)}
                  </Text>
                </View>
              </View>
              
              <View style={[styles.invoiceFooter, { borderTopColor: theme.border }, isRtl && styles.rowReverse]}>
                <Text style={[styles.invoiceDate, { color: theme.textMuted }]}>
                  {formatDate(invoice.invoiceDate)}
                </Text>
                <View style={[styles.amountContainer, isRtl && styles.rowReverse]}>
                  <Text style={[styles.invoiceAmount, { color: theme.primary }]}>
                    {formatAmount(Number(invoice.totalSdg))}
                  </Text>
                  <Text style={[styles.currencyLabel, { color: theme.textSecondary }]}>
                    {locale === 'ar' ? 'ج.س' : 'SDG'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
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
  filterContainer: {
    maxHeight: 60,
    borderBottomWidth: 1,
  },
  filterContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
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
  invoiceCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  invoiceInfo: {
    flex: 1,
  },
  invoiceNumber: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  supplierName: {
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  invoiceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  invoiceDate: {
    fontSize: 13,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  invoiceAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  currencyLabel: {
    fontSize: 12,
  },
  textRtl: {
    textAlign: 'right',
  },
});
