import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface AssetAccount {
  id: string;
  name: string;
  nameAr?: string;
  balance: number;
  accountType: string;
}

const accountIcons: Record<string, { icon: string; color: string }> = {
  CASH: { icon: 'cash', color: '#10b981' },
  BANK: { icon: 'business', color: '#8b5cf6' },
  MOBILE_MONEY: { icon: 'phone-portrait', color: '#f59e0b' },
  default: { icon: 'wallet', color: '#3b82f6' },
};

export default function LiquidAssetsScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accounts, setAccounts] = useState<AssetAccount[]>([]);
  const [dailyStats, setDailyStats] = useState({ income: 0, expenses: 0 });
  const [accountsReceivable, setAccountsReceivable] = useState(0);
  const [accountsPayable, setAccountsPayable] = useState(0);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [cashBalance, setCashBalance] = useState(0);
  const [bankBalance, setBankBalance] = useState(0);
  const [cashAccountId, setCashAccountId] = useState<string | null>(null);
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [capitalAccountId, setCapitalAccountId] = useState<string | null>(null);
  
  // Modal states
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showCapitalModal, setShowCapitalModal] = useState(false);
  const [transferDirection, setTransferDirection] = useState<'cashToBank' | 'bankToCash'>('cashToBank');
  const [capitalSource, setCapitalSource] = useState<'cash' | 'bank'>('cash');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [processing, setProcessing] = useState(false);
  const [receiptImages, setReceiptImages] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, [user?.branchId]);

  const loadData = async () => {
    try {
      if (!user?.branchId) return;
      
      // Load liquid assets from accounting API
      const assetsResult = await api.accounting.reports.liquidAssets(user.branchId);
      
      if (assetsResult?.accounts) {
        setAccounts(assetsResult.accounts.map((acc: any) => ({
          id: acc.account?.id || acc.id,
          name: acc.account?.nameEn || acc.name || 'Unknown',
          nameAr: acc.account?.nameAr || acc.nameAr,
          balance: Number(acc.balanceSdg || acc.balance) || 0,
          accountType: acc.account?.accountType || acc.accountType || 'default',
        })));
      }
      
      // Set inventory value
      if (assetsResult?.inventoryValue) {
        setInventoryValue(Number(assetsResult.inventoryValue.valueSdg) || 0);
      }
      
      // Set cash balance
      if (assetsResult?.cash) {
        setCashBalance(Number(assetsResult.cash.balanceSdg) || 0);
        setCashAccountId(assetsResult.cash.account?.id || null);
      }
      
      // Set Bank of Khartoum balance
      if (assetsResult?.bankOfKhartoum) {
        setBankBalance(Number(assetsResult.bankOfKhartoum.balanceSdg) || 0);
        setBankAccountId(assetsResult.bankOfKhartoum.account?.id || null);
      }
      
      // Find capital account (code "3000" or equity account)
      const capitalAccount = accounts.find(
        acc => acc.accountType === 'EQUITY' || 
        acc.name.toLowerCase().includes('equity') || 
        acc.name.toLowerCase().includes('capital')
      );
      if (capitalAccount) {
        setCapitalAccountId(capitalAccount.id);
      } else {
        // Try to get from API
        try {
          const equityAccounts = await api.accounting.accounts.list('EQUITY');
          if (equityAccounts && equityAccounts.length > 0) {
            const ownerEquity = equityAccounts.find((acc: any) => 
              acc.code === '3000' || 
              acc.nameEn.toLowerCase().includes("owner") ||
              acc.nameEn.toLowerCase().includes("equity")
            );
            if (ownerEquity) {
              setCapitalAccountId(ownerEquity.id);
            }
          }
        } catch (error) {
          console.warn('Failed to load capital account:', error);
        }
      }
      
      if (assetsResult?.dailyStats) {
        setDailyStats({
          income: Number(assetsResult.dailyStats.income) || 0,
          expenses: Number(assetsResult.dailyStats.expenses) || 0,
        });
      }
      
      // Set accounts receivable - fetch outstanding receivables to get actual remaining amounts
      let arValue = 0;
      try {
        const outstandingReceivables = await api.accounting.reports.outstandingReceivables(user.branchId);
        // Use totalReceivables from backend (now calculates remaining amounts correctly)
        if (outstandingReceivables?.totalReceivables !== undefined) {
          arValue = Number(outstandingReceivables.totalReceivables) || 0;
        } else if (outstandingReceivables?.invoices && Array.isArray(outstandingReceivables.invoices)) {
          // Fallback: Calculate from invoices if totalReceivables not available
          arValue = outstandingReceivables.invoices.reduce((sum: number, inv: any) => {
            const totalAmount = Number(inv.totalSdg || inv.amountSdg || 0);
            const paidAmount = Number(inv.paidAmountSdg || 0);
            const remaining = totalAmount - paidAmount;
            return sum + (remaining > 0 ? remaining : 0);
          }, 0);
        }
      } catch (error) {
        console.warn('Failed to load outstanding receivables, using value from liquidAssets:', error);
        // Fallback to value from liquidAssets API if available
        if (assetsResult?.accountsReceivable !== undefined) {
          arValue = Number(assetsResult.accountsReceivable) || 0;
        }
      }
      
      setAccountsReceivable(arValue);
      
      // Set accounts payable - fetch outstanding payables to get actual remaining amounts
      let apValue = 0;
      try {
        const outstandingPayables = await api.accounting.reports.outstandingPayables(user.branchId);
        // Use totalPayables from backend (now calculates remaining amounts correctly)
        if (outstandingPayables?.totalPayables !== undefined) {
          apValue = Number(outstandingPayables.totalPayables) || 0;
        } else if (outstandingPayables?.totalOutstanding !== undefined) {
          // Fallback to totalOutstanding if totalPayables not available
          apValue = Number(outstandingPayables.totalOutstanding) || 0;
        } else if (outstandingPayables?.invoices && Array.isArray(outstandingPayables.invoices)) {
          // Fallback: Calculate from invoices if totalPayables not available
          apValue = outstandingPayables.invoices.reduce((sum: number, inv: any) => {
            const totalAmount = Number(inv.totalSdg || inv.amountSdg || 0);
            const paidAmount = Number(inv.paidAmountSdg || 0);
            const remaining = totalAmount - paidAmount;
            return sum + (remaining > 0 ? remaining : 0);
          }, 0);
        }
      } catch (error) {
        console.warn('Failed to load outstanding payables:', error);
      }
      
      setAccountsPayable(apValue);
    } catch (error) {
      console.error('Failed to load liquid assets:', error);
      setAccounts([]);
      setInventoryValue(0);
      setCashBalance(0);
      setBankBalance(0);
      setCashAccountId(null);
      setBankAccountId(null);
      setAccountsReceivable(0);
      setAccountsPayable(0);
      setDailyStats({ income: 0, expenses: 0 });
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getAccountStyle = (accountType: string) => {
    return accountIcons[accountType] || accountIcons.default;
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US').format(amount);
  };

  // Total includes all accounts (which already include cash and bank) plus inventory
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0) + inventoryValue;

  const pickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (permissionResult.granted === false) {
        Alert.alert(
          locale === 'ar' ? 'تحتاج إلى إذن' : 'Permission Required',
          locale === 'ar' ? 'يجب السماح بالوصول إلى المعرض لإضافة الصور' : 'Please allow access to your photo library to add receipt images'
        );
        return;
      }

      const result = await ImagePicker.launchImagePickerAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const newImages = result.assets.map(asset => asset.uri);
        setReceiptImages([...receiptImages, ...newImages]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'فشل اختيار الصورة' : 'Failed to pick image'
      );
    }
  };

  const removeImage = (index: number) => {
    setReceiptImages(receiptImages.filter((_, i) => i !== index));
  };

  const handleTransfer = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'يرجى إدخال مبلغ صحيح' : 'Please enter a valid amount'
      );
      return;
    }

    if (!cashAccountId || !bankAccountId) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'لم يتم العثور على حسابات النقد أو البنك' : 'Cash or Bank accounts not found'
      );
      return;
    }

    setProcessing(true);
    try {
      const amountNum = parseFloat(amount);
      await api.accounting.transactions.create({
        transactionType: 'TRANSFER',
        amountSdg: amountNum,
        fromAccountId: transferDirection === 'cashToBank' ? cashAccountId : bankAccountId,
        toAccountId: transferDirection === 'cashToBank' ? bankAccountId : cashAccountId,
        description: description || (transferDirection === 'cashToBank' 
          ? (locale === 'ar' ? 'تحويل من النقد إلى البنك' : 'Transfer from Cash to Bank')
          : (locale === 'ar' ? 'تحويل من البنك إلى النقد' : 'Transfer from Bank to Cash')),
        receiptImages: receiptImages.length > 0 ? receiptImages : undefined,
      });

      setShowTransferModal(false);
      setAmount('');
      setDescription('');
      setReceiptImages([]);
      await loadData();
      Alert.alert(
        locale === 'ar' ? 'نجح' : 'Success',
        locale === 'ar' ? 'تم التحويل بنجاح' : 'Transfer completed successfully'
      );
    } catch (error: any) {
      console.error('Transfer failed:', error);
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        error?.message || (locale === 'ar' ? 'فشل التحويل' : 'Transfer failed')
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleAddToCapital = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'يرجى إدخال مبلغ صحيح' : 'Please enter a valid amount'
      );
      return;
    }

    const sourceAccountId = capitalSource === 'cash' ? cashAccountId : bankAccountId;
    if (!sourceAccountId || !capitalAccountId) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'لم يتم العثور على الحسابات المطلوبة' : 'Required accounts not found'
      );
      return;
    }

    setProcessing(true);
    try {
      const amountNum = parseFloat(amount);
      await api.accounting.transactions.create({
        transactionType: capitalSource === 'cash' ? 'CASH_OUT' : 'BANK_OUT',
        amountSdg: amountNum,
        fromAccountId: sourceAccountId,
        toAccountId: capitalAccountId,
        description: description || (locale === 'ar' 
          ? `إضافة إلى رأس المال من ${capitalSource === 'cash' ? 'النقد' : 'البنك'}`
          : `Add to Capital from ${capitalSource === 'cash' ? 'Cash' : 'Bank'}`),
        receiptImages: receiptImages.length > 0 ? receiptImages : undefined,
      });

      setShowCapitalModal(false);
      setAmount('');
      setDescription('');
      setReceiptImages([]);
      await loadData();
      Alert.alert(
        locale === 'ar' ? 'نجح' : 'Success',
        locale === 'ar' ? 'تمت الإضافة إلى رأس المال بنجاح' : 'Added to capital successfully'
      );
    } catch (error: any) {
      console.error('Add to capital failed:', error);
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        error?.message || (locale === 'ar' ? 'فشلت الإضافة إلى رأس المال' : 'Failed to add to capital')
      );
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
      }
    >
      {/* Total Summary */}
      <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.primaryBackground }]}>
        <Text style={[styles.summaryTitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
          {t('totalAssets', locale)}
        </Text>
        <View style={styles.totalRow}>
          <View style={styles.totalItem}>
            <Text style={[styles.totalCurrency, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'ج.س' : 'SDG'}
            </Text>
            <Text style={[styles.totalValue, { color: theme.text }]}>{formatAmount(totalBalance)}</Text>
          </View>
        </View>
      </View>

      {/* Key Assets Section */}
      <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
        {locale === 'ar' ? 'الأصول الرئيسية' : 'Key Assets'}
      </Text>

      {/* Inventory Value */}
      <View 
        style={[styles.accountCard, { backgroundColor: theme.card }, isRtl && styles.accountCardRtl]}
      >
        <View style={[styles.accountIcon, { backgroundColor: '#3b82f6' + '15' }]}>
          <Ionicons name="cube" size={24} color="#3b82f6" />
        </View>
        <View style={[styles.accountInfo, isRtl && styles.accountInfoRtl]}>
          <Text style={[styles.accountName, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'قيمة المخزون (الرفوف والمخازن)' : 'Inventory Value (Shelves & Warehouses)'}
          </Text>
          <Text style={[styles.accountType, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'ج.س' : 'SDG'}
          </Text>
        </View>
        <View style={[styles.accountBalance, isRtl && styles.accountBalanceRtl]}>
          <Text style={[styles.balanceValue, { color: '#3b82f6' }]}>
            {formatAmount(inventoryValue)}
          </Text>
          <Text style={[styles.balanceCurrency, { color: theme.textSecondary }]}>SDG</Text>
        </View>
      </View>

      {/* Cash */}
      <View 
        style={[styles.accountCard, { backgroundColor: theme.card }, isRtl && styles.accountCardRtl]}
      >
        <View style={[styles.accountIcon, { backgroundColor: '#10b981' + '15' }]}>
          <Ionicons name="cash" size={24} color="#10b981" />
        </View>
        <View style={[styles.accountInfo, isRtl && styles.accountInfoRtl]}>
          <Text style={[styles.accountName, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'النقد' : 'Cash'}
          </Text>
          <Text style={[styles.accountType, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'ج.س' : 'SDG'}
          </Text>
        </View>
        <View style={[styles.accountBalance, isRtl && styles.accountBalanceRtl]}>
          <Text style={[styles.balanceValue, { color: '#10b981' }]}>
            {formatAmount(cashBalance)}
          </Text>
          <Text style={[styles.balanceCurrency, { color: theme.textSecondary }]}>SDG</Text>
        </View>
      </View>
      
      {/* Cash Action Buttons */}
      <View style={[styles.actionButtons, isRtl && styles.actionButtonsRtl]}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: theme.primary }]}
          onPress={() => {
            setTransferDirection('cashToBank');
            setShowTransferModal(true);
          }}
        >
          <Ionicons name="arrow-forward" size={18} color="#fff" />
          <Text style={styles.actionButtonText}>
            {locale === 'ar' ? 'تحويل إلى البنك' : 'Transfer to Bank'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#f59e0b' }]}
          onPress={() => {
            setCapitalSource('cash');
            setShowCapitalModal(true);
          }}
        >
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.actionButtonText}>
            {locale === 'ar' ? 'إضافة إلى رأس المال' : 'Add to Capital'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bank of Khartoum */}
      <View 
        style={[styles.accountCard, { backgroundColor: theme.card }, isRtl && styles.accountCardRtl]}
      >
        <View style={[styles.accountIcon, { backgroundColor: '#8b5cf6' + '15' }]}>
          <Ionicons name="business" size={24} color="#8b5cf6" />
        </View>
        <View style={[styles.accountInfo, isRtl && styles.accountInfoRtl]}>
          <Text style={[styles.accountName, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'بنك الخرطوم' : 'Bank of Khartoum'}
          </Text>
          <Text style={[styles.accountType, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'ج.س' : 'SDG'}
          </Text>
        </View>
        <View style={[styles.accountBalance, isRtl && styles.accountBalanceRtl]}>
          <Text style={[styles.balanceValue, { color: '#8b5cf6' }]}>
            {formatAmount(bankBalance)}
          </Text>
          <Text style={[styles.balanceCurrency, { color: theme.textSecondary }]}>SDG</Text>
        </View>
      </View>
      
      {/* Bank Action Buttons */}
      <View style={[styles.actionButtons, isRtl && styles.actionButtonsRtl]}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: theme.primary }]}
          onPress={() => {
            setTransferDirection('bankToCash');
            setShowTransferModal(true);
          }}
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
          <Text style={styles.actionButtonText}>
            {locale === 'ar' ? 'تحويل إلى النقد' : 'Transfer to Cash'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#f59e0b' }]}
          onPress={() => {
            setCapitalSource('bank');
            setShowCapitalModal(true);
          }}
        >
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.actionButtonText}>
            {locale === 'ar' ? 'إضافة إلى رأس المال' : 'Add to Capital'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Other Accounts List */}
      {accounts.filter(acc => acc.id !== cashAccountId && acc.id !== bankAccountId).length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 24 }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'الحسابات الأخرى' : 'Other Accounts'}
          </Text>
          
          {accounts.filter(acc => acc.id !== cashAccountId && acc.id !== bankAccountId).map((account) => {
            const style = getAccountStyle(account.accountType);
            return (
              <View 
                key={account.id} 
                style={[styles.accountCard, { backgroundColor: theme.card }, isRtl && styles.accountCardRtl]}
              >
                <View style={[styles.accountIcon, { backgroundColor: style.color + '15' }]}>
                  <Ionicons name={style.icon as any} size={24} color={style.color} />
                </View>
                <View style={[styles.accountInfo, isRtl && styles.accountInfoRtl]}>
                  <Text style={[styles.accountName, { color: theme.text }, isRtl && styles.textRtl]}>
                    {locale === 'ar' ? account.nameAr || account.name : account.name}
                  </Text>
                  <Text style={[styles.accountType, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                    {locale === 'ar' ? 'ج.س' : 'SDG'}
                  </Text>
                </View>
                <View style={[styles.accountBalance, isRtl && styles.accountBalanceRtl]}>
                  <Text style={[styles.balanceValue, { color: style.color }]}>
                    {formatAmount(account.balance)}
                  </Text>
                  <Text style={[styles.balanceCurrency, { color: theme.textSecondary }]}>SDG</Text>
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* Transfer Modal */}
      <Modal
        visible={showTransferModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTransferModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {transferDirection === 'cashToBank'
                  ? (locale === 'ar' ? 'تحويل من النقد إلى البنك' : 'Transfer from Cash to Bank')
                  : (locale === 'ar' ? 'تحويل من البنك إلى النقد' : 'Transfer from Bank to Cash')}
              </Text>
              <TouchableOpacity onPress={() => setShowTransferModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'المبلغ (ج.س)' : 'Amount (SDG)'}
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={theme.inputPlaceholder}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'الوصف (اختياري)' : 'Description (Optional)'}
              </Text>
              <TextInput
                style={[styles.textInput, styles.textArea, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={description}
                onChangeText={setDescription}
                placeholder={locale === 'ar' ? 'وصف التحويل' : 'Transfer description'}
                placeholderTextColor={theme.inputPlaceholder}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'إيصالات (اختياري)' : 'Receipts (Optional)'}
              </Text>
              
              <TouchableOpacity
                style={[styles.addImageButton, { backgroundColor: theme.primaryBackground, borderColor: theme.primary }]}
                onPress={pickImage}
              >
                <Ionicons name="camera" size={20} color={theme.primary} />
                <Text style={[styles.addImageText, { color: theme.primary }]}>
                  {locale === 'ar' ? 'إضافة صور' : 'Add Images'}
                </Text>
              </TouchableOpacity>

              {receiptImages.length > 0 && (
                <ScrollView horizontal style={styles.imagePreviewContainer} showsHorizontalScrollIndicator={false}>
                  {receiptImages.map((uri, index) => (
                    <View key={index} style={styles.imagePreview}>
                      <Image source={{ uri }} style={styles.previewImage} />
                      <TouchableOpacity
                        style={[styles.removeImageButton, { backgroundColor: theme.error }]}
                        onPress={() => removeImage(index)}
                      >
                        <Ionicons name="close" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }, processing && styles.submitButtonDisabled]}
                onPress={handleTransfer}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {locale === 'ar' ? 'تحويل' : 'Transfer'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add to Capital Modal */}
      <Modal
        visible={showCapitalModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCapitalModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {locale === 'ar' 
                  ? `إضافة إلى رأس المال من ${capitalSource === 'cash' ? 'النقد' : 'البنك'}`
                  : `Add to Capital from ${capitalSource === 'cash' ? 'Cash' : 'Bank'}`}
              </Text>
              <TouchableOpacity onPress={() => setShowCapitalModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'المبلغ (ج.س)' : 'Amount (SDG)'}
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={theme.inputPlaceholder}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'الوصف (اختياري)' : 'Description (Optional)'}
              </Text>
              <TextInput
                style={[styles.textInput, styles.textArea, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={description}
                onChangeText={setDescription}
                placeholder={locale === 'ar' ? 'وصف الإضافة' : 'Capital addition description'}
                placeholderTextColor={theme.inputPlaceholder}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'إيصالات (اختياري)' : 'Receipts (Optional)'}
              </Text>
              
              <TouchableOpacity
                style={[styles.addImageButton, { backgroundColor: theme.primaryBackground, borderColor: theme.primary }]}
                onPress={pickImage}
              >
                <Ionicons name="camera" size={20} color={theme.primary} />
                <Text style={[styles.addImageText, { color: theme.primary }]}>
                  {locale === 'ar' ? 'إضافة صور' : 'Add Images'}
                </Text>
              </TouchableOpacity>

              {receiptImages.length > 0 && (
                <ScrollView horizontal style={styles.imagePreviewContainer} showsHorizontalScrollIndicator={false}>
                  {receiptImages.map((uri, index) => (
                    <View key={index} style={styles.imagePreview}>
                      <Image source={{ uri }} style={styles.previewImage} />
                      <TouchableOpacity
                        style={[styles.removeImageButton, { backgroundColor: theme.error }]}
                        onPress={() => removeImage(index)}
                      >
                        <Ionicons name="close" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: '#f59e0b' }, processing && styles.submitButtonDisabled]}
                onPress={handleAddToCapital}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {locale === 'ar' ? 'إضافة' : 'Add'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Quick Stats */}
      <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 24 }, isRtl && styles.textRtl]}>
        {locale === 'ar' ? 'الإحصائيات' : 'Statistics'}
      </Text>
      <View style={styles.statsGrid}>
        <View key="income-stat" style={[styles.statCard, { backgroundColor: theme.card }]}>
          <Ionicons name="trending-up" size={24} color={theme.success} />
          <Text style={[styles.statLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'الإيرادات اليوم' : "Today's Income"}
          </Text>
          <Text style={[styles.statValue, { color: theme.text }]}>
            {formatAmount(dailyStats.income)} {locale === 'ar' ? 'ج.س' : 'SDG'}
          </Text>
        </View>
        <View key="expenses-stat" style={[styles.statCard, { backgroundColor: theme.card }]}>
          <Ionicons name="trending-down" size={24} color={theme.error} />
          <Text style={[styles.statLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'المصروفات اليوم' : "Today's Expenses"}
          </Text>
          <Text style={[styles.statValue, { color: theme.text }]}>
            {formatAmount(dailyStats.expenses)} {locale === 'ar' ? 'ج.س' : 'SDG'}
          </Text>
        </View>
      </View>
      
      {/* Accounts Receivable */}
      <View style={[styles.accountCard, { backgroundColor: theme.card, marginTop: 16 }, isRtl && styles.accountCardRtl]}>
        <View style={[styles.accountIcon, { backgroundColor: '#f59e0b' + '15' }]}>
          <Ionicons name="people" size={24} color="#f59e0b" />
        </View>
        <View style={[styles.accountInfo, isRtl && styles.accountInfoRtl]}>
          <Text style={[styles.accountName, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'ذمم مدينة' : 'Accounts Receivable'}
          </Text>
          <Text style={[styles.accountType, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'ج.س' : 'SDG'}
          </Text>
        </View>
        <View style={[styles.accountBalance, isRtl && styles.accountBalanceRtl]}>
          <Text style={[styles.balanceValue, { color: '#f59e0b' }]}>
            {formatAmount(accountsReceivable)}
          </Text>
          <Text style={[styles.balanceCurrency, { color: theme.textSecondary }]}>SDG</Text>
        </View>
      </View>
      
      {/* Accounts Payable */}
      <View style={[styles.accountCard, { backgroundColor: theme.card, marginTop: 16 }, isRtl && styles.accountCardRtl]}>
        <View style={[styles.accountIcon, { backgroundColor: '#ef4444' + '15' }]}>
          <Ionicons name="receipt" size={24} color="#ef4444" />
        </View>
        <View style={[styles.accountInfo, isRtl && styles.accountInfoRtl]}>
          <Text style={[styles.accountName, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'ذمم دائنة' : 'Accounts Payable'}
          </Text>
          <Text style={[styles.accountType, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'ج.س' : 'SDG'}
          </Text>
        </View>
        <View style={[styles.accountBalance, isRtl && styles.accountBalanceRtl]}>
          <Text style={[styles.balanceValue, { color: '#ef4444' }]}>
            {formatAmount(accountsPayable)}
          </Text>
          <Text style={[styles.balanceCurrency, { color: theme.textSecondary }]}>SDG</Text>
        </View>
      </View>
    </ScrollView>
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
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  summaryCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
  },
  summaryTitle: {
    fontSize: 14,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalItem: {
    alignItems: 'center',
  },
  totalCurrency: {
    fontSize: 14,
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 32,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  accountCardRtl: {
    flexDirection: 'row-reverse',
  },
  accountIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountInfo: {
    flex: 1,
    marginLeft: 12,
  },
  accountInfoRtl: {
    marginLeft: 0,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
  },
  accountType: {
    fontSize: 12,
    marginTop: 2,
  },
  accountBalance: {
    alignItems: 'flex-end',
  },
  accountBalanceRtl: {
    alignItems: 'flex-start',
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  balanceCurrency: {
    fontSize: 11,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  textRtl: {
    textAlign: 'right',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  actionButtonsRtl: {
    flexDirection: 'row-reverse',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  addImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    gap: 8,
  },
  addImageText: {
    fontSize: 14,
    fontWeight: '600',
  },
  imagePreviewContainer: {
    marginTop: 12,
    maxHeight: 100,
  },
  imagePreview: {
    position: 'relative',
    marginRight: 8,
  },
  previewImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
