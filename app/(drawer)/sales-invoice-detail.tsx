import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { api, getFullUrl, showError } from '@/lib/api';
import { t } from '@/lib/i18n';

interface InvoiceLine {
  id: string;
  qty: number;
  unitPriceSdg: number;
  unitPriceUsd?: number;
  totalSdg: number;
  totalUsd?: number;
  item: {
    nameEn: string;
    nameAr: string;
    sku: string;
    unit?: { nameEn: string; nameAr?: string; symbol?: string };
  };
}

interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  invoiceType: string;
  totalSdg: number;
  totalUsd: number;
  paidAmountSdg?: number;
  paymentMethod?: string;
  transactionNumber?: string;
  receiptImageUrls?: string[];
  notes?: string;
  customer?: { name: string };
  createdBy?: { name: string };
  shelf?: { name: string; nameAr?: string };
  lines?: InvoiceLine[];
}

const STATUS_STEPS = ['DRAFT', 'ISSUED', 'PAID'];

function getStatusLabel(status: string, locale: string): string {
  const labels: Record<string, { en: string; ar: string }> = {
    DRAFT: { en: 'Draft', ar: 'مسودة' },
    ISSUED: { en: 'Issued', ar: 'صادرة' },
    PARTIALLY_PAID: { en: 'Partially Paid', ar: 'مدفوعة جزئياً' },
    PAID: { en: 'Paid', ar: 'مدفوعة' },
    CANCELLED: { en: 'Cancelled', ar: 'ملغاة' },
  };
  const label = labels[status];
  if (!label) return status;
  return locale === 'ar' ? label.ar : label.en;
}

function getStatusColor(status: string, theme: any): string {
  switch (status) {
    case 'DRAFT': return theme.textSecondary;
    case 'ISSUED': return theme.warning || '#f59e0b';
    case 'PARTIALLY_PAID': return theme.primary;
    case 'PAID': return theme.success;
    case 'CANCELLED': return theme.error || theme.danger;
    default: return theme.textSecondary;
  }
}

function getPaymentMethodLabel(method: string, locale: string): string {
  const labels: Record<string, { en: string; ar: string }> = {
    CASH: { en: 'Cash', ar: 'نقداً' },
    BANK_TRANSFER: { en: 'Bank Transfer', ar: 'تحويل بنكي' },
    CREDIT: { en: 'Credit', ar: 'آجل' },
    MIXED: { en: 'Mixed', ar: 'مختلط' },
  };
  const label = labels[method];
  if (!label) return method;
  return locale === 'ar' ? label.ar : label.en;
}

function getInvoiceTypeLabel(type: string, locale: string): string {
  const labels: Record<string, { en: string; ar: string }> = {
    WHOLESALE: { en: 'Wholesale', ar: 'جملة' },
    RETAIL: { en: 'Retail', ar: 'تجزئة' },
    DAILY_AGGREGATE: { en: 'Daily Aggregate', ar: 'تجميعية يومية' },
  };
  const label = labels[type];
  if (!label) return type;
  return locale === 'ar' ? label.ar : label.en;
}

export default function SalesInvoiceDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const { width: screenWidth } = useWindowDimensions();
  const isRtl = locale === 'ar';

  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<SalesInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const canVoid = ['ADMIN', 'MANAGER'].includes(user?.role || '');
  const showUsd = ['ADMIN', 'MANAGER'].includes(user?.role || '');

  const loadInvoice = async () => {
    try {
      const data = await api.sales.getInvoice(invoiceId);
      setInvoice(data);
    } catch (e: any) {
      showError(e, locale);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (invoiceId) loadInvoice();
    }, [invoiceId])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInvoice();
  };

  const handleVoid = () => {
    Alert.alert(
      locale === 'ar' ? 'إلغاء الفاتورة' : 'Void Invoice',
      locale === 'ar'
        ? 'هل أنت متأكد من إلغاء هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء.'
        : 'Are you sure you want to void this invoice? This action cannot be undone.',
      [
        { text: locale === 'ar' ? 'تراجع' : 'Cancel', style: 'cancel' },
        {
          text: locale === 'ar' ? 'إلغاء الفاتورة' : 'Void',
          style: 'destructive',
          onPress: async () => {
            setVoiding(true);
            try {
              await api.sales.voidInvoice(invoiceId);
              await loadInvoice();
              Alert.alert(
                locale === 'ar' ? 'تم' : 'Success',
                locale === 'ar' ? 'تم إلغاء الفاتورة' : 'Invoice voided successfully'
              );
            } catch (e: any) {
              showError(e, locale);
            } finally {
              setVoiding(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount: number, currency: 'SDG' | 'USD' = 'SDG') => {
    if (currency === 'USD') return `$${Number(amount || 0).toFixed(2)}`;
    return `${Number(amount || 0).toLocaleString()} ${locale === 'ar' ? 'ج.س' : 'SDG'}`;
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!invoice) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.textSecondary} />
        <Text style={{ marginTop: 12, color: theme.textSecondary }}>
          {locale === 'ar' ? 'الفاتورة غير موجودة' : 'Invoice not found'}
        </Text>
      </View>
    );
  }

  const isCancelled = invoice.status === 'CANCELLED';
  const receiptImages = invoice.receiptImageUrls || [];

  // Determine active step index
  const activeStep = isCancelled
    ? -1
    : STATUS_STEPS.indexOf(invoice.status === 'PARTIALLY_PAID' ? 'ISSUED' : invoice.status);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Card */}
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <View style={[styles.row, isRtl && styles.rowReverse, { justifyContent: 'space-between', marginBottom: 8 }]}>
            <Text style={[styles.invoiceNumber, { color: theme.text }]}>
              {invoice.invoiceNumber}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(invoice.status, theme) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(invoice.status, theme) }]}>
                {getStatusLabel(invoice.status, locale)}
              </Text>
            </View>
          </View>
          <View style={[styles.row, isRtl && styles.rowReverse, { gap: 16 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'التاريخ' : 'Date'}
              </Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>
                {formatDate(invoice.invoiceDate)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'النوع' : 'Type'}
              </Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>
                {getInvoiceTypeLabel(invoice.invoiceType, locale)}
              </Text>
            </View>
          </View>
          {invoice.customer && (
            <View style={{ marginTop: 8 }}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'العميل' : 'Customer'}
              </Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>{invoice.customer.name}</Text>
            </View>
          )}
          {invoice.shelf && (
            <View style={{ marginTop: 8 }}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'الرف' : 'Shelf'}
              </Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>
                {isRtl ? invoice.shelf.nameAr || invoice.shelf.name : invoice.shelf.name}
              </Text>
            </View>
          )}
          {invoice.createdBy && (
            <View style={{ marginTop: 8 }}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'أنشئت بواسطة' : 'Created By'}
              </Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>{invoice.createdBy.name}</Text>
            </View>
          )}
        </View>

        {/* Status Steps */}
        {!isCancelled ? (
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <View style={[styles.stepsRow, isRtl && styles.rowReverse]}>
              {STATUS_STEPS.map((step, index) => {
                const isActive = index === activeStep;
                const isDone = index < activeStep;
                const color = isDone || isActive ? theme.primary : theme.border;
                return (
                  <View key={step} style={[styles.stepItem, isRtl && { alignItems: 'flex-end' }]}>
                    <View style={[styles.stepCircle, { borderColor: color, backgroundColor: isDone ? theme.primary : 'transparent' }]}>
                      {isDone ? (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      ) : (
                        <View style={[styles.stepDot, { backgroundColor: isActive ? theme.primary : theme.border }]} />
                      )}
                    </View>
                    <Text style={[styles.stepLabel, { color: isActive || isDone ? theme.primary : theme.textSecondary }]}>
                      {getStatusLabel(step, locale)}
                    </Text>
                    {index < STATUS_STEPS.length - 1 && (
                      <View style={[styles.stepLine, { backgroundColor: index < activeStep ? theme.primary : theme.border }]} />
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.error + '15' || '#fee2e2' }]}>
            <View style={[styles.row, isRtl && styles.rowReverse, { gap: 8, alignItems: 'center' }]}>
              <Ionicons name="close-circle" size={20} color={theme.error || '#ef4444'} />
              <Text style={{ color: theme.error || '#ef4444', fontWeight: '600' }}>
                {locale === 'ar' ? 'هذه الفاتورة ملغاة' : 'This invoice is cancelled'}
              </Text>
            </View>
          </View>
        )}

        {/* Totals */}
        <View style={[styles.card, { backgroundColor: theme.primaryBackground || theme.card }]}>
          <View style={[styles.row, isRtl && styles.rowReverse, { justifyContent: 'space-between' }]}>
            <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'الإجمالي' : 'Total'}
            </Text>
            <View style={[isRtl && { alignItems: 'flex-end' }]}>
              <Text style={[styles.totalValue, { color: theme.primary }]}>
                {formatCurrency(invoice.totalSdg)}
              </Text>
              {showUsd && (
                <Text style={[styles.totalValueSmall, { color: theme.textSecondary }]}>
                  {formatCurrency(invoice.totalUsd, 'USD')}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Line Items */}
        {(invoice.lines || []).length > 0 && (
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && { textAlign: 'right' }]}>
              {locale === 'ar' ? 'الأصناف' : 'Line Items'}
            </Text>
            {(invoice.lines || []).map((line, index) => (
              <View key={line.id}>
                {index > 0 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
                <View style={[styles.lineRow, isRtl && styles.rowReverse]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={2}>
                      {isRtl ? line.item.nameAr : line.item.nameEn}
                    </Text>
                    <Text style={[styles.itemSku, { color: theme.textSecondary }]}>
                      {line.item.sku}
                      {line.item.unit && ` · ${line.item.unit.symbol || (isRtl ? line.item.unit.nameAr : line.item.unit.nameEn)}`}
                    </Text>
                  </View>
                  <View style={[{ alignItems: isRtl ? 'flex-start' : 'flex-end' }]}>
                    <Text style={[styles.lineQty, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? `× ${Number(line.qty)}` : `× ${Number(line.qty)}`}
                    </Text>
                    <Text style={[styles.lineTotal, { color: theme.text }]}>
                      {formatCurrency(line.totalSdg)}
                    </Text>
                    {showUsd && line.totalUsd != null && (
                      <Text style={[styles.lineTotalSmall, { color: theme.textSecondary }]}>
                        {formatCurrency(line.totalUsd, 'USD')}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Payment Info */}
        {invoice.paymentMethod && (
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && { textAlign: 'right' }]}>
              {locale === 'ar' ? 'بيانات الدفع' : 'Payment Details'}
            </Text>
            <View style={[styles.infoRow, isRtl && styles.rowReverse]}>
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'طريقة الدفع' : 'Payment Method'}
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {getPaymentMethodLabel(invoice.paymentMethod, locale)}
              </Text>
            </View>
            {invoice.transactionNumber && (
              <View style={[styles.infoRow, isRtl && styles.rowReverse]}>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                  {locale === 'ar' ? 'رقم العملية' : 'Transaction #'}
                </Text>
                <Text style={[styles.infoValue, { color: theme.text, fontFamily: 'monospace' }]}>
                  {invoice.transactionNumber}
                </Text>
              </View>
            )}
            {/* Receipt Images */}
            {receiptImages.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.infoLabel, { color: theme.textSecondary, marginBottom: 8 }]}>
                  {locale === 'ar' ? 'صور الإيصال' : 'Receipt Images'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {receiptImages.map((img, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => {
                          setCurrentImageIndex(idx);
                          setShowReceiptModal(true);
                        }}
                      >
                        <Image
                          source={{ uri: getFullUrl(img) }}
                          style={styles.receiptThumb}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* Notes */}
        {invoice.notes && (
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && { textAlign: 'right' }]}>
              {locale === 'ar' ? 'ملاحظات' : 'Notes'}
            </Text>
            <Text style={[styles.notesText, { color: theme.textSecondary }, isRtl && { textAlign: 'right' }]}>
              {invoice.notes}
            </Text>
          </View>
        )}

        {/* Actions */}
        {canVoid && !isCancelled && invoice.status !== 'PAID' && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
            <TouchableOpacity
              style={[styles.voidBtn, { borderColor: theme.error || '#ef4444' }, voiding && { opacity: 0.6 }]}
              onPress={handleVoid}
              disabled={voiding}
            >
              {voiding ? (
                <ActivityIndicator size="small" color={theme.error || '#ef4444'} />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={20} color={theme.error || '#ef4444'} />
                  <Text style={[styles.voidBtnText, { color: theme.error || '#ef4444' }]}>
                    {locale === 'ar' ? 'إلغاء الفاتورة' : 'Void Invoice'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Receipt Images Modal */}
      <Modal
        visible={showReceiptModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReceiptModal(false)}
      >
        <View style={styles.receiptModalOverlay}>
          <TouchableOpacity style={styles.receiptModalClose} onPress={() => setShowReceiptModal(false)}>
            <Ionicons name="close-circle" size={40} color="#fff" />
          </TouchableOpacity>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ width: screenWidth }}
            onMomentumScrollEnd={(e) => {
              setCurrentImageIndex(Math.round(e.nativeEvent.contentOffset.x / screenWidth));
            }}
          >
            {receiptImages.map((img, idx) => (
              <View key={idx} style={{ width: screenWidth, justifyContent: 'center', alignItems: 'center' }}>
                <Image
                  source={{ uri: getFullUrl(img) }}
                  style={{ width: screenWidth, height: '80%' }}
                  resizeMode="contain"
                />
              </View>
            ))}
          </ScrollView>
          {receiptImages.length > 1 && (
            <Text style={styles.imageCounter}>
              {currentImageIndex + 1} / {receiptImages.length}
            </Text>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    margin: 16,
    marginBottom: 0,
    borderRadius: 16,
    padding: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowReverse: { flexDirection: 'row-reverse' },
  invoiceNumber: { fontSize: 18, fontWeight: '700', fontFamily: 'monospace' },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: { fontSize: 13, fontWeight: '600' },
  metaLabel: { fontSize: 12, marginBottom: 2 },
  metaValue: { fontSize: 14, fontWeight: '500' },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    position: 'relative',
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    zIndex: 1,
  },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
  stepLabel: { fontSize: 11, fontWeight: '500', textAlign: 'center' },
  stepLine: {
    position: 'absolute',
    top: 14,
    left: '50%',
    right: '-50%',
    height: 2,
    zIndex: 0,
  },
  totalLabel: { fontSize: 14 },
  totalValue: { fontSize: 20, fontWeight: '700' },
  totalValueSmall: { fontSize: 13 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  divider: { height: 1, marginVertical: 8 },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 4,
  },
  itemName: { fontSize: 14, fontWeight: '600' },
  itemSku: { fontSize: 12, marginTop: 2 },
  lineQty: { fontSize: 13 },
  lineTotal: { fontSize: 14, fontWeight: '600' },
  lineTotalSmall: { fontSize: 12 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: '500' },
  receiptThumb: { width: 80, height: 80, borderRadius: 8 },
  notesText: { fontSize: 14, lineHeight: 20 },
  voidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 16,
  },
  voidBtnText: { fontSize: 15, fontWeight: '600' },
  receiptModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  receiptModalClose: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  imageCounter: {
    position: 'absolute',
    bottom: 40,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
