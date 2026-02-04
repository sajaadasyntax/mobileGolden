import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface Invoice {
  id: string;
  invoiceNumber: string;
  party: string;
  partyNameAr?: string;
  amountSdg: number;
  paidAmountSdg: number;
  remainingAmountSdg: number;
  dueDate: string;
  daysOverdue: number;
  type: 'RECEIVABLE' | 'PAYABLE';
}

export default function OutstandingInvoicesScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleAmount, setScheduleAmount] = useState('');
  const [scheduleDueDate, setScheduleDueDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  
  // Set default filter based on user role
  const getDefaultFilter = () => {
    const role = user?.role || '';
    if (['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(role)) return 'ALL';
    if (role === 'PROCUREMENT') return 'PAYABLE';
    return 'ALL';
  };
  const [filter, setFilter] = useState<'ALL' | 'RECEIVABLE' | 'PAYABLE'>(getDefaultFilter());

  useEffect(() => {
    loadInvoices();
  }, [user?.branchId]);

  // Determine which data the user can access based on role
  const canAccessReceivables = ['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(user?.role || '');
  const canAccessPayables = ['ADMIN', 'MANAGER', 'PROCUREMENT', 'ACCOUNTANT'].includes(user?.role || '');

  const loadInvoices = async () => {
    try {
      if (!user?.branchId) return;
      
      // Load data based on user role permissions - pass branchId for proper filtering
      const promises: Promise<any>[] = [];
      
      if (canAccessReceivables) {
        promises.push(api.accounting.reports.outstandingReceivables(user.branchId));
      } else {
        promises.push(Promise.resolve({ invoices: [] }));
      }
      
      if (canAccessPayables) {
        promises.push(api.accounting.reports.outstandingPayables(user.branchId));
      } else {
        promises.push(Promise.resolve({ invoices: [] }));
      }
      
      const [receivablesResult, payablesResult] = await Promise.all(promises);
      
      // Handle different response structures - could be { invoices: [...] } or just array
      const receivablesData = Array.isArray(receivablesResult) 
        ? receivablesResult 
        : (receivablesResult?.invoices || receivablesResult?.data || []);
      
      const payablesData = Array.isArray(payablesResult) 
        ? payablesResult 
        : (payablesResult?.invoices || payablesResult?.data || []);
      
      const receivables = (receivablesData || []).map((inv: any) => {
        const totalAmount = Number(inv.totalSdg) || Number(inv.amountSdg) || 0;
        const paidAmount = Number(inv.paidAmountSdg) || 0;
        const remaining = totalAmount - paidAmount;
        
        // Debug logging for zero amounts
        if (totalAmount === 0) {
          console.log('Receivable with 0 total:', inv);
        }
        
        return {
          id: inv.id || String(Math.random()),
          invoiceNumber: inv.invoiceNumber || `INV-${(inv.id || '').substring(0, 8).toUpperCase()}`,
          party: inv.customer?.name || 'Unknown',
          partyNameAr: inv.customer?.nameAr,
          amountSdg: totalAmount,
          paidAmountSdg: paidAmount,
          remainingAmountSdg: Math.max(0, remaining),
          dueDate: inv.dueDate || new Date().toISOString(),
          daysOverdue: inv.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24))) : 0,
          type: 'RECEIVABLE' as const,
        };
      });
      
      const payables = (payablesData || []).map((inv: any) => {
        const totalAmount = Number(inv.totalSdg) || Number(inv.amountSdg) || 0;
        const paidAmount = Number(inv.paidAmountSdg) || 0;
        const remaining = totalAmount - paidAmount;
        
        // Debug logging for zero amounts
        if (totalAmount === 0) {
          console.log('Payable with 0 total:', inv);
        }
        
        return {
          id: inv.id || String(Math.random()),
          invoiceNumber: inv.invoiceNumber || `INV-${(inv.id || '').substring(0, 8).toUpperCase()}`,
          party: inv.supplier?.name || 'Unknown',
          partyNameAr: inv.supplier?.nameAr,
          amountSdg: totalAmount,
          paidAmountSdg: paidAmount,
          remainingAmountSdg: Math.max(0, remaining),
          dueDate: inv.dueDate || new Date().toISOString(),
          daysOverdue: inv.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24))) : 0,
          type: 'PAYABLE' as const,
        };
      });
      
      const allInvoices = [...receivables, ...payables];
      console.log(`Loaded ${allInvoices.length} outstanding invoices (${receivables.length} receivables, ${payables.length} payables)`);
      
      // Log summary
      const totalReceivable = receivables.reduce((sum, inv) => sum + inv.remainingAmountSdg, 0);
      const totalPayable = payables.reduce((sum, inv) => sum + inv.remainingAmountSdg, 0);
      console.log(`Total Outstanding - Receivables: ${totalReceivable.toFixed(2)} SDG, Payables: ${totalPayable.toFixed(2)} SDG`);
      
      setInvoices(allInvoices);
    } catch (error) {
      console.error('Failed to load outstanding invoices:', error);
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

  const filteredInvoices = invoices.filter(inv => 
    filter === 'ALL' || inv.type === filter
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US').format(amount);
  };

  const handleSchedulePayment = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setScheduleAmount(invoice.remainingAmountSdg.toString());
    setScheduleDueDate(new Date());
    setScheduleNotes('');
    setShowScheduleModal(true);
  };

  const handleConfirmSchedule = async () => {
    if (!selectedInvoice) return;
    
    const amount = parseFloat(scheduleAmount);
    if (!amount || amount <= 0) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'يرجى إدخال مبلغ صحيح' : 'Please enter a valid amount'
      );
      return;
    }
    
    if (amount > selectedInvoice.remainingAmountSdg) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'المبلغ أكبر من المبلغ المتبقي' : 'Amount exceeds remaining balance'
      );
      return;
    }

    setProcessing(true);
    try {
      await api.accounting.paymentSchedules.create({
        invoiceId: selectedInvoice.id,
        amountSdg: amount,
        dueDate: scheduleDueDate,
        notes: scheduleNotes || undefined,
      });

      Alert.alert(
        locale === 'ar' ? 'نجح' : 'Success',
        locale === 'ar' ? 'تمت جدولة الدفعة بنجاح' : 'Payment scheduled successfully'
      );
      setShowScheduleModal(false);
      loadInvoices();
    } catch (error: any) {
      console.error('Failed to schedule payment:', error);
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        error?.message || (locale === 'ar' ? 'فشلت جدولة الدفعة' : 'Failed to schedule payment')
      );
    } finally {
      setProcessing(false);
    }
  };

  const renderInvoice = ({ item }: { item: Invoice }) => {
    const isOverdue = item.daysOverdue > 0;
    const isReceivable = item.type === 'RECEIVABLE';
    const hasPartialPayment = item.paidAmountSdg > 0;
    const paymentPercentage = item.amountSdg > 0 ? Math.round((item.paidAmountSdg / item.amountSdg) * 100) : 0;
    const canSchedule = item.type === 'PAYABLE' && ['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(user?.role || '');
    
    return (
      <View 
        style={[styles.invoiceCard, { backgroundColor: theme.card }, isRtl && styles.invoiceCardRtl]}
      >
        <View style={[
          styles.invoiceIcon, 
          { backgroundColor: isReceivable ? theme.success + '15' : theme.error + '15' }
        ]}>
          <Ionicons 
            name={isReceivable ? 'arrow-down' : 'arrow-up'} 
            size={24} 
            color={isReceivable ? theme.success : theme.error} 
          />
        </View>
        <View style={[styles.invoiceContent, isRtl && styles.invoiceContentRtl]}>
          <View style={[styles.invoiceHeader, isRtl && styles.invoiceHeaderRtl]}>
            <Text style={[styles.invoiceNumber, { color: theme.text }]}>{item.invoiceNumber}</Text>
            {isOverdue && (
              <View style={[styles.overdueBadge, { backgroundColor: theme.error + '20' }]}>
                <Text style={[styles.overdueText, { color: theme.error }]}>
                  {locale === 'ar' ? `متأخر ${item.daysOverdue} يوم` : `${item.daysOverdue}d overdue`}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.customerName, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? item.partyNameAr || item.party : item.party}
          </Text>
          <View style={[styles.dateRow, isRtl && styles.dateRowRtl]}>
            <Text style={[styles.dateLabel, { color: theme.textMuted }]}>{t('dueDate', locale)}:</Text>
            <Text style={[
              styles.dateValue, 
              { color: isOverdue ? theme.error : theme.textSecondary }
            ]}>
              {formatDate(item.dueDate)}
            </Text>
          </View>
          
          {/* Payment Progress */}
          {hasPartialPayment && (
            <View style={styles.paymentProgressContainer}>
              <View style={[styles.progressBar, { backgroundColor: theme.backgroundTertiary }]}>
                <View 
                  style={[
                    styles.progressFill, 
                    { 
                      backgroundColor: theme.success,
                      width: `${paymentPercentage}%` 
                    }
                  ]} 
                />
              </View>
              <Text style={[styles.progressText, { color: theme.success }]}>
                {paymentPercentage}% {locale === 'ar' ? 'مدفوع' : 'paid'}
              </Text>
            </View>
          )}
        </View>
        <View style={[styles.amountContainer, isRtl && styles.amountContainerRtl]}>
          {/* Show remaining amount prominently */}
          <Text style={[styles.amountValue, { color: isReceivable ? theme.success : theme.error }]}>
            {formatAmount(item.remainingAmountSdg)}
          </Text>
          <Text style={[styles.currencyText, { color: theme.textSecondary }]}>
            {locale === 'ar' ? 'متبقي' : 'remaining'}
          </Text>
          
          {/* Show total and paid if there's partial payment */}
          {hasPartialPayment && (
            <View style={[styles.paymentDetails, { marginTop: 6 }]}>
              <Text style={[styles.smallAmountText, { color: theme.textMuted }]}>
                {locale === 'ar' ? 'الإجمالي: ' : 'Total: '}{formatAmount(item.amountSdg)}
              </Text>
              <Text style={[styles.smallAmountText, { color: theme.success }]}>
                {locale === 'ar' ? 'المدفوع: ' : 'Paid: '}{formatAmount(item.paidAmountSdg)}
              </Text>
            </View>
          )}
          
          {/* If no partial payment, show the currency */}
          {!hasPartialPayment && (
            <Text style={[styles.currencyText, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'ج.س' : 'SDG'}
            </Text>
          )}
        </View>
        
        {/* Schedule Payment Button */}
        {canSchedule && (
          <TouchableOpacity
            style={[styles.scheduleButton, { backgroundColor: theme.primary }]}
            onPress={() => handleSchedulePayment(item)}
          >
            <Ionicons name="calendar" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    );
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
      {/* Filter Tabs - only show tabs user has access to */}
      <View style={styles.filterContainer}>
        {/* Show ALL tab only if user can access both types */}
        {canAccessReceivables && canAccessPayables && (
          <TouchableOpacity
            style={[
              styles.filterTab, 
              { backgroundColor: filter === 'ALL' ? theme.primary : theme.card }
            ]}
            onPress={() => setFilter('ALL')}
          >
            <Text style={[
              styles.filterText, 
              { color: filter === 'ALL' ? '#fff' : theme.textSecondary }
            ]}>
              {t('all', locale)}
            </Text>
          </TouchableOpacity>
        )}
        {/* Show Receivables tab only if user has access */}
        {canAccessReceivables && (
          <TouchableOpacity
            style={[
              styles.filterTab, 
              { backgroundColor: filter === 'RECEIVABLE' ? theme.primary : theme.card }
            ]}
            onPress={() => setFilter('RECEIVABLE')}
          >
            <Text style={[
              styles.filterText, 
              { color: filter === 'RECEIVABLE' ? '#fff' : theme.textSecondary }
            ]}>
              {locale === 'ar' ? 'مستحقات' : 'Receivables'}
            </Text>
          </TouchableOpacity>
        )}
        {/* Show Payables tab only if user has access */}
        {canAccessPayables && (
          <TouchableOpacity
            style={[
              styles.filterTab, 
              { backgroundColor: filter === 'PAYABLE' ? theme.primary : theme.card }
            ]}
            onPress={() => setFilter('PAYABLE')}
          >
            <Text style={[
              styles.filterText, 
              { color: filter === 'PAYABLE' ? '#fff' : theme.textSecondary }
            ]}>
              {locale === 'ar' ? 'مديونيات' : 'Payables'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Invoices List */}
      <FlatList
        data={filteredInvoices}
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
          </View>
        }
      />

      {/* Schedule Payment Modal */}
      <Modal
        visible={showScheduleModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowScheduleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {locale === 'ar' ? 'جدولة الدفعة' : 'Schedule Payment'}
              </Text>
              <TouchableOpacity onPress={() => setShowScheduleModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {selectedInvoice && (
                <>
                  <Text style={[styles.invoiceInfoText, { color: theme.textSecondary }]}>
                    {locale === 'ar' ? 'الفاتورة: ' : 'Invoice: '}{selectedInvoice.invoiceNumber}
                  </Text>
                  <Text style={[styles.invoiceInfoText, { color: theme.textSecondary, marginBottom: 16 }]}>
                    {locale === 'ar' ? 'المورد: ' : 'Supplier: '}{locale === 'ar' ? selectedInvoice.partyNameAr || selectedInvoice.party : selectedInvoice.party}
                  </Text>
                </>
              )}

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'المبلغ (ج.س)' : 'Amount (SDG)'}
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={scheduleAmount}
                onChangeText={setScheduleAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={theme.inputPlaceholder}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}
              </Text>
              <TouchableOpacity
                style={[styles.dateButton, { backgroundColor: theme.input, borderColor: theme.inputBorder }]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={[styles.dateButtonText, { color: theme.text }]}>
                  {scheduleDueDate.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US')}
                </Text>
                <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} />
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker
                  value={scheduleDueDate}
                  mode="date"
                  display="default"
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(false);
                    if (selectedDate) {
                      setScheduleDueDate(selectedDate);
                    }
                  }}
                  minimumDate={new Date()}
                />
              )}

              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'ملاحظات (اختياري)' : 'Notes (Optional)'}
              </Text>
              <TextInput
                style={[styles.textInput, styles.textArea, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={scheduleNotes}
                onChangeText={setScheduleNotes}
                placeholder={locale === 'ar' ? 'أضف ملاحظات' : 'Add notes'}
                placeholderTextColor={theme.inputPlaceholder}
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }, processing && styles.submitButtonDisabled]}
                onPress={handleConfirmSchedule}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {locale === 'ar' ? 'جدولة' : 'Schedule'}
                  </Text>
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
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
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
  overdueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  overdueText: {
    fontSize: 10,
    fontWeight: '600',
  },
  customerName: {
    fontSize: 13,
    marginTop: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  dateRowRtl: {
    flexDirection: 'row-reverse',
  },
  dateLabel: {
    fontSize: 11,
  },
  dateValue: {
    fontSize: 11,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amountContainerRtl: {
    alignItems: 'flex-start',
  },
  amountValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  currencyText: {
    fontSize: 11,
    marginTop: 2,
  },
  paymentProgressContainer: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 10,
    fontWeight: '600',
  },
  paymentDetails: {
    alignItems: 'flex-end',
  },
  smallAmountText: {
    fontSize: 10,
    marginTop: 1,
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
  scheduleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 0,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalBody: {
    padding: 20,
  },
  invoiceInfoText: {
    fontSize: 13,
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  dateButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  dateButtonText: {
    fontSize: 16,
  },
  submitButton: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
