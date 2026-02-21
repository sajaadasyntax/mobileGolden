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
  Image,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

const { width: screenWidth } = Dimensions.get('window');

type StatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

interface BankPayment {
  id: string;
  user: { id: string; name: string; email?: string };
  bankAccount: { bankName: string; accountNumber: string };
  amountSdg: number;
  transactionId?: string;
  receiptImageUrl?: string;
  description?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export default function BankTransactionsScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';

  const [payments, setPayments] = useState<BankPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedPayment, setSelectedPayment] = useState<BankPayment | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    loadPayments();
  }, [statusFilter]);

  const loadPayments = async () => {
    try {
      const result = await api.accounting.bankPayments.list({
        page: 1,
        pageSize: 50,
        ...(statusFilter !== 'ALL' && { status: statusFilter }),
      });
      const data = result?.data || result || [];
      setPayments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load bank payments:', error);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPayments();
    setRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US').format(amount);
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { color: theme.warning, label: t('pending', locale) };
      case 'APPROVED':
        return { color: theme.success, label: t('approved', locale) };
      case 'REJECTED':
        return { color: theme.error, label: t('rejected', locale) };
      default:
        return { color: theme.textSecondary, label: status };
    }
  };

  const handlePaymentPress = (payment: BankPayment) => {
    setSelectedPayment(payment);
    setShowDetailModal(true);
  };

  const handleApprove = async () => {
    if (!selectedPayment) return;
    setUpdatingStatus(true);
    try {
      await api.accounting.bankPayments.updateStatus(selectedPayment.id, 'APPROVED');
      Alert.alert(t('success', locale), locale === 'ar' ? 'تم اعتماد الدفعة' : 'Payment approved');
      setShowDetailModal(false);
      setSelectedPayment(null);
      await loadPayments();
    } catch (error: any) {
      Alert.alert(t('error', locale), error.message || 'Failed to approve');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleReject = async () => {
    if (!selectedPayment) return;
    Alert.alert(
      t('rejected', locale),
      locale === 'ar' ? 'هل أنت متأكد من رفض هذه الدفعة؟' : 'Are you sure you want to reject this payment?',
      [
        { text: t('cancel', locale), style: 'cancel' },
        {
          text: t('rejected', locale),
          style: 'destructive',
          onPress: async () => {
            setUpdatingStatus(true);
            try {
              await api.accounting.bankPayments.updateStatus(selectedPayment.id, 'REJECTED');
              Alert.alert(t('success', locale), locale === 'ar' ? 'تم رفض الدفعة' : 'Payment rejected');
              setShowDetailModal(false);
              setSelectedPayment(null);
              await loadPayments();
            } catch (error: any) {
              Alert.alert(t('error', locale), error.message || 'Failed to reject');
            } finally {
              setUpdatingStatus(false);
            }
          },
        },
      ]
    );
  };

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: t('all', locale) },
    { key: 'PENDING', label: t('pending', locale) },
    { key: 'APPROVED', label: t('approved', locale) },
    { key: 'REJECTED', label: t('rejected', locale) },
  ];

  const renderPaymentCard = ({ item }: { item: BankPayment }) => {
    const statusConfig = getStatusConfig(item.status);
    return (
      <TouchableOpacity
        style={[
          styles.card,
          { backgroundColor: theme.card },
          isRtl && styles.cardRtl,
        ]}
        onPress={() => handlePaymentPress(item)}
      >
        <View style={[styles.cardContent, isRtl && styles.cardContentRtl]}>
          <View style={[styles.cardHeader, isRtl && styles.cardHeaderRtl]}>
            <Text style={[styles.userName, { color: theme.text }, isRtl && styles.textRtl]} numberOfLines={1}>
              {item.user?.name || '-'}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + '25' }]}>
              <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
            </View>
          </View>
          <Text style={[styles.bankInfo, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {item.bankAccount?.bankName || '-'} • {item.bankAccount?.accountNumber || '-'}
          </Text>
          {item.transactionId && (
            <Text style={[styles.transactionId, { color: theme.textMuted }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'رقم العملية: ' : 'Transaction: '}{item.transactionId}
            </Text>
          )}
          <Text style={[styles.dateText, { color: theme.textMuted }, isRtl && styles.textRtl]}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
        <View style={[styles.amountWrapper, isRtl && styles.amountWrapperRtl]}>
          <Text style={[styles.amountText, { color: theme.text }]}>
            {formatAmount(Number(item.amountSdg))}
          </Text>
          <Text style={[styles.currencyLabel, { color: theme.textSecondary }]}>
            {locale === 'ar' ? 'ج.س' : 'SDG'}
          </Text>
        </View>
      </TouchableOpacity>
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
      {/* Filter Tabs */}
      <View style={[styles.tabsRow, isRtl && styles.tabsRowRtl]}>
        {filterTabs.map((tab) => {
          const isActive = statusFilter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                {
                  backgroundColor: isActive ? theme.primary : theme.card,
                  borderColor: theme.border,
                },
                isRtl && styles.tabRtl,
              ]}
              onPress={() => setStatusFilter(tab.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: isActive ? theme.textInverse : theme.text },
                  isRtl && styles.textRtl,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Payments List */}
      <FlatList
        data={payments}
        keyExtractor={(item) => item.id}
        renderItem={renderPaymentCard}
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
            <Ionicons name="card-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {t('noData', locale)}
            </Text>
          </View>
        }
      />

      {/* Detail Modal */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Header */}
              <View style={[styles.modalHeader, { borderBottomColor: theme.border }, isRtl && styles.modalHeaderRtl]}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {locale === 'ar' ? 'تفاصيل الدفعة البنكية' : 'Bank Payment Details'}
                </Text>
                <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                  <Ionicons name="close" size={28} color={theme.text} />
                </TouchableOpacity>
              </View>

              {selectedPayment && (
                <>
                  {/* Receipt Image */}
                  {selectedPayment.receiptImageUrl && (
                    <View style={[styles.receiptSection, { backgroundColor: theme.card }]}>
                      <Image
                        source={{ uri: selectedPayment.receiptImageUrl }}
                        style={styles.receiptImage}
                        resizeMode="contain"
                      />
                    </View>
                  )}

                  {/* Details */}
                  <View style={[styles.detailSection, { backgroundColor: theme.card }]}>
                    <DetailRow
                      label={t('name', locale)}
                      value={selectedPayment.user?.name || '-'}
                      theme={theme}
                      isRtl={isRtl}
                    />
                    <DetailRow
                      label={locale === 'ar' ? 'البريد' : 'Email'}
                      value={selectedPayment.user?.email || '-'}
                      theme={theme}
                      isRtl={isRtl}
                    />
                    <DetailRow
                      label={locale === 'ar' ? 'البنك والحساب' : 'Bank & Account'}
                      value={`${selectedPayment.bankAccount?.bankName || '-'} • ${selectedPayment.bankAccount?.accountNumber || '-'}`}
                      theme={theme}
                      isRtl={isRtl}
                    />
                    <DetailRow
                      label={t('amount', locale)}
                      value={`${formatAmount(Number(selectedPayment.amountSdg))} ${locale === 'ar' ? 'ج.س' : 'SDG'}`}
                      theme={theme}
                      isRtl={isRtl}
                    />
                    {selectedPayment.description && (
                      <DetailRow
                        label={t('description', locale)}
                        value={selectedPayment.description}
                        theme={theme}
                        isRtl={isRtl}
                      />
                    )}
                    {selectedPayment.transactionId && (
                      <DetailRow
                        label={locale === 'ar' ? 'رقم العملية' : 'Transaction ID'}
                        value={selectedPayment.transactionId}
                        theme={theme}
                        isRtl={isRtl}
                      />
                    )}
                    <DetailRow
                      label={t('date', locale)}
                      value={formatDate(selectedPayment.createdAt)}
                      theme={theme}
                      isRtl={isRtl}
                    />
                    <View style={[styles.statusRow, isRtl && styles.statusRowRtl]}>
                      <Text style={[styles.detailLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                        {t('status', locale)}:
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusConfig(selectedPayment.status).color + '25' }]}>
                        <Text style={[styles.statusText, { color: getStatusConfig(selectedPayment.status).color }]}>
                          {getStatusConfig(selectedPayment.status).label}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Approve/Reject Buttons */}
                  {selectedPayment.status === 'PENDING' && (
                    <View style={[styles.actionRow, isRtl && styles.actionRowRtl]}>
                      <TouchableOpacity
                        style={[styles.rejectBtn, { backgroundColor: theme.errorBackground, borderColor: theme.error }]}
                        onPress={handleReject}
                        disabled={updatingStatus}
                      >
                        <Ionicons name="close-circle" size={20} color={theme.error} />
                        <Text style={[styles.actionBtnText, { color: theme.error }]}>{t('rejected', locale)}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.approveBtn, { backgroundColor: theme.successBackground, borderColor: theme.success }]}
                        onPress={handleApprove}
                        disabled={updatingStatus}
                      >
                        {updatingStatus ? (
                          <ActivityIndicator size="small" color={theme.success} />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={20} color={theme.success} />
                            <Text style={[styles.actionBtnText, { color: theme.success }]}>{t('approved', locale)}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DetailRow({
  label,
  value,
  theme,
  isRtl,
}: {
  label: string;
  value: string;
  theme: any;
  isRtl: boolean;
}) {
  return (
    <View style={[styles.detailRow, isRtl && styles.detailRowRtl]}>
      <Text style={[styles.detailLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>{label}</Text>
      <Text style={[styles.detailValue, { color: theme.text }, isRtl && styles.textRtl]}>{value}</Text>
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
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tabsRowRtl: {
    flexDirection: 'row-reverse',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  tabRtl: {
    flexDirection: 'row-reverse',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardRtl: {
    flexDirection: 'row-reverse',
  },
  cardContent: {
    flex: 1,
    marginRight: 16,
  },
  cardContentRtl: {
    marginRight: 0,
    marginLeft: 16,
    alignItems: 'flex-end',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  bankInfo: {
    fontSize: 13,
    marginTop: 4,
  },
  transactionId: {
    fontSize: 12,
    marginTop: 2,
  },
  dateText: {
    fontSize: 11,
    marginTop: 4,
  },
  amountWrapper: {
    alignItems: 'flex-end',
  },
  amountWrapperRtl: {
    alignItems: 'flex-start',
  },
  amountText: {
    fontSize: 18,
    fontWeight: '700',
  },
  currencyLabel: {
    fontSize: 12,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    maxHeight: '90%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  receiptSection: {
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 200,
  },
  receiptImage: {
    width: screenWidth - 64,
    height: 320,
    borderRadius: 12,
  },
  detailSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  detailRowRtl: {
    flexDirection: 'row-reverse',
  },
  detailLabel: {
    fontSize: 12,
    flex: 0.35,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 0.65,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  statusRowRtl: {
    flexDirection: 'row-reverse',
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 8,
  },
  actionRowRtl: {
    flexDirection: 'row-reverse',
  },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 8,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 8,
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
