import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface ConsignmentInvoice {
  id: string;
  number: string;
  supplier: string;
  supplierNameAr?: string;
  totalValue: number;
  invoiceDate: string;
  dueDate: string;
  status: string;
}

export default function ConsignmentInvoicesScreen() {
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  const [invoices, setInvoices] = useState<ConsignmentInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      const data = await api.accounting.supplierInvoices.listConsignment();
      
      if (data?.data) {
        setInvoices(data.data.map((inv: any) => ({
          id: inv.id,
          number: inv.invoiceNumber || 'N/A',
          supplier: inv.supplier?.name || 'Unknown',
          supplierNameAr: inv.supplier?.nameAr,
          totalValue: Number(inv.totalSdg) || 0,
          invoiceDate: inv.invoiceDate?.split('T')[0] || '',
          dueDate: inv.dueDate?.split('T')[0] || '',
          status: inv.status,
        })));
      }
    } catch (error) {
      console.error('Failed to load consignment invoices:', error);
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

  const handleCancelConsignment = (invoice: ConsignmentInvoice) => {
    Alert.alert(
      t('cancelConsignment', locale),
      locale === 'ar' 
        ? `هل تريد إلغاء فاتورة العهدة ${invoice.number}؟`
        : `Cancel consignment invoice ${invoice.number}?`,
      [
        { text: t('cancel', locale), style: 'cancel' },
        { 
          text: t('confirm', locale), 
          style: 'destructive',
          onPress: async () => {
            try {
              await api.accounting.supplierInvoices.updateStatus(invoice.id, 'CANCELLED');
              Alert.alert(t('success', locale), locale === 'ar' ? 'تم إلغاء العهدة' : 'Consignment cancelled');
              loadInvoices();
            } catch (error: any) {
              Alert.alert(t('error', locale), error?.message || 'Failed to cancel');
            }
          }
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID': return theme.success;
      case 'OUTSTANDING': return theme.warning;
      case 'CANCELLED': return theme.error;
      default: return theme.textSecondary;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      DRAFT: { en: 'Draft', ar: 'مسودة' },
      CONFIRMED: { en: 'Confirmed', ar: 'مؤكدة' },
      OUTSTANDING: { en: 'Outstanding', ar: 'قائمة' },
      SCHEDULED: { en: 'Scheduled', ar: 'مجدولة' },
      PAID: { en: 'Paid', ar: 'مدفوعة' },
      CANCELLED: { en: 'Cancelled', ar: 'ملغاة' },
    };
    return labels[status]?.[locale] || status;
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
      {/* Header Info */}
      <View style={[styles.infoCard, { backgroundColor: theme.infoBackground }]}>
        <Ionicons name="information-circle" size={24} color={theme.info} />
        <Text style={[styles.infoText, { color: theme.info }, isRtl && styles.textRtl]}>
          {locale === 'ar' 
            ? 'فواتير العهدة: فواتير من موردين أمانة (Consignors)'
            : 'Consignment Invoices: Invoices from consignor suppliers'
          }
        </Text>
      </View>

      {/* Invoice List */}
      <ScrollView
        style={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {invoices.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'لا توجد فواتير عهدة' : 'No consignment invoices'}
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
                  <Text style={[styles.consignmentDate, { color: theme.textMuted }]}>
                    {invoice.invoiceDate}
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge, 
                  { backgroundColor: getStatusColor(invoice.status) + '20' }
                ]}>
                  <Text style={[
                    styles.statusText, 
                    { color: getStatusColor(invoice.status) }
                  ]}>
                    {getStatusLabel(invoice.status)}
                  </Text>
                </View>
              </View>

              {/* Amount Details */}
              <View style={[styles.amountSection, { borderTopColor: theme.border }]}>
                <View style={[styles.amountRow, isRtl && styles.rowReverse]}>
                  <Text style={[styles.amountLabel, { color: theme.textMuted }]}>
                    {locale === 'ar' ? 'إجمالي القيمة' : 'Total Value'}
                  </Text>
                  <Text style={[styles.amountValue, { color: theme.text }]}>
                    {invoice.totalValue.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
                  </Text>
                </View>
                <View style={[styles.amountRow, isRtl && styles.rowReverse]}>
                  <Text style={[styles.amountLabel, { color: theme.textMuted }]}>
                    {locale === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}
                  </Text>
                  <Text style={[styles.amountValue, { color: theme.warning }]}>
                    {invoice.dueDate}
                  </Text>
                </View>
              </View>

              {/* Cancel Button - Only for outstanding invoices */}
              {(invoice.status === 'OUTSTANDING' || invoice.status === 'CONFIRMED') && (
                <TouchableOpacity
                  style={[styles.cancelButton, { backgroundColor: theme.errorBackground, borderColor: theme.error }]}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleCancelConsignment(invoice);
                  }}
                >
                  <Ionicons name="close-circle-outline" size={20} color={theme.error} />
                  <Text style={[styles.cancelButtonText, { color: theme.error }]}>
                    {t('cancelConsignment', locale)}
                  </Text>
                </TouchableOpacity>
              )}
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
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  listContainer: {
    flex: 1,
    padding: 16,
  },
  invoiceCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
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
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  supplierName: {
    fontSize: 14,
    marginBottom: 2,
  },
  consignmentDate: {
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  amountSection: {
    paddingTop: 16,
    borderTopWidth: 1,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  amountLabel: {
    fontSize: 14,
  },
  amountValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 1,
    gap: 8,
  },
  cancelButtonText: {
    fontSize: 15,
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
