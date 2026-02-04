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

interface Transaction {
  id: string;
  transactionType: 'CASH_IN' | 'CASH_OUT' | 'BANK_IN' | 'BANK_OUT' | 'TRANSFER' | 'ADJUSTMENT';
  amountSdg: number;
  description: string;
  referenceNumber?: string;
  createdAt: string;
  fromAccount?: { nameEn: string; nameAr?: string; code?: string };
  toAccount?: { nameEn: string; nameAr?: string; code?: string };
  receiptImages?: string[];
}

export default function TransactionsScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({ totalIn: 0, totalOut: 0 });
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    loadTransactions();
  }, [user?.branchId]);

  const loadTransactions = async () => {
    try {
      if (!user?.branchId) return;
      
      const result = await api.accounting.transactions.list(user.branchId, { pageSize: 50 });
      const data = result?.data || result || [];
      setTransactions(data);
      
      // Calculate summary
      let totalIn = 0;
      let totalOut = 0;
      data.forEach((txn: Transaction) => {
        const amount = Number(txn.amountSdg) || 0;
        if (['CASH_IN', 'BANK_IN'].includes(txn.transactionType)) {
          totalIn += amount;
        } else if (['CASH_OUT', 'BANK_OUT'].includes(txn.transactionType)) {
          totalOut += amount;
        } else if (txn.transactionType === 'TRANSFER') {
          // For transfers, count the destination account as "in"
          // Transfer from cash to bank = bank receives (BANK_IN)
          // Transfer from bank to cash = cash receives (CASH_IN)
          if (txn.toAccount) {
            const toAccountName = (locale === 'ar' ? txn.toAccount.nameAr : txn.toAccount.nameEn) || txn.toAccount.nameEn || '';
            const toAccountCode = txn.toAccount.code || '';
            const toAccountLower = toAccountName.toLowerCase();
            
            // Check by account code first (more reliable)
            if (toAccountCode === '1100' || toAccountLower.includes('bank') || toAccountLower.includes('بنك')) {
              totalIn += amount; // Transfer to bank counts as deposit
            } else if (toAccountCode === '1000' || toAccountLower.includes('cash') || toAccountLower.includes('نقد')) {
              totalIn += amount; // Transfer to cash counts as deposit
            } else {
              // If we can't determine, count as "in" since money is being moved to an account
              totalIn += amount;
            }
          } else if (txn.fromAccount) {
            // If no toAccount but we have fromAccount, it's still a transfer
            // We could count it as "out" from source, but for simplicity, count as "in" to destination
            // This is a fallback case
            totalIn += amount;
          }
        }
      });
      setSummary({ totalIn, totalOut });
    } catch (error) {
      console.error('Failed to load transactions:', error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  };

  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'CASH_IN':
      case 'BANK_IN':
        return { icon: 'arrow-down', color: theme.success, label: locale === 'ar' ? 'إيداع' : 'Deposit' };
      case 'CASH_OUT':
      case 'BANK_OUT':
        return { icon: 'arrow-up', color: theme.error, label: locale === 'ar' ? 'سحب' : 'Withdrawal' };
      case 'TRANSFER':
        return { icon: 'swap-horizontal', color: theme.info, label: locale === 'ar' ? 'تحويل' : 'Transfer' };
      case 'ADJUSTMENT':
        return { icon: 'create', color: theme.warning, label: locale === 'ar' ? 'تعديل' : 'Adjustment' };
      default:
        return { icon: 'cash', color: theme.textSecondary, label: type };
    }
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

  const handleViewReceipts = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setCurrentImageIndex(0);
    setShowReceiptModal(true);
  };

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const typeConfig = getTypeConfig(item.transactionType);
    const isIncome = ['CASH_IN', 'BANK_IN'].includes(item.transactionType);
    const hasReceipts = item.receiptImages && item.receiptImages.length > 0;
    
    return (
      <TouchableOpacity 
        style={[
          styles.transactionCard, 
          { backgroundColor: theme.card },
          isRtl && styles.transactionCardRtl
        ]}
        onPress={() => hasReceipts && handleViewReceipts(item)}
      >
        <View style={[styles.transactionIcon, { backgroundColor: typeConfig.color + '15' }]}>
          <Ionicons name={typeConfig.icon as any} size={24} color={typeConfig.color} />
        </View>
        <View style={[styles.transactionContent, isRtl && styles.transactionContentRtl]}>
          <View style={[styles.transactionHeader, isRtl && styles.transactionHeaderRtl]}>
            <Text style={[styles.transactionRef, { color: theme.text }, isRtl && styles.textRtl]}>
              {item.referenceNumber || `TXN-${item.id.substring(0, 8).toUpperCase()}`}
            </Text>
            <View style={[styles.typeBadge, { backgroundColor: typeConfig.color + '20' }]}>
              <Text style={[styles.typeText, { color: typeConfig.color }]}>{typeConfig.label}</Text>
            </View>
            {hasReceipts && (
              <View style={[styles.receiptBadge, { backgroundColor: theme.primary + '20' }]}>
                <Ionicons name="receipt" size={12} color={theme.primary} />
                <Text style={[styles.receiptCount, { color: theme.primary }]}>
                  {item.receiptImages.length}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.transactionDesc, { color: theme.text }, isRtl && styles.textRtl]}>
            {item.description}
          </Text>
          {(item.fromAccount || item.toAccount) && (
            <Text style={[styles.transactionParty, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {item.fromAccount && (locale === 'ar' ? item.fromAccount.nameAr || item.fromAccount.nameEn : item.fromAccount.nameEn)}
              {item.fromAccount && item.toAccount && ' → '}
              {item.toAccount && (locale === 'ar' ? item.toAccount.nameAr || item.toAccount.nameEn : item.toAccount.nameEn)}
            </Text>
          )}
          <Text style={[styles.transactionDate, { color: theme.textMuted }, isRtl && styles.textRtl]}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
        <View style={[styles.amountContainer, isRtl && styles.amountContainerRtl]}>
          <Text style={[styles.amountValue, isIncome ? { color: theme.success } : { color: theme.error }]}>
            {isIncome ? '+' : '-'}{formatAmount(Number(item.amountSdg))}
          </Text>
          <Text style={[styles.currencyText, { color: theme.textSecondary }]}>
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
      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: theme.success + '15', borderColor: theme.success + '30' }]}>
          <Ionicons name="arrow-down" size={20} color={theme.success} />
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'الإيداعات' : 'Deposits'}
          </Text>
          <Text style={[styles.summaryValue, { color: theme.text }]}>{formatAmount(summary.totalIn)} SDG</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: theme.error + '15', borderColor: theme.error + '30' }]}>
          <Ionicons name="arrow-up" size={20} color={theme.error} />
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'المسحوبات' : 'Withdrawals'}
          </Text>
          <Text style={[styles.summaryValue, { color: theme.text }]}>{formatAmount(summary.totalOut)} SDG</Text>
        </View>
      </View>

      {/* Transactions List */}
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTransaction}
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
            <Ionicons name="swap-horizontal-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noData', locale)}</Text>
          </View>
        }
      />

      {/* Receipt Images Modal */}
      <Modal
        visible={showReceiptModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowReceiptModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
            {/* Header */}
            <View style={[styles.modalHeader, isRtl && styles.modalHeaderRtl]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {locale === 'ar' ? 'إيصالات التحويل' : 'Transaction Receipts'}
              </Text>
              <TouchableOpacity onPress={() => setShowReceiptModal(false)}>
                <Ionicons name="close" size={28} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Transaction Info */}
            {selectedTransaction && (
              <View style={[styles.transactionInfo, { backgroundColor: theme.card }]}>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                  {selectedTransaction.referenceNumber || `TXN-${selectedTransaction.id.substring(0, 8).toUpperCase()}`}
                </Text>
                <Text style={[styles.infoAmount, { color: theme.text }]}>
                  {formatAmount(Number(selectedTransaction.amountSdg))} SDG
                </Text>
                <Text style={[styles.infoDesc, { color: theme.textSecondary }]}>
                  {selectedTransaction.description}
                </Text>
              </View>
            )}

            {/* Image Carousel */}
            {selectedTransaction?.receiptImages && selectedTransaction.receiptImages.length > 0 && (
              <ScrollView 
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) => {
                  const newIndex = Math.round(event.nativeEvent.contentOffset.x / (screenWidth - 40));
                  setCurrentImageIndex(newIndex);
                }}
                style={styles.imageScroll}
              >
                {selectedTransaction.receiptImages.map((imageUri, index) => (
                  <View key={index} style={styles.imageContainer}>
                    <Image
                      source={{ uri: imageUri }}
                      style={styles.receiptImage}
                      resizeMode="contain"
                    />
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Image Counter */}
            {selectedTransaction?.receiptImages && selectedTransaction.receiptImages.length > 1 && (
              <View style={styles.imageCounter}>
                <Text style={[styles.counterText, { color: theme.text }]}>
                  {currentImageIndex + 1} / {selectedTransaction.receiptImages.length}
                </Text>
              </View>
            )}

            {/* Pagination Dots */}
            {selectedTransaction?.receiptImages && selectedTransaction.receiptImages.length > 1 && (
              <View style={styles.pagination}>
                {selectedTransaction.receiptImages.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.paginationDot,
                      {
                        backgroundColor: index === currentImageIndex ? theme.primary : theme.textMuted,
                        opacity: index === currentImageIndex ? 1 : 0.3,
                      },
                    ]}
                  />
                ))}
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
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  summaryLabel: {
    fontSize: 12,
    marginTop: 8,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  transactionCardRtl: {
    flexDirection: 'row-reverse',
  },
  transactionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionContent: {
    flex: 1,
    marginLeft: 12,
  },
  transactionContentRtl: {
    marginLeft: 0,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  transactionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  transactionHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  transactionRef: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  transactionDesc: {
    fontSize: 13,
    marginTop: 4,
  },
  transactionParty: {
    fontSize: 12,
    marginTop: 2,
  },
  transactionDate: {
    fontSize: 11,
    marginTop: 4,
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
  receiptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  receiptCount: {
    fontSize: 10,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: screenWidth - 40,
    maxHeight: '90%',
    borderRadius: 20,
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
  modalHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  transactionInfo: {
    padding: 16,
    margin: 16,
    borderRadius: 12,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  infoAmount: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },
  infoDesc: {
    fontSize: 14,
    marginTop: 4,
  },
  imageScroll: {
    flex: 1,
  },
  imageContainer: {
    width: screenWidth - 40,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  receiptImage: {
    width: '100%',
    height: 400,
    borderRadius: 12,
  },
  imageCounter: {
    padding: 12,
    alignItems: 'center',
  },
  counterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 20,
    gap: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
