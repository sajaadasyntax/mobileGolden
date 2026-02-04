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

interface IssuedInvoice {
  id: string;
  number: string;
  supplier: string;
  supplierNameAr?: string;
  amount: number;
  invoiceDate: string;
  dueDate: string;
  status: string;
}

export default function IssuedInvoicesScreen() {
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  const [invoices, setInvoices] = useState<IssuedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      const data = await api.accounting.supplierInvoices.listIssued();
      
      if (data?.data) {
        setInvoices(data.data.map((inv: any) => ({
          id: inv.id,
          number: inv.invoiceNumber || 'N/A',
          supplier: inv.supplier?.name || 'Unknown',
          supplierNameAr: inv.supplier?.nameAr,
          amount: Number(inv.totalSdg) || 0,
          invoiceDate: inv.invoiceDate?.split('T')[0] || inv.createdAt?.split('T')[0] || '',
          dueDate: inv.dueDate?.split('T')[0] || '',
          status: inv.status || 'CONFIRMED',
        })));
      }
    } catch (error) {
      console.error('Failed to load issued invoices:', error);
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

  const totalIssued = invoices.reduce((sum, inv) => sum + inv.amount, 0);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Summary Header */}
      <View style={[styles.summaryCard, { backgroundColor: theme.infoBackground || theme.primaryBackground }]}>
        <Ionicons name="document-text" size={28} color={theme.info || theme.primary} />
        <View style={[styles.summaryContent, isRtl && { marginLeft: 0, marginRight: 16 }]}>
          <Text style={[styles.summaryLabel, { color: theme.info || theme.primary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'فواتير صادرة' : 'Issued Invoices'}
          </Text>
          <Text style={[styles.summaryAmount, { color: theme.info || theme.primary }]}>
            {totalIssued.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
          </Text>
          <Text style={[styles.summarySubtext, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {invoices.length} {locale === 'ar' ? 'فاتورة في انتظار الاستلام' : 'awaiting goods receipt'}
          </Text>
        </View>
      </View>

      {/* Invoice List */}
      <ScrollView
        style={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
          {locale === 'ar' ? 'في انتظار استلام البضاعة' : 'Awaiting Goods Receipt'}
        </Text>
        
        {invoices.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'لا توجد فواتير جديدة' : 'No new invoices'}
            </Text>
          </View>
        ) : (
          invoices.map((invoice) => (
            <TouchableOpacity
              key={invoice.id}
              style={[styles.invoiceCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
              onPress={() => router.push({ pathname: '/supplier-invoice-detail', params: { id: invoice.id } })}
            >
              <View style={[styles.invoiceHeader, isRtl && styles.rowReverse]}>
                <View style={[styles.invoiceInfo, isRtl && { alignItems: 'flex-end' }]}>
                  <Text style={[styles.invoiceNumber, { color: theme.text }, isRtl && styles.textRtl]}>
                    {invoice.number}
                  </Text>
                  <Text style={[styles.supplierName, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                    {isRtl ? (invoice.supplierNameAr || invoice.supplier) : invoice.supplier}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: theme.infoBackground || theme.primaryBackground }]}>
                  <Ionicons name="time" size={16} color={theme.info || theme.primary} />
                  <Text style={[styles.statusText, { color: theme.info || theme.primary }]}>
                    {locale === 'ar' ? 'جديدة' : 'New'}
                  </Text>
                </View>
              </View>
              
              <View style={[styles.invoiceFooter, { borderTopColor: theme.border }, isRtl && styles.rowReverse]}>
                <View style={isRtl ? { alignItems: 'flex-end' } : {}}>
                  <Text style={[styles.dateLabel, { color: theme.textMuted }]}>
                    {locale === 'ar' ? 'تاريخ الفاتورة' : 'Invoice Date'}
                  </Text>
                  <Text style={[styles.dateValue, { color: theme.text }]}>
                    {invoice.invoiceDate}
                  </Text>
                  <Text style={[styles.paymentMethod, { color: theme.textSecondary }]}>
                    {locale === 'ar' ? 'الاستحقاق: ' : 'Due: '}{invoice.dueDate}
                  </Text>
                </View>
                <Text style={[styles.invoiceAmount, { color: theme.info || theme.primary }]}>
                  {invoice.amount.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
                </Text>
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
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    margin: 16,
    borderRadius: 16,
  },
  summaryContent: {
    marginLeft: 16,
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: '700',
    marginVertical: 4,
  },
  summarySubtext: {
    fontSize: 13,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
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
    marginBottom: 16,
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  invoiceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
  },
  dateLabel: {
    fontSize: 12,
  },
  dateValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  paymentMethod: {
    fontSize: 12,
    marginTop: 2,
  },
  invoiceAmount: {
    fontSize: 22,
    fontWeight: '700',
  },
  textRtl: {
    textAlign: 'right',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
});
