import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface BankNotice {
  id: string;
  operationNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  supplier: string;
  supplierNameAr?: string;
  amount: number;
  isMatched: boolean;
  createdAt: string;
}

export default function MatchOperationScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  
  const [notices, setNotices] = useState<BankNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<BankNotice | null>(null);
  const [operationNumber, setOperationNumber] = useState('');
  const [matching, setMatching] = useState(false);

  useEffect(() => {
    loadNotices();
  }, []);

  const loadNotices = async () => {
    try {
      const data = await api.accounting.bankNotices.list({ isMatched: false });
      
      if (data?.data) {
        setNotices(data.data.map((notice: any) => ({
          id: notice.id,
          operationNumber: notice.operationNumber || '',
          invoiceId: notice.invoiceId,
          invoiceNumber: notice.invoice?.invoiceNumber || 'N/A',
          supplier: notice.invoice?.supplier?.name || 'Unknown',
          supplierNameAr: notice.invoice?.supplier?.nameAr,
          amount: Number(notice.amountSdg) || 0,
          isMatched: notice.isMatched || false,
          createdAt: notice.createdAt?.split('T')[0] || '',
        })));
      }
    } catch (error) {
      console.error('Failed to load bank notices:', error);
      setNotices([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotices();
    setRefreshing(false);
  };

  const openMatchModal = (notice: BankNotice) => {
    setSelectedNotice(notice);
    setOperationNumber(notice.operationNumber);
    setShowMatchModal(true);
  };

  const handleMatch = async () => {
    if (!selectedNotice || !operationNumber.trim()) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'يرجى إدخال رقم العملية' : 'Please enter operation number');
      return;
    }
    
    setMatching(true);
    try {
      await api.accounting.bankNotices.match(selectedNotice.id, operationNumber.trim());
      Alert.alert(t('success', locale), t('matchNotice', locale));
      setShowMatchModal(false);
      setSelectedNotice(null);
      setOperationNumber('');
      loadNotices();
    } catch (error: any) {
      Alert.alert(t('error', locale), error?.message || 'Failed to match');
    } finally {
      setMatching(false);
    }
  };

  const unmatchedCount = notices.filter(n => !n.isMatched).length;
  const totalUnmatchedAmount = notices.filter(n => !n.isMatched).reduce((sum, n) => sum + n.amount, 0);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header Card */}
      <View style={[styles.headerCard, { backgroundColor: theme.primaryBackground }]}>
        <Ionicons name="link" size={32} color={theme.primary} />
        <Text style={[styles.headerTitle, { color: theme.primary }, isRtl && styles.textRtl]}>
          {t('matchOperationNumber', locale)}
        </Text>
        <Text style={[styles.headerSubtitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
          {locale === 'ar' ? 'مطابقة إشعارات البنك مع الفواتير' : 'Match bank notices with invoices'}
        </Text>
      </View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: theme.warningBackground }]}>
          <Text style={[styles.summaryValue, { color: theme.warning }]}>{unmatchedCount}</Text>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
            {locale === 'ar' ? 'غير مطابقة' : 'Unmatched'}
          </Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.summaryValue, { color: theme.text }]}>
            {totalUnmatchedAmount.toLocaleString()}
          </Text>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
            {locale === 'ar' ? 'المبلغ (ج.س)' : 'Amount (SDG)'}
          </Text>
        </View>
      </View>

      {/* Notices List */}
      <ScrollView
        style={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
          {locale === 'ar' ? 'إشعارات البنك المعلقة' : 'Pending Bank Notices'}
        </Text>

        {notices.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color={theme.success} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'جميع الإشعارات مطابقة' : 'All notices matched'}
            </Text>
          </View>
        ) : (
          notices.map((notice) => (
            <View
              key={notice.id}
              style={[styles.noticeCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            >
              <View style={[styles.noticeHeader, isRtl && styles.rowReverse]}>
                <View style={[styles.noticeInfo, isRtl && { alignItems: 'flex-end' }]}>
                  <Text style={[styles.invoiceNumber, { color: theme.text }, isRtl && styles.textRtl]}>
                    {notice.invoiceNumber}
                  </Text>
                  <Text style={[styles.supplierName, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                    {isRtl ? (notice.supplierNameAr || notice.supplier) : notice.supplier}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: theme.warningBackground }]}>
                  <Ionicons name="time-outline" size={14} color={theme.warning} />
                  <Text style={[styles.statusText, { color: theme.warning }]}>
                    {locale === 'ar' ? 'معلق' : 'Pending'}
                  </Text>
                </View>
              </View>

              <View style={[styles.noticeDetails, { borderTopColor: theme.border }]}>
                <View style={[styles.detailRow, isRtl && styles.rowReverse]}>
                  <Text style={[styles.detailLabel, { color: theme.textMuted }]}>
                    {locale === 'ar' ? 'المبلغ' : 'Amount'}
                  </Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {notice.amount.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
                  </Text>
                </View>
                <View style={[styles.detailRow, isRtl && styles.rowReverse]}>
                  <Text style={[styles.detailLabel, { color: theme.textMuted }]}>
                    {locale === 'ar' ? 'التاريخ' : 'Date'}
                  </Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {notice.createdAt}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.matchButton, { backgroundColor: theme.primary }]}
                onPress={() => openMatchModal(notice)}
              >
                <Ionicons name="link" size={18} color="#fff" />
                <Text style={styles.matchButtonText}>
                  {t('matchNotice', locale)}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      {/* Match Modal */}
      <Modal
        visible={showMatchModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMatchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {t('matchOperationNumber', locale)}
              </Text>
              <TouchableOpacity onPress={() => setShowMatchModal(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedNotice && (
              <View style={styles.modalBody}>
                <View style={[styles.selectedInvoice, { backgroundColor: theme.backgroundSecondary }]}>
                  <Text style={[styles.selectedLabel, { color: theme.textSecondary }]}>
                    {locale === 'ar' ? 'الفاتورة' : 'Invoice'}
                  </Text>
                  <Text style={[styles.selectedValue, { color: theme.text }]}>
                    {selectedNotice.invoiceNumber}
                  </Text>
                  <Text style={[styles.selectedAmount, { color: theme.primary }]}>
                    {selectedNotice.amount.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
                  </Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.text }, isRtl && styles.textRtl]}>
                    {locale === 'ar' ? 'رقم العملية' : 'Operation Number'}
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      { 
                        backgroundColor: theme.input, 
                        borderColor: theme.inputBorder,
                        color: theme.text,
                      },
                      isRtl && styles.inputRtl,
                    ]}
                    placeholder={locale === 'ar' ? 'أدخل رقم العملية البنكية' : 'Enter bank operation number'}
                    placeholderTextColor={theme.inputPlaceholder}
                    value={operationNumber}
                    onChangeText={setOperationNumber}
                    keyboardType="default"
                    autoCapitalize="characters"
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.confirmButton, 
                    { backgroundColor: theme.primary },
                    matching && { opacity: 0.6 }
                  ]}
                  onPress={handleMatch}
                  disabled={matching}
                >
                  {matching ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      <Text style={styles.confirmButtonText}>
                        {locale === 'ar' ? 'تأكيد المطابقة' : 'Confirm Match'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
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
  headerCard: {
    padding: 20,
    margin: 16,
    marginBottom: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 8,
  },
  summaryCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginVertical: 12,
  },
  noticeCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  noticeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  noticeInfo: {
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  noticeDetails: {
    paddingTop: 12,
    borderTopWidth: 1,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 13,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  matchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  matchButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalBody: {
    padding: 16,
  },
  selectedInvoice: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  selectedLabel: {
    fontSize: 12,
  },
  selectedValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  selectedAmount: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  inputRtl: {
    textAlign: 'right',
  },
  textRtl: {
    textAlign: 'right',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
