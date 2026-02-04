import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface DeferredInvoice {
  id: string;
  number: string;
  supplier: string;
  supplierNameAr?: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string;
  confirmedDate: string;
}

export default function DeferredInvoicesScreen() {
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  const [invoices, setInvoices] = useState<DeferredInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      const data = await api.accounting.supplierInvoices.listDeferred();
      
      if (data?.data) {
        setInvoices(data.data.map((inv: any) => ({
          id: inv.id,
          number: inv.invoiceNumber || 'N/A',
          supplier: inv.supplier?.name || 'Unknown',
          supplierNameAr: inv.supplier?.nameAr,
          totalAmount: Number(inv.totalSdg) || 0,
          paidAmount: Number(inv.paidSdg) || 0,
          remainingAmount: Number(inv.remainingSdg) || (Number(inv.totalSdg) - Number(inv.paidSdg)) || 0,
          dueDate: inv.dueDate?.split('T')[0] || '',
          confirmedDate: inv.confirmedDate?.split('T')[0] || inv.invoiceDate?.split('T')[0] || '',
        })));
      }
    } catch (error) {
      console.error('Failed to load deferred invoices:', error);
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

  const handlePay = (invoice: DeferredInvoice) => {
    Alert.alert(
      locale === 'ar' ? 'تسجيل دفعة' : 'Record Payment',
      locale === 'ar' 
        ? `هل تريد تسجيل دفعة للفاتورة ${invoice.number}؟\nالمتبقي: ${invoice.remainingAmount.toLocaleString()} ج.س`
        : `Record payment for invoice ${invoice.number}?\nRemaining: ${invoice.remainingAmount.toLocaleString()} SDG`,
      [
        { text: t('cancel', locale), style: 'cancel' },
        { 
          text: locale === 'ar' ? 'دفع كامل' : 'Pay Full',
          onPress: async () => {
            try {
              await api.accounting.supplierInvoices.updateStatus(invoice.id, 'PAID');
              Alert.alert(t('success', locale), locale === 'ar' ? 'تم تسجيل الدفع' : 'Payment recorded');
              loadInvoices();
            } catch (error: any) {
              Alert.alert(t('error', locale), error?.message || 'Failed to record payment');
            }
          }
        },
      ]
    );
  };

  const totalDeferred = invoices.reduce((sum, inv) => sum + inv.remainingAmount, 0);

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
      <View style={[styles.summaryCard, { backgroundColor: theme.warningBackground }]}>
        <Ionicons name="time" size={28} color={theme.warning} />
        <View style={[styles.summaryContent, isRtl && { marginLeft: 0, marginRight: 16 }]}>
          <Text style={[styles.summaryLabel, { color: theme.warning }, isRtl && styles.textRtl]}>
            {t('deferredInvoices', locale)}
          </Text>
          <Text style={[styles.summaryAmount, { color: theme.warning }]}>
            {totalDeferred.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
          </Text>
          <Text style={[styles.summarySubtext, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {invoices.length} {locale === 'ar' ? 'فاتورة آجلة' : 'deferred invoices'}
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
          {locale === 'ar' ? 'الفواتير المؤكدة - في انتظار الدفع' : 'Confirmed - Awaiting Payment'}
        </Text>
        
        {invoices.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color={theme.success} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'لا توجد فواتير آجلة' : 'No deferred invoices'}
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
                <View style={[styles.statusBadge, { backgroundColor: theme.warningBackground }]}>
                  <Text style={[styles.statusText, { color: theme.warning }]}>
                    {t('invoiceDeferred', locale)}
                  </Text>
                </View>
              </View>
              
              <View style={[styles.amountDetails, { borderTopColor: theme.border }]}>
                <View style={[styles.amountRow, isRtl && styles.rowReverse]}>
                  <Text style={[styles.amountLabel, { color: theme.textMuted }]}>
                    {locale === 'ar' ? 'إجمالي الفاتورة' : 'Total Amount'}
                  </Text>
                  <Text style={[styles.amountValue, { color: theme.text }]}>
                    {invoice.totalAmount.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
                  </Text>
                </View>
                <View style={[styles.amountRow, isRtl && styles.rowReverse]}>
                  <Text style={[styles.amountLabel, { color: theme.textMuted }]}>
                    {locale === 'ar' ? 'المدفوع' : 'Paid'}
                  </Text>
                  <Text style={[styles.amountValue, { color: theme.success }]}>
                    {invoice.paidAmount.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
                  </Text>
                </View>
                <View style={[styles.amountRow, styles.remainingRow, { borderTopColor: theme.border }, isRtl && styles.rowReverse]}>
                  <Text style={[styles.amountLabel, { color: theme.warning, fontWeight: '600' }]}>
                    {locale === 'ar' ? 'المتبقي' : 'Remaining'}
                  </Text>
                  <Text style={[styles.remainingAmount, { color: theme.warning }]}>
                    {invoice.remainingAmount.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
                  </Text>
                </View>
              </View>

              <View style={[styles.invoiceFooter, { borderTopColor: theme.border }, isRtl && styles.rowReverse]}>
                <View style={styles.dateInfo}>
                  <Text style={[styles.dateLabel, { color: theme.textMuted }]}>
                    {locale === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}
                  </Text>
                  <Text style={[styles.dateValue, { color: theme.text }]}>
                    {invoice.dueDate}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={[styles.payButton, { backgroundColor: theme.primary }]}
                  onPress={() => handlePay(invoice)}
                >
                  <Text style={styles.payButtonText}>
                    {locale === 'ar' ? 'دفع' : 'Pay'}
                  </Text>
                </TouchableOpacity>
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
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  amountDetails: {
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  remainingRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  amountLabel: {
    fontSize: 14,
  },
  amountValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  remainingAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  invoiceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  dateInfo: {},
  dateLabel: {
    fontSize: 12,
  },
  dateValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  payButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  payButtonText: {
    color: '#fff',
    fontWeight: '600',
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
