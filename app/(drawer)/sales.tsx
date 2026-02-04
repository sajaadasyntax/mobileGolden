import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalSdg: number;
  totalUsd: number;
  status: string;
  invoiceType: string;
  customer?: { name: string };
}

export default function SalesScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const isRtl = locale === 'ar';
  
  // Check if user can void invoices
  const canVoidInvoice = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const loadInvoices = async () => {
    try {
      if (user?.branchId) {
        const result = await api.sales.invoices(user.branchId);
        setInvoices(result?.result?.data?.data || result?.data || []);
      }
    } catch (error) {
      console.error('Failed to load invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInvoices();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return theme.success;
      case 'CONFIRMED':
      case 'ISSUED':
        return theme.primary;
      case 'DRAFT':
        return theme.textSecondary;
      case 'CANCELLED':
        return theme.error;
      default:
        return theme.warning;
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return `${amount.toLocaleString()} ${currency === 'USD' ? t('usd', locale) : t('sdg', locale)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const handleInvoicePress = (invoice: SalesInvoice) => {
    setSelectedInvoice(invoice);
    setShowActionModal(true);
  };

  const handleVoidInvoice = async () => {
    if (!selectedInvoice) return;
    
    Alert.alert(
      locale === 'ar' ? 'إلغاء الفاتورة' : 'Void Invoice',
      locale === 'ar' 
        ? `هل أنت متأكد من إلغاء الفاتورة ${selectedInvoice.invoiceNumber}؟`
        : `Are you sure you want to void invoice ${selectedInvoice.invoiceNumber}?`,
      [
        { text: t('cancel', locale), style: 'cancel' },
        {
          text: locale === 'ar' ? 'إلغاء الفاتورة' : 'Void Invoice',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.sales.voidInvoice(selectedInvoice.id);
              Alert.alert(
                t('success', locale),
                locale === 'ar' ? 'تم إلغاء الفاتورة بنجاح' : 'Invoice voided successfully'
              );
              setShowActionModal(false);
              setSelectedInvoice(null);
              loadInvoices();
            } catch (error: any) {
              Alert.alert(
                t('error', locale),
                error?.message || (locale === 'ar' ? 'فشل إلغاء الفاتورة' : 'Failed to void invoice')
              );
            }
          },
        },
      ]
    );
  };

  const renderInvoice = ({ item }: { item: SalesInvoice }) => {
    const statusColor = getStatusColor(item.status);
    const isVoided = item.status === 'CANCELLED' || item.status === 'VOIDED';
    
    return (
      <TouchableOpacity 
        style={[
          styles.invoiceCard, 
          { backgroundColor: theme.card }, 
          isRtl && styles.invoiceCardRtl,
          isVoided && styles.voidedInvoice,
        ]}
        onPress={() => handleInvoicePress(item)}
        disabled={isVoided}
      >
        <View style={[
          styles.invoiceIcon, 
          { backgroundColor: isVoided ? theme.errorBackground : theme.primaryBackground }
        ]}>
          <Ionicons 
            name={isVoided ? "close-circle" : "receipt"} 
            size={24} 
            color={isVoided ? theme.error : theme.primary} 
          />
        </View>
        <View style={[styles.invoiceContent, isRtl && styles.invoiceContentRtl]}>
          <View style={[styles.invoiceHeader, isRtl && styles.invoiceHeaderRtl]}>
            <Text style={[
              styles.invoiceNumber, 
              { color: isVoided ? theme.textMuted : theme.text },
              isVoided && styles.strikethrough,
            ]}>
              {item.invoiceNumber}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {t(item.status.toLowerCase() as any, locale)}
              </Text>
            </View>
          </View>
          <Text style={[styles.customerName, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {item.customer?.name || (locale === 'ar' ? 'عميل نقدي' : 'Walk-in')}
          </Text>
          <View style={[styles.invoiceMeta, isRtl && styles.invoiceMetaRtl]}>
            <Text style={[styles.invoiceDate, { color: theme.textMuted }]}>{formatDate(item.invoiceDate)}</Text>
            <Text style={[styles.invoiceType, { color: theme.primary }]}>
              {item.invoiceType === 'WHOLESALE' ? t('wholesale', locale) : t('retail', locale)}
            </Text>
          </View>
        </View>
        <View style={[styles.invoiceAmount, isRtl && styles.invoiceAmountRtl]}>
          <Text style={[
            styles.amountValue, 
            { color: isVoided ? theme.textMuted : theme.success },
            isVoided && styles.strikethrough,
          ]}>
            {formatCurrency(Number(item.totalUsd), 'USD')}
          </Text>
          <Text style={[styles.amountSdg, { color: theme.textSecondary }]}>
            {formatCurrency(Number(item.totalSdg), 'SDG')}
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* New Sale Button */}
      <TouchableOpacity 
        style={[styles.newSaleButton, isRtl && styles.newSaleButtonRtl]}
        onPress={() => router.push('/create-sales-invoice')}
      >
        <Ionicons name="add" size={24} color="#fff" />
        <Text style={styles.newSaleText}>{t('newSale', locale)}</Text>
      </TouchableOpacity>

      {/* Invoices List */}
      <FlatList
        data={invoices}
        keyExtractor={(item) => item.id}
        renderItem={renderInvoice}
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
            <Ionicons name="receipt-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noData', locale)}</Text>
            <Text style={[styles.emptySubtext, { color: theme.textMuted }]}>
              {locale === 'ar' ? 'ابدأ ببيع جديد' : 'Start with a new sale'}
            </Text>
          </View>
        }
      />

      {/* Invoice Action Modal */}
      <Modal
        visible={showActionModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowActionModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowActionModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {selectedInvoice?.invoiceNumber}
              </Text>
              <TouchableOpacity onPress={() => setShowActionModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            
            {/* Invoice Details */}
            <View style={[styles.modalDetails, { borderColor: theme.border }]}>
              <View style={[styles.detailRow, isRtl && styles.detailRowRtl]}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                  {locale === 'ar' ? 'العميل' : 'Customer'}:
                </Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                  {selectedInvoice?.customer?.name || (locale === 'ar' ? 'عميل نقدي' : 'Walk-in')}
                </Text>
              </View>
              <View style={[styles.detailRow, isRtl && styles.detailRowRtl]}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                  {locale === 'ar' ? 'المبلغ' : 'Amount'}:
                </Text>
                <Text style={[styles.detailValue, { color: theme.success }]}>
                  ${Number(selectedInvoice?.totalUsd || 0).toFixed(2)}
                </Text>
              </View>
              <View style={[styles.detailRow, isRtl && styles.detailRowRtl]}>
                <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                  {locale === 'ar' ? 'الحالة' : 'Status'}:
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedInvoice?.status || '') + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(selectedInvoice?.status || '') }]}>
                    {selectedInvoice?.status}
                  </Text>
                </View>
              </View>
            </View>
            
            {/* Action Buttons */}
            <View style={styles.modalActions}>
              {/* View/Print Invoice */}
              <TouchableOpacity 
                style={[styles.actionButton, { backgroundColor: theme.primaryBackground }]}
                onPress={() => {
                  setShowActionModal(false);
                  // TODO: Navigate to invoice detail/print screen
                }}
              >
                <Ionicons name="eye-outline" size={20} color={theme.primary} />
                <Text style={[styles.actionButtonText, { color: theme.primary }]}>
                  {locale === 'ar' ? 'عرض الفاتورة' : 'View Invoice'}
                </Text>
              </TouchableOpacity>
              
              {/* Void Invoice - Only for admin/manager and non-cancelled invoices */}
              {canVoidInvoice && selectedInvoice?.status !== 'CANCELLED' && selectedInvoice?.status !== 'VOIDED' && (
                <TouchableOpacity 
                  style={[styles.actionButton, { backgroundColor: theme.errorBackground }]}
                  onPress={handleVoidInvoice}
                >
                  <Ionicons name="close-circle-outline" size={20} color={theme.error} />
                  <Text style={[styles.actionButtonText, { color: theme.error }]}>
                    {locale === 'ar' ? 'إلغاء الفاتورة' : 'Void Invoice'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
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
  newSaleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  newSaleButtonRtl: {
    flexDirection: 'row-reverse',
  },
  newSaleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  invoiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  invoiceCardRtl: {
    flexDirection: 'row-reverse',
  },
  invoiceIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  invoiceContent: {
    flex: 1,
    marginLeft: 12,
  },
  invoiceContentRtl: {
    marginLeft: 0,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  invoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  invoiceHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  invoiceNumber: {
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
  customerName: {
    fontSize: 13,
    marginTop: 4,
  },
  invoiceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  invoiceMetaRtl: {
    flexDirection: 'row-reverse',
  },
  invoiceDate: {
    fontSize: 11,
  },
  invoiceType: {
    fontSize: 11,
  },
  invoiceAmount: {
    alignItems: 'flex-end',
  },
  invoiceAmountRtl: {
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
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
  },
  voidedInvoice: {
    opacity: 0.6,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  modalDetails: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 16,
    marginBottom: 20,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailRowRtl: {
    flexDirection: 'row-reverse',
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalActions: {
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
