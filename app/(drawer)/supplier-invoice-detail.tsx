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
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  supplier: {
    id: string;
    name: string;
    nameAr?: string;
    isConsignor: boolean;
  };
  purchaseOrder?: {
    id: string;
    poNumber: string;
    status: string;
    lines: Array<{
      id: string;
      item: { nameEn: string; nameAr: string; sku: string };
      qty: number;
      unitPriceSdg: number;
      totalSdg: number;
    }>;
  };
  totalSdg: number;
  paidAmountSdg?: number;
  invoiceDate: string;
  dueDate: string;
  status: string;
  paymentMethod?: string;
  transactionNumber?: string;
  paidDate?: string;
  notes?: string;
}

export default function SupplierInvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  const isAdmin = ['ADMIN', 'MANAGER'].includes(user?.role || '');

  const [invoice, setInvoice] = useState<SupplierInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER'>('CASH');
  const [transactionNumber, setTransactionNumber] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');

  useEffect(() => {
    if (id) loadInvoice();
  }, [id]);

  const loadInvoice = async () => {
    if (!id) return;
    try {
      const data = await api.accounting.supplierInvoices.getById(id);
      setInvoice({
        ...data,
        totalSdg: Number(data.totalSdg) || 0,
        paidAmountSdg: Number(data.paidAmountSdg) || 0,
      });
      setPaymentAmount(String(Number(data.totalSdg) - (Number(data.paidAmountSdg) || 0)));
    } catch (error) {
      console.error('Failed to load invoice:', error);
      Alert.alert(t('error', locale), locale === 'ar' ? 'فشل في تحميل الفاتورة' : 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInvoice();
    setRefreshing(false);
  };

  const handlePayInvoice = async () => {
    if (!invoice || !isAdmin) return;

    // Validate bank transfer requirements
    if (paymentMethod === 'BANK_TRANSFER' && !transactionNumber.trim()) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'يرجى إدخال رقم العملية' : 'Please enter transaction number');
      return;
    }

    const amount = parseFloat(paymentAmount) || 0;
    if (amount <= 0) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'يرجى إدخال مبلغ صحيح' : 'Please enter a valid amount');
      return;
    }

    Alert.alert(
      locale === 'ar' ? 'تأكيد الدفع' : 'Confirm Payment',
      locale === 'ar'
        ? `هل تريد تسجيل دفع ${amount.toLocaleString()} ج.س للفاتورة ${invoice.invoiceNumber}؟`
        : `Record payment of ${amount.toLocaleString()} SDG for invoice ${invoice.invoiceNumber}?`,
      [
        { text: t('cancel', locale), style: 'cancel' },
        {
          text: t('confirm', locale),
          onPress: async () => {
            setProcessing(true);
            try {
              await api.accounting.supplierInvoices.payInvoice({
                id: invoice.id,
                paymentMethod,
                transactionNumber: transactionNumber || undefined,
                paidAmountSdg: amount,
                // For now, skip receipt image - can be added later
                receiptImageUrl: paymentMethod === 'BANK_TRANSFER' ? 'pending' : undefined,
              });
              Alert.alert(t('success', locale), locale === 'ar' ? 'تم تسجيل الدفع بنجاح' : 'Payment recorded successfully');
              setShowPaymentModal(false);
              setTransactionNumber('');
              loadInvoice();
            } catch (error: any) {
              Alert.alert(t('error', locale), error.message || (locale === 'ar' ? 'فشل في تسجيل الدفع' : 'Failed to record payment'));
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleMarkOutstanding = async () => {
    if (!invoice || !isAdmin) return;

    Alert.alert(
      locale === 'ar' ? 'تأكيد' : 'Confirm',
      locale === 'ar'
        ? 'هل تريد تغيير حالة الفاتورة إلى "قائمة" (جاهزة لاستلام البضائع)؟'
        : 'Change invoice status to "Outstanding" (ready for goods receipt)?',
      [
        { text: t('cancel', locale), style: 'cancel' },
        {
          text: t('confirm', locale),
          onPress: async () => {
            setProcessing(true);
            try {
              await api.accounting.supplierInvoices.markOutstanding(invoice.id);
              Alert.alert(t('success', locale), locale === 'ar' ? 'تم تحديث الحالة' : 'Status updated');
              loadInvoice();
            } catch (error: any) {
              Alert.alert(t('error', locale), error.message || (locale === 'ar' ? 'فشل في تحديث الحالة' : 'Failed to update status'));
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelInvoice = async () => {
    if (!invoice) return;

    Alert.alert(
      locale === 'ar' ? 'إلغاء الفاتورة' : 'Cancel Invoice',
      locale === 'ar' ? `هل تريد إلغاء الفاتورة ${invoice.invoiceNumber}؟` : `Cancel invoice ${invoice.invoiceNumber}?`,
      [
        { text: t('cancel', locale), style: 'cancel' },
        {
          text: t('confirm', locale),
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              await api.accounting.supplierInvoices.updateStatus(invoice.id, 'CANCELLED');
              Alert.alert(t('success', locale), locale === 'ar' ? 'تم إلغاء الفاتورة' : 'Invoice cancelled');
              router.back();
            } catch (error: any) {
              Alert.alert(t('error', locale), error.message || (locale === 'ar' ? 'فشل في إلغاء الفاتورة' : 'Failed to cancel invoice'));
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID': return theme.success;
      case 'OUTSTANDING': return theme.warning;
      case 'SCHEDULED': return theme.info;
      case 'CONFIRMED': return theme.primary;
      case 'CANCELLED': return theme.error;
      default: return theme.textSecondary;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      DRAFT: { en: 'Draft', ar: 'مسودة' },
      CONFIRMED: { en: 'Issued', ar: 'صادرة' },
      OUTSTANDING: { en: 'Outstanding', ar: 'قائمة' },
      SCHEDULED: { en: 'Scheduled', ar: 'مجدولة' },
      PAID: { en: 'Paid', ar: 'مدفوعة' },
      CANCELLED: { en: 'Cancelled', ar: 'ملغاة' },
    };
    return labels[status]?.[locale] || status;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return `${amount.toLocaleString()} ${locale === 'ar' ? 'ج.س' : 'SDG'}`;
  };

  const remainingAmount = invoice ? invoice.totalSdg - (invoice.paidAmountSdg || 0) : 0;
  const isPaid = invoice?.status === 'PAID';
  const isCancelled = invoice?.status === 'CANCELLED';
  const canPay = isAdmin && !isPaid && !isCancelled && remainingAmount > 0;
  const canMarkOutstanding = isAdmin && invoice?.status === 'CONFIRMED';
  const canCancel = !isPaid && !isCancelled;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!invoice) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <Ionicons name="document-text-outline" size={48} color={theme.textSecondary} />
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          {locale === 'ar' ? 'لم يتم العثور على الفاتورة' : 'Invoice not found'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Header Card */}
        <View style={[styles.headerCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={[styles.headerTop, isRtl && styles.rowReverse]}>
            <View style={[styles.headerInfo, isRtl && { alignItems: 'flex-end' }]}>
              <Text style={[styles.invoiceNumber, { color: theme.text }]}>{invoice.invoiceNumber}</Text>
              <Text style={[styles.supplierName, { color: theme.textSecondary }]}>
                {isRtl ? (invoice.supplier.nameAr || invoice.supplier.name) : invoice.supplier.name}
              </Text>
              {invoice.supplier.isConsignor && (
                <View style={[styles.consignorBadge, { backgroundColor: theme.infoBackground }]}>
                  <Ionicons name="layers" size={12} color={theme.info} />
                  <Text style={[styles.consignorText, { color: theme.info }]}>
                    {locale === 'ar' ? 'مورد أمانة' : 'Consignor'}
                  </Text>
                </View>
              )}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(invoice.status) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(invoice.status) }]}>
                {getStatusLabel(invoice.status)}
              </Text>
            </View>
          </View>

          {/* Dates */}
          <View style={[styles.datesRow, { borderTopColor: theme.border }]}>
            <View style={styles.dateItem}>
              <Text style={[styles.dateLabel, { color: theme.textMuted }]}>
                {locale === 'ar' ? 'تاريخ الفاتورة' : 'Invoice Date'}
              </Text>
              <Text style={[styles.dateValue, { color: theme.text }]}>{formatDate(invoice.invoiceDate)}</Text>
            </View>
            <View style={styles.dateItem}>
              <Text style={[styles.dateLabel, { color: theme.textMuted }]}>
                {locale === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}
              </Text>
              <Text style={[styles.dateValue, { color: theme.warning }]}>{formatDate(invoice.dueDate)}</Text>
            </View>
          </View>
        </View>

        {/* Amount Card */}
        <View style={[styles.amountCard, { backgroundColor: theme.warningBackground }]}>
          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'إجمالي الفاتورة' : 'Invoice Total'}
            </Text>
            <Text style={[styles.amountValue, { color: theme.text }]}>{formatCurrency(invoice.totalSdg)}</Text>
          </View>
          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'المدفوع' : 'Paid'}
            </Text>
            <Text style={[styles.amountValue, { color: theme.success }]}>
              {formatCurrency(invoice.paidAmountSdg || 0)}
            </Text>
          </View>
          <View style={[styles.amountRow, styles.remainingRow, { borderTopColor: theme.warning }]}>
            <Text style={[styles.remainingLabel, { color: theme.warning }]}>
              {locale === 'ar' ? 'المتبقي' : 'Remaining'}
            </Text>
            <Text style={[styles.remainingValue, { color: theme.warning }]}>{formatCurrency(remainingAmount)}</Text>
          </View>
        </View>

        {/* Payment Info */}
        {invoice.paymentMethod && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {locale === 'ar' ? 'معلومات الدفع' : 'Payment Info'}
            </Text>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                {locale === 'ar' ? 'طريقة الدفع' : 'Payment Method'}
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {invoice.paymentMethod === 'CASH' 
                  ? (locale === 'ar' ? 'نقدي' : 'Cash') 
                  : (locale === 'ar' ? 'تحويل بنكي' : 'Bank Transfer')}
              </Text>
            </View>
            {invoice.transactionNumber && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                  {locale === 'ar' ? 'رقم العملية' : 'Transaction No.'}
                </Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>{invoice.transactionNumber}</Text>
              </View>
            )}
            {invoice.paidDate && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                  {locale === 'ar' ? 'تاريخ الدفع' : 'Paid Date'}
                </Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>{formatDate(invoice.paidDate)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Purchase Order Items */}
        {invoice.purchaseOrder && invoice.purchaseOrder.lines && invoice.purchaseOrder.lines.length > 0 && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {locale === 'ar' ? 'الأصناف' : 'Items'} ({invoice.purchaseOrder.lines.length})
            </Text>
            {invoice.purchaseOrder.lines.map((line, index) => (
              <View
                key={line.id}
                style={[
                  styles.itemRow,
                  { borderBottomColor: theme.border },
                  index === invoice.purchaseOrder!.lines.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={[styles.itemInfo, isRtl && { alignItems: 'flex-end' }]}>
                  <Text style={[styles.itemName, { color: theme.text }]}>
                    {isRtl ? line.item.nameAr : line.item.nameEn}
                  </Text>
                  <Text style={[styles.itemSku, { color: theme.textMuted }]}>{line.item.sku}</Text>
                </View>
                <View style={styles.itemQtyPrice}>
                  <Text style={[styles.itemQty, { color: theme.textSecondary }]}>x{Number(line.qty)}</Text>
                  <Text style={[styles.itemTotal, { color: theme.text }]}>{formatCurrency(Number(line.totalSdg))}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Notes */}
        {invoice.notes && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('notes', locale)}</Text>
            <Text style={[styles.notesText, { color: theme.textSecondary }]}>{invoice.notes}</Text>
          </View>
        )}

        {/* Spacer for bottom actions */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Actions */}
      <View style={[styles.bottomBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {canMarkOutstanding && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.info }]}
            onPress={handleMarkOutstanding}
            disabled={processing}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>
              {locale === 'ar' ? 'تجهيز للاستلام' : 'Ready for Receipt'}
            </Text>
          </TouchableOpacity>
        )}
        
        {canPay && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.success }]}
            onPress={() => setShowPaymentModal(true)}
            disabled={processing}
          >
            <Ionicons name="cash" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>
              {locale === 'ar' ? 'تسجيل دفع' : 'Record Payment'}
            </Text>
          </TouchableOpacity>
        )}

        {canCancel && (
          <TouchableOpacity
            style={[styles.cancelButton, { borderColor: theme.error }]}
            onPress={handleCancelInvoice}
            disabled={processing}
          >
            <Ionicons name="close-circle" size={20} color={theme.error} />
          </TouchableOpacity>
        )}
      </View>

      {/* Payment Modal */}
      <Modal
        visible={showPaymentModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {locale === 'ar' ? 'تسجيل دفع' : 'Record Payment'}
              </Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {/* Payment Amount */}
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'المبلغ (ج.س)' : 'Amount (SDG)'}
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={theme.inputPlaceholder}
              />

              {/* Payment Method */}
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'طريقة الدفع' : 'Payment Method'}
              </Text>
              <View style={styles.methodButtons}>
                <TouchableOpacity
                  style={[
                    styles.methodButton,
                    { borderColor: paymentMethod === 'CASH' ? theme.success : theme.border },
                    paymentMethod === 'CASH' && { backgroundColor: theme.successBackground },
                  ]}
                  onPress={() => setPaymentMethod('CASH')}
                >
                  <Ionicons name="cash" size={20} color={paymentMethod === 'CASH' ? theme.success : theme.textMuted} />
                  <Text style={[styles.methodText, { color: paymentMethod === 'CASH' ? theme.success : theme.textMuted }]}>
                    {locale === 'ar' ? 'نقدي' : 'Cash'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.methodButton,
                    { borderColor: paymentMethod === 'BANK_TRANSFER' ? theme.success : theme.border },
                    paymentMethod === 'BANK_TRANSFER' && { backgroundColor: theme.successBackground },
                  ]}
                  onPress={() => setPaymentMethod('BANK_TRANSFER')}
                >
                  <Ionicons name="card" size={20} color={paymentMethod === 'BANK_TRANSFER' ? theme.success : theme.textMuted} />
                  <Text style={[styles.methodText, { color: paymentMethod === 'BANK_TRANSFER' ? theme.success : theme.textMuted }]}>
                    {locale === 'ar' ? 'تحويل بنكي' : 'Bank Transfer'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Transaction Number (for bank transfer) */}
              {paymentMethod === 'BANK_TRANSFER' && (
                <>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                    {locale === 'ar' ? 'رقم العملية *' : 'Transaction Number *'}
                  </Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                    value={transactionNumber}
                    onChangeText={setTransactionNumber}
                    placeholder={locale === 'ar' ? 'أدخل رقم العملية' : 'Enter transaction number'}
                    placeholderTextColor={theme.inputPlaceholder}
                  />
                </>
              )}
            </View>

            <View style={[styles.modalFooter, { borderTopColor: theme.border }]}>
              <TouchableOpacity
                style={[styles.modalCancelButton, { borderColor: theme.border }]}
                onPress={() => setShowPaymentModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>{t('cancel', locale)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmButton, { backgroundColor: theme.success }]}
                onPress={handlePayInvoice}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>{locale === 'ar' ? 'تأكيد الدفع' : 'Confirm Payment'}</Text>
                )}
              </TouchableOpacity>
            </View>
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
  scrollView: {
    flex: 1,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
  headerCard: {
    margin: 16,
    marginBottom: 0,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  headerInfo: {
    flex: 1,
  },
  invoiceNumber: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  supplierName: {
    fontSize: 15,
    marginBottom: 8,
  },
  consignorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    gap: 4,
  },
  consignorText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  datesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
  },
  dateItem: {
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  dateValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  amountCard: {
    margin: 16,
    marginBottom: 0,
    padding: 20,
    borderRadius: 16,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  amountLabel: {
    fontSize: 14,
  },
  amountValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  remainingRow: {
    paddingTop: 12,
    marginTop: 4,
    marginBottom: 0,
    borderTopWidth: 2,
  },
  remainingLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  remainingValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  section: {
    margin: 16,
    marginBottom: 0,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  itemSku: {
    fontSize: 12,
  },
  itemQtyPrice: {
    alignItems: 'flex-end',
  },
  itemQty: {
    fontSize: 13,
    marginBottom: 2,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '600',
  },
  notesText: {
    fontSize: 14,
    lineHeight: 22,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    fontSize: 16,
  },
  methodButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    gap: 8,
  },
  methodText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
