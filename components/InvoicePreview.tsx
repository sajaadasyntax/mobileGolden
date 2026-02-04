import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '@/stores/theme';
import { useLocaleStore } from '@/stores/locale';
import { t } from '@/lib/i18n';
import {
  Invoice,
  InvoiceGenerationOptions,
  shareInvoicePDF,
  printInvoice,
  generateInvoicePDF,
} from '@/lib/invoice';

interface Props {
  visible: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  onSave?: () => void;
}

export default function InvoicePreview({ visible, onClose, invoice, onSave }: Props) {
  const { theme } = useThemeStore();
  const { locale } = useLocaleStore();
  const isRtl = locale === 'ar';
  
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string>('');

  if (!invoice) return null;

  const formatCurrency = (amount: number, currency: 'USD' | 'SDG') => {
    const symbol = currency === 'USD' ? '$' : 'SDG';
    return `${symbol} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: theme.textMuted,
      PENDING: theme.warning,
      CONFIRMED: theme.info,
      PAID: theme.success,
      PARTIALLY_PAID: theme.info,
      CANCELLED: theme.error,
      DEFERRED: '#8b5cf6',
    };
    return colors[status] || theme.textMuted;
  };

  const getStatusText = (status: string) => {
    const texts: Record<string, { en: string; ar: string }> = {
      DRAFT: { en: 'Draft', ar: 'مسودة' },
      PENDING: { en: 'Pending', ar: 'قيد الانتظار' },
      CONFIRMED: { en: 'Confirmed', ar: 'مؤكدة' },
      PAID: { en: 'Paid', ar: 'مدفوعة' },
      PARTIALLY_PAID: { en: 'Partially Paid', ar: 'مدفوعة جزئياً' },
      CANCELLED: { en: 'Cancelled', ar: 'ملغية' },
      DEFERRED: { en: 'Deferred', ar: 'مؤجلة' },
    };
    return texts[status]?.[locale] || status;
  };

  const options: InvoiceGenerationOptions = {
    locale,
    includePaymentDetails: true,
    includeBankDetails: true,
  };

  const handleShare = async () => {
    setLoading(true);
    setAction('share');
    try {
      await shareInvoicePDF(invoice, options);
    } catch (error: any) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        error.message || (locale === 'ar' ? 'فشل في مشاركة الفاتورة' : 'Failed to share invoice')
      );
    } finally {
      setLoading(false);
      setAction('');
    }
  };

  const handlePrint = async () => {
    setLoading(true);
    setAction('print');
    try {
      await printInvoice(invoice, options);
    } catch (error: any) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        error.message || (locale === 'ar' ? 'فشل في طباعة الفاتورة' : 'Failed to print invoice')
      );
    } finally {
      setLoading(false);
      setAction('');
    }
  };

  const handleSavePDF = async () => {
    setLoading(true);
    setAction('save');
    try {
      const { uri, filename } = await generateInvoicePDF(invoice, options);
      
      // Verify file exists
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        throw new Error(locale === 'ar' ? 'فشل في التحقق من وجود الملف' : 'Failed to verify saved file');
      }
      
      Alert.alert(
        locale === 'ar' ? 'تم الحفظ بنجاح' : 'Saved Successfully',
        locale === 'ar' 
          ? `تم حفظ الفاتورة: ${filename}\n\nالموقع: Documents/${filename}`
          : `Invoice saved: ${filename}\n\nLocation: Documents/${filename}`,
        [
          {
            text: locale === 'ar' ? 'مشاركة' : 'Share',
            onPress: async () => {
              try {
                const isAvailable = await Sharing.isAvailableAsync();
                if (isAvailable) {
                  await Sharing.shareAsync(uri, {
                    mimeType: 'application/pdf',
                    dialogTitle: `Share Invoice ${invoice.invoiceNumber}`,
                    UTI: 'com.adobe.pdf',
                  });
                }
              } catch (shareError) {
                console.error('Share error:', shareError);
              }
            },
          },
          { text: 'OK' },
        ]
      );
    } catch (error: any) {
      console.error('Save PDF error:', error);
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        stack: error?.stack,
      });
      
      // Provide more helpful error messages
      let errorMessage = error?.message || (locale === 'ar' ? 'فشل في حفظ الفاتورة' : 'Failed to save invoice');
      
      // Check for specific error types and provide helpful messages
      if (errorMessage.includes('timeout')) {
        errorMessage = locale === 'ar' 
          ? 'انتهت مهلة إنشاء PDF. قد تكون الفاتورة كبيرة جداً. يرجى المحاولة مرة أخرى.'
          : 'PDF generation timed out. The invoice may be too large. Please try again.';
      } else if (errorMessage.includes('permission')) {
        errorMessage = locale === 'ar'
          ? 'تم رفض الإذن. يرجى التحقق من أذونات التطبيق.'
          : 'Permission denied. Please check app permissions.';
      } else if (errorMessage.includes('memory')) {
        errorMessage = locale === 'ar'
          ? 'ذاكرة غير كافية لإنشاء PDF. يرجى المحاولة مرة أخرى.'
          : 'Insufficient memory to generate PDF. Please try again.';
      } else if (errorMessage.includes('HTML')) {
        errorMessage = locale === 'ar'
          ? 'خطأ في إنشاء محتوى الفاتورة. يرجى التحقق من بيانات الفاتورة.'
          : 'Error generating invoice content. Please check invoice data.';
      }
      
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        errorMessage,
        [
          {
            text: locale === 'ar' ? 'إعادة المحاولة' : 'Retry',
            onPress: () => handleSavePDF(),
            style: 'default',
          },
          { text: 'OK', style: 'cancel' },
        ]
      );
    } finally {
      setLoading(false);
      setAction('');
    }
  };

  const party = invoice.invoiceType === 'SALES' ? invoice.customer : invoice.supplier;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.primary }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {locale === 'ar' ? 'معاينة الفاتورة' : 'Invoice Preview'}
          </Text>
          <View style={styles.closeButton} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Invoice Header Card */}
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={[styles.invoiceHeader, isRtl && styles.rowReverse]}>
              <View style={styles.invoiceNumberContainer}>
                <Text style={[styles.label, { color: theme.textMuted }]}>
                  {locale === 'ar' ? 'رقم الفاتورة' : 'Invoice No.'}
                </Text>
                <Text style={[styles.invoiceNumber, { color: theme.text }]}>
                  {invoice.invoiceNumber}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(invoice.paymentStatus) + '20' }]}>
                <Text style={[styles.statusText, { color: getStatusColor(invoice.paymentStatus) }]}>
                  {getStatusText(invoice.paymentStatus)}
                </Text>
              </View>
            </View>
            
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Text style={[styles.metaLabel, { color: theme.textMuted }]}>
                  {locale === 'ar' ? 'التاريخ' : 'Date'}
                </Text>
                <Text style={[styles.metaValue, { color: theme.text }]}>
                  {formatDate(invoice.invoiceDate)}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={[styles.metaLabel, { color: theme.textMuted }]}>
                  {locale === 'ar' ? 'سعر الصرف' : 'Exchange Rate'}
                </Text>
                <Text style={[styles.metaValue, { color: theme.text }]}>
                  1 USD = {invoice.exchangeRate} SDG
                </Text>
              </View>
            </View>
          </View>

          {/* Party Info */}
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {invoice.invoiceType === 'SALES' 
                ? (locale === 'ar' ? 'العميل' : 'Customer')
                : (locale === 'ar' ? 'المورد' : 'Supplier')}
            </Text>
            {party ? (
              <>
                <Text style={[styles.partyName, { color: theme.text }]}>
                  {isRtl ? (party.nameAr || party.name) : party.name}
                </Text>
                {party.phone && (
                  <Text style={[styles.partyDetail, { color: theme.textSecondary }]}>
                    {party.phone}
                  </Text>
                )}
              </>
            ) : (
              <Text style={[styles.partyName, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'عميل نقدي' : 'Walk-in Customer'}
              </Text>
            )}
          </View>

          {/* Items */}
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {locale === 'ar' ? 'الأصناف' : 'Items'} ({invoice.items.length})
            </Text>
            
            {invoice.items.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.itemRow,
                  index < invoice.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                  isRtl && styles.rowReverse,
                ]}
              >
                <View style={[styles.itemInfo, isRtl && { alignItems: 'flex-end' }]}>
                  <Text style={[styles.itemName, { color: theme.text }, isRtl && styles.textRtl]}>
                    {isRtl ? (item.nameAr || item.name) : item.name}
                  </Text>
                  <Text style={[styles.itemMeta, { color: theme.textMuted }]}>
                    {item.quantity} × {formatCurrency(item.unitPrice, 'USD')}
                  </Text>
                </View>
                <View style={[styles.itemTotal, isRtl && { alignItems: 'flex-start' }]}>
                  <Text style={[styles.itemTotalValue, { color: theme.success }]}>
                    {formatCurrency(item.total, 'USD')}
                  </Text>
                  <Text style={[styles.itemTotalSdg, { color: theme.textMuted }]}>
                    {formatCurrency(item.totalSdg, 'SDG')}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Totals */}
          <View style={[styles.totalsCard, { backgroundColor: theme.primaryBackground }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}
              </Text>
              <Text style={[styles.totalValue, { color: theme.text }]}>
                {formatCurrency(invoice.subtotal, 'USD')}
              </Text>
            </View>
            
            {invoice.discount > 0 && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
                  {locale === 'ar' ? 'الخصم' : 'Discount'}
                </Text>
                <Text style={[styles.totalValue, { color: theme.error }]}>
                  -{formatCurrency(invoice.discount, 'USD')}
                </Text>
              </View>
            )}
            
            {invoice.tax > 0 && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
                  {locale === 'ar' ? 'الضريبة' : 'Tax'}
                </Text>
                <Text style={[styles.totalValue, { color: theme.text }]}>
                  {formatCurrency(invoice.tax, 'USD')}
                </Text>
              </View>
            )}
            
            <View style={[styles.grandTotalRow, { borderTopColor: theme.primary }]}>
              <Text style={[styles.grandTotalLabel, { color: theme.primary }]}>
                {locale === 'ar' ? 'الإجمالي الكلي' : 'Grand Total'}
              </Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.grandTotalValue, { color: theme.primary }]}>
                  {formatCurrency(invoice.total, 'USD')}
                </Text>
                <Text style={[styles.grandTotalSdg, { color: theme.textSecondary }]}>
                  {formatCurrency(invoice.totalSdg, 'SDG')}
                </Text>
              </View>
            </View>
          </View>

          {/* Notes */}
          {invoice.notes && (
            <View style={[styles.card, { backgroundColor: theme.warningBackground }]}>
              <Text style={[styles.cardTitle, { color: theme.warning }]}>
                {locale === 'ar' ? 'ملاحظات' : 'Notes'}
              </Text>
              <Text style={[styles.notesText, { color: theme.text }]}>
                {isRtl ? (invoice.notesAr || invoice.notes) : invoice.notes}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Action Buttons */}
        <View style={[styles.footer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.backgroundTertiary }]}
              onPress={handlePrint}
              disabled={loading}
            >
              {loading && action === 'print' ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <>
                  <Ionicons name="print" size={22} color={theme.primary} />
                  <Text style={[styles.actionButtonText, { color: theme.primary }]}>
                    {locale === 'ar' ? 'طباعة' : 'Print'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.backgroundTertiary }]}
              onPress={handleSavePDF}
              disabled={loading}
            >
              {loading && action === 'save' ? (
                <ActivityIndicator size="small" color={theme.success} />
              ) : (
                <>
                  <Ionicons name="download" size={22} color={theme.success} />
                  <Text style={[styles.actionButtonText, { color: theme.success }]}>
                    {locale === 'ar' ? 'حفظ PDF' : 'Save PDF'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.backgroundTertiary }]}
              onPress={handleShare}
              disabled={loading}
            >
              {loading && action === 'share' ? (
                <ActivityIndicator size="small" color={theme.info} />
              ) : (
                <>
                  <Ionicons name="share" size={22} color={theme.info} />
                  <Text style={[styles.actionButtonText, { color: theme.info }]}>
                    {locale === 'ar' ? 'مشاركة' : 'Share'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {onSave && (
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: theme.primary }]}
              onPress={onSave}
              disabled={loading}
            >
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={styles.saveButtonText}>
                {locale === 'ar' ? 'حفظ الفاتورة' : 'Save Invoice'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: 20,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 200,
  },
  card: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  invoiceNumberContainer: {},
  label: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  invoiceNumber: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 20,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  partyName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  partyDetail: {
    fontSize: 14,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 13,
  },
  itemTotal: {
    alignItems: 'flex-end',
  },
  itemTotalValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  itemTotalSdg: {
    fontSize: 12,
    marginTop: 2,
  },
  textRtl: {
    textAlign: 'right',
  },
  totalsCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  totalLabel: {
    fontSize: 14,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    marginTop: 8,
    borderTopWidth: 2,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  grandTotalValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  grandTotalSdg: {
    fontSize: 13,
    marginTop: 2,
  },
  notesText: {
    fontSize: 14,
    lineHeight: 22,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

