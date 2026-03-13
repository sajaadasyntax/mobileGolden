import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { api, getFullUrl } from '@/lib/api';
import { useRouter } from 'expo-router';

interface BankPayment {
  id: string;
  amountSdg: number;
  receiptImageUrl: string;
  receiptImageUrls?: string[];
  transactionNumber?: string;
  description?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  user: { id: string; name: string; email: string };
  bankAccount: { id: string; bankName: string; accountNumber: string };
}

const statusColors = {
  PENDING: '#f59e0b',
  APPROVED: '#10b981',
  REJECTED: '#ef4444',
};

export default function BankPaymentsScreen() {
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';

  const [payments, setPayments] = useState<BankPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<BankPayment | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadPayments = async () => {
    try {
      const result = await api.accounting.bankPayments.list({ pageSize: 50 });
      const data = result?.data || result || [];
      setPayments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load bank payments:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadPayments();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPayments();
    setRefreshing(false);
  };

  const handleUpdateStatus = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selectedPayment) return;
    const label = status === 'APPROVED'
      ? (locale === 'ar' ? 'قبول' : 'approve')
      : (locale === 'ar' ? 'رفض' : 'reject');

    Alert.alert(
      locale === 'ar' ? 'تأكيد' : 'Confirm',
      locale === 'ar'
        ? `هل تريد ${label} هذه الدفعة؟`
        : `Are you sure you want to ${label} this payment?`,
      [
        { text: locale === 'ar' ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: locale === 'ar' ? 'تأكيد' : 'Confirm',
          style: status === 'REJECTED' ? 'destructive' : 'default',
          onPress: async () => {
            setUpdatingStatus(true);
            try {
              await api.accounting.bankPayments.updateStatus(selectedPayment.id, status);
              Alert.alert(
                locale === 'ar' ? 'نجح' : 'Success',
                locale === 'ar' ? 'تم تحديث الحالة' : 'Status updated'
              );
              setShowDetailModal(false);
              loadPayments();
            } catch (error: any) {
              Alert.alert(
                locale === 'ar' ? 'خطأ' : 'Error',
                error?.message || (locale === 'ar' ? 'فشل التحديث' : 'Update failed')
              );
            } finally {
              setUpdatingStatus(false);
            }
          },
        },
      ]
    );
  };

  const formatAmount = (amount: number) =>
    `${Number(amount).toLocaleString()} ${locale === 'ar' ? 'ج.س' : 'SDG'}`;

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });

  const getStatusLabel = (status: string) => {
    if (locale === 'ar') {
      return status === 'PENDING' ? 'معلق' : status === 'APPROVED' ? 'مقبول' : 'مرفوض';
    }
    return status.charAt(0) + status.slice(1).toLowerCase();
  };

  const renderPayment = ({ item }: { item: BankPayment }) => {
    const color = statusColors[item.status] || theme.textSecondary;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.card }]}
        onPress={() => { setSelectedPayment(item); setShowDetailModal(true); }}
      >
        <View style={[styles.cardIcon, { backgroundColor: color + '15' }]}>
          <Ionicons name="card-outline" size={24} color={color} />
        </View>
        <View style={[styles.cardContent, isRtl && styles.cardContentRtl]}>
          <View style={[styles.cardHeader, isRtl && styles.rowReverse]}>
            <Text style={[styles.cardUser, { color: theme.text }, isRtl && styles.textRtl]}>
              {item.user.name}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: color + '20' }]}>
              <Text style={[styles.statusText, { color }]}>
                {getStatusLabel(item.status)}
              </Text>
            </View>
          </View>
          <Text style={[styles.cardBank, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {item.bankAccount.bankName} • {item.bankAccount.accountNumber}
          </Text>
          <View style={[styles.cardMeta, isRtl && styles.rowReverse]}>
            <Text style={[styles.cardDate, { color: theme.textMuted }]}>
              {formatDate(item.createdAt)}
            </Text>
            {item.receiptImageUrl && (
              <View style={[styles.receiptBadge, { backgroundColor: theme.primary + '20' }]}>
                <Ionicons name="image-outline" size={12} color={theme.primary} />
                <Text style={[styles.receiptBadgeText, { color: theme.primary }]}>
                  {locale === 'ar' ? 'إيصال' : 'Receipt'}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={[styles.cardAmount, isRtl && styles.cardAmountRtl]}>
          <Text style={[styles.amountValue, { color: theme.text }]}>
            {formatAmount(item.amountSdg)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (!['ADMIN', 'MANAGER'].includes(user?.role || '')) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <Ionicons name="lock-closed" size={48} color={theme.textSecondary} />
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          {locale === 'ar' ? 'غير مصرح' : 'Access Denied'}
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.surface }]}>
        <Text style={[styles.headerTitle, { color: theme.text }, isRtl && styles.textRtl]}>
          {locale === 'ar' ? 'دفعات البنك' : 'Bank Payments'}
        </Text>
        <Text style={[styles.headerSubtitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
          {payments.length} {locale === 'ar' ? 'دفعة' : 'payments'}
        </Text>
      </View>

      <FlatList
        data={payments}
        keyExtractor={(item) => item.id}
        renderItem={renderPayment}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="card-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'لا توجد دفعات' : 'No bank payments'}
            </Text>
          </View>
        }
      />

      {/* Detail Modal */}
      <Modal
        visible={showDetailModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDetailModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDetailModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {locale === 'ar' ? 'تفاصيل الدفعة' : 'Payment Details'}
              </Text>
              <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {selectedPayment && (
                <>
                  {/* Status */}
                  <View style={[styles.detailRow, isRtl && styles.rowReverse]}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'الحالة' : 'Status'}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: (statusColors[selectedPayment.status] || theme.textSecondary) + '20' }]}>
                      <Text style={[styles.statusText, { color: statusColors[selectedPayment.status] || theme.textSecondary }]}>
                        {getStatusLabel(selectedPayment.status)}
                      </Text>
                    </View>
                  </View>

                  {/* Amount */}
                  <View style={[styles.detailRow, isRtl && styles.rowReverse]}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'المبلغ' : 'Amount'}
                    </Text>
                    <Text style={[styles.detailValue, { color: theme.success }]}>
                      {formatAmount(selectedPayment.amountSdg)}
                    </Text>
                  </View>

                  {/* User */}
                  <View style={[styles.detailRow, isRtl && styles.rowReverse]}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'المستخدم' : 'User'}
                    </Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>
                      {selectedPayment.user.name}
                    </Text>
                  </View>

                  {/* Bank */}
                  <View style={[styles.detailRow, isRtl && styles.rowReverse]}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'البنك' : 'Bank'}
                    </Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>
                      {selectedPayment.bankAccount.bankName}
                    </Text>
                  </View>

                  {/* Account Number */}
                  <View style={[styles.detailRow, isRtl && styles.rowReverse]}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'رقم الحساب' : 'Account #'}
                    </Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>
                      {selectedPayment.bankAccount.accountNumber}
                    </Text>
                  </View>

                  {/* Description */}
                  {selectedPayment.description && (
                    <View style={[styles.detailRow, isRtl && styles.rowReverse]}>
                      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                        {locale === 'ar' ? 'الوصف' : 'Description'}
                      </Text>
                      <Text style={[styles.detailValue, { color: theme.text, flex: 1, textAlign: isRtl ? 'right' : 'left' }]}>
                        {selectedPayment.description}
                      </Text>
                    </View>
                  )}

                  {/* Date */}
                  <View style={[styles.detailRow, isRtl && styles.rowReverse]}>
                    <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'التاريخ' : 'Date'}
                    </Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>
                      {formatDate(selectedPayment.createdAt)}
                    </Text>
                  </View>

                  {/* Transaction Number */}
                  {selectedPayment.transactionNumber && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                        {locale === 'ar' ? 'رقم المعاملة' : 'Transaction #'}
                      </Text>
                      <Text style={[styles.detailValue, { color: theme.text }]}>
                        {selectedPayment.transactionNumber}
                      </Text>
                    </View>
                  )}

                  {/* Receipt Images */}
                  {(() => {
                    const images = (selectedPayment.receiptImageUrls?.length
                      ? selectedPayment.receiptImageUrls
                      : selectedPayment.receiptImageUrl ? [selectedPayment.receiptImageUrl] : []);
                    return images.length > 0 ? (
                      <View style={styles.receiptSection}>
                        <Text style={[styles.receiptLabel, { color: theme.textSecondary }]}>
                          {locale === 'ar' ? 'صور الإيصال' : 'Receipt Images'}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          {images.map((img, idx) => (
                            <TouchableOpacity
                              key={idx}
                              onPress={() => setShowReceiptModal(true)}
                              activeOpacity={0.8}
                              style={{ marginRight: 8 }}
                            >
                              <Image
                                source={{ uri: getFullUrl(img) }}
                                style={styles.receiptThumbnail}
                                resizeMode="cover"
                              />
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null;
                  })()}

                  {/* Action buttons for PENDING payments */}
                  {selectedPayment.status === 'PENDING' && (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: theme.success }]}
                        onPress={() => handleUpdateStatus('APPROVED')}
                        disabled={updatingStatus}
                      >
                        {updatingStatus ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                            <Text style={styles.actionBtnText}>
                              {locale === 'ar' ? 'قبول' : 'Approve'}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: theme.error }]}
                        onPress={() => handleUpdateStatus('REJECTED')}
                        disabled={updatingStatus}
                      >
                        {updatingStatus ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="close-circle-outline" size={18} color="#fff" />
                            <Text style={styles.actionBtnText}>
                              {locale === 'ar' ? 'رفض' : 'Reject'}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Full Receipt Images Modal */}
      <Modal
        visible={showReceiptModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReceiptModal(false)}
      >
        <View style={styles.receiptModalOverlay}>
          <TouchableOpacity
            style={styles.receiptModalClose}
            onPress={() => setShowReceiptModal(false)}
          >
            <Ionicons name="close-circle" size={40} color="#fff" />
          </TouchableOpacity>
          {selectedPayment && (() => {
            const images = (selectedPayment.receiptImageUrls?.length
              ? selectedPayment.receiptImageUrls
              : selectedPayment.receiptImageUrl ? [selectedPayment.receiptImageUrl] : []);
            return (
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width: Dimensions.get('window').width }}>
                {images.map((img, idx) => (
                  <View key={idx} style={[styles.receiptPage, { width: Dimensions.get('window').width }]}>
                    <Image
                      source={{ uri: getFullUrl(img) }}
                      style={styles.receiptFullImage}
                      resizeMode="contain"
                    />
                  </View>
                ))}
              </ScrollView>
            );
          })()}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', marginBottom: 2 },
  headerSubtitle: { fontSize: 13 },
  listContent: { padding: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: { flex: 1 },
  cardContentRtl: { alignItems: 'flex-end' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  rowReverse: { flexDirection: 'row-reverse' },
  textRtl: { textAlign: 'right' },
  cardUser: { fontSize: 15, fontWeight: '600', flex: 1 },
  cardBank: { fontSize: 12, marginBottom: 4 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardDate: { fontSize: 11 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700' },
  receiptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  receiptBadgeText: { fontSize: 10, fontWeight: '600' },
  cardAmount: { alignItems: 'flex-end' },
  cardAmountRtl: { alignItems: 'flex-start' },
  amountValue: { fontSize: 14, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, marginTop: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalBody: { padding: 20 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  detailLabel: { fontSize: 13, fontWeight: '500' },
  detailValue: { fontSize: 14, fontWeight: '600' },
  receiptSection: { marginTop: 16 },
  receiptLabel: { fontSize: 13, fontWeight: '500', marginBottom: 10 },
  receiptThumbnail: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  viewFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
    gap: 6,
  },
  viewFullText: { fontSize: 13, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  receiptModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  receiptModalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  receiptPage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  receiptFullImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.8,
  },
});
