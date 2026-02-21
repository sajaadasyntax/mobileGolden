import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api, uploadReceipt } from '@/lib/api';

interface BankAccount {
  id: string;
  bankName: string;
  bankNameAr?: string;
  accountNumber: string;
  iban?: string;
}

export default function BankPaymentScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [receiptImageUri, setReceiptImageUri] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [validationErrors, setValidationErrors] = useState<{
    bankAccount?: string;
    amount?: string;
    receipt?: string;
  }>({});

  useEffect(() => {
    loadBankAccounts();
  }, []);

  const loadBankAccounts = async () => {
    try {
      const data = await api.accounting.bankAccounts.list();
      const accounts = Array.isArray(data) ? data : (data?.data ?? []);
      setBankAccounts(accounts);
    } catch (error) {
      console.error('Failed to load bank accounts:', error);
      setBankAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const pickReceiptImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.granted === false) {
        Alert.alert(
          locale === 'ar' ? 'تحتاج إلى إذن' : 'Permission Required',
          locale === 'ar'
            ? 'يجب السماح بالوصول إلى المعرض لالتقاط صورة الإيصال'
            : 'Please allow access to your photo library to select a receipt image'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        setReceiptImageUri(result.assets[0].uri);
        setValidationErrors((prev) => ({ ...prev, receipt: undefined }));
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'فشل اختيار الصورة' : 'Failed to pick image'
      );
    }
  };

  const validate = (): boolean => {
    const errors: typeof validationErrors = {};

    if (!selectedBankAccountId) {
      errors.bankAccount = locale === 'ar' ? 'اختر حساب بنكي' : 'Please select a bank account';
    }

    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      errors.amount = locale === 'ar' ? 'أدخل مبلغاً صحيحاً أكبر من صفر' : 'Enter a valid amount greater than 0';
    }

    if (!receiptImageUri) {
      errors.receipt = locale === 'ar' ? 'صورة الإيصال مطلوبة' : 'Receipt image is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => {
    setSelectedBankAccountId(null);
    setAmount('');
    setTransactionId('');
    setReceiptImageUri(null);
    setDescription('');
    setValidationErrors({});
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);
    try {
      const amountNum = parseFloat(amount);

      // 1. Upload receipt image first
      const receiptUrl = await uploadReceipt(receiptImageUri!);

      // 2. Submit bank payment with the returned URL
      await api.accounting.bankPayments.submit({
        bankAccountId: selectedBankAccountId!,
        amountSdg: amountNum,
        receiptImageUrl: receiptUrl,
        ...(transactionId.trim() && { transactionId: transactionId.trim() }),
        ...(description.trim() && { description: description.trim() }),
      });

      Alert.alert(t('success', locale), locale === 'ar' ? 'تم إرسال الدفع البنكي بنجاح' : 'Bank payment submitted successfully');
      resetForm();
    } catch (error: any) {
      const message = error?.message || '';
      if (
        message.toLowerCase().includes('transaction id') ||
        message.toLowerCase().includes('already exists') ||
        message.toLowerCase().includes('conflict')
      ) {
        Alert.alert(
          t('error', locale),
          locale === 'ar'
            ? 'رقم المعاملة مستخدم مسبقاً. يرجى استخدام رقم مختلف.'
            : 'This transaction ID already exists. Please use a different one.'
        );
      } else {
        Alert.alert(t('error', locale), message || (locale === 'ar' ? 'فشل إرسال الدفع' : 'Failed to submit payment'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getBankDisplayName = (account: BankAccount) => {
    return isRtl && account.bankNameAr ? account.bankNameAr : account.bankName;
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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Bank Account Selection */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'اختر الحساب البنكي' : 'Select Bank Account'}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.chipsContainer, isRtl && styles.chipsContainerRtl]}
            style={styles.chipsScroll}
          >
            {bankAccounts.map((account) => {
              const isSelected = selectedBankAccountId === account.id;
              return (
                <TouchableOpacity
                  key={account.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isSelected ? theme.primary : theme.backgroundSecondary,
                      borderColor: isSelected ? theme.primary : theme.inputBorder,
                    },
                    isRtl && styles.chipRtl,
                  ]}
                  onPress={() => {
                    setSelectedBankAccountId(account.id);
                    setValidationErrors((prev) => ({ ...prev, bankAccount: undefined }));
                  }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: isSelected ? theme.textInverse : theme.text },
                      isRtl && styles.textRtl,
                    ]}
                    numberOfLines={1}
                  >
                    {getBankDisplayName(account)} ({account.accountNumber})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {validationErrors.bankAccount && (
            <Text style={[styles.errorText, { color: theme.error }, isRtl && styles.textRtl]}>
              {validationErrors.bankAccount}
            </Text>
          )}
        </View>

        {/* Amount */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.label, { color: theme.text }, isRtl && styles.textRtl]}>
            {t('amount', locale)} (SDG) *
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
            placeholder={locale === 'ar' ? 'أدخل المبلغ' : 'Enter amount'}
            placeholderTextColor={theme.inputPlaceholder}
            value={amount}
            onChangeText={(text) => {
              setAmount(text);
              setValidationErrors((prev) => ({ ...prev, amount: undefined }));
            }}
            keyboardType="decimal-pad"
          />
          {validationErrors.amount && (
            <Text style={[styles.errorText, { color: theme.error }, isRtl && styles.textRtl]}>
              {validationErrors.amount}
            </Text>
          )}
        </View>

        {/* Optional Transaction ID */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.label, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'رقم المعاملة (اختياري)' : 'Transaction ID (optional)'}
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
            placeholder={locale === 'ar' ? 'رقم العملية البنكية' : 'Bank operation number'}
            placeholderTextColor={theme.inputPlaceholder}
            value={transactionId}
            onChangeText={setTransactionId}
          />
        </View>

        {/* Receipt Image - MANDATORY */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.label, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'صورة الإيصال' : 'Receipt Image'} *
          </Text>
          <TouchableOpacity
            style={[
              styles.receiptPicker,
              {
                backgroundColor: theme.input,
                borderColor: receiptImageUri ? theme.primary : theme.inputBorder,
                borderWidth: receiptImageUri ? 2 : 1,
              },
            ]}
            onPress={pickReceiptImage}
          >
            {receiptImageUri ? (
              <View style={styles.receiptPreview}>
                <Image
                  source={{ uri: receiptImageUri }}
                  style={styles.receiptThumbnail}
                  resizeMode="cover"
                />
                <View style={[styles.receiptOverlay, isRtl && styles.receiptOverlayRtl]}>
                  <Ionicons name="camera" size={24} color="#fff" />
                  <Text style={styles.receiptChangeText}>
                    {locale === 'ar' ? 'تغيير' : 'Change'}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={[styles.receiptPlaceholder, isRtl && styles.receiptPlaceholderRtl]}>
                <Ionicons name="image-outline" size={48} color={theme.inputPlaceholder} />
                <Text style={[styles.receiptPlaceholderText, { color: theme.inputPlaceholder }, isRtl && styles.textRtl]}>
                  {locale === 'ar' ? 'اضغط لاختيار صورة الإيصال' : 'Tap to select receipt image'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          {validationErrors.receipt && (
            <Text style={[styles.errorText, { color: theme.error }, isRtl && styles.textRtl]}>
              {validationErrors.receipt}
            </Text>
          )}
        </View>

        {/* Optional Description */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.label, { color: theme.text }, isRtl && styles.textRtl]}>
            {t('description', locale)} ({locale === 'ar' ? 'اختياري' : 'optional'})
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                backgroundColor: theme.input,
                borderColor: theme.inputBorder,
                color: theme.text,
              },
              isRtl && styles.inputRtl,
            ]}
            placeholder={locale === 'ar' ? 'أضف وصفاً أو ملاحظات...' : 'Add description or notes...'}
            placeholderTextColor={theme.inputPlaceholder}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            { backgroundColor: theme.primary },
            submitting && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={20} color="#fff" />
              <Text style={styles.submitButtonText}>{t('submit', locale)}</Text>
            </>
          )}
        </TouchableOpacity>

        {bankAccounts.length === 0 && (
          <View style={styles.emptyHint}>
            <Ionicons name="warning-outline" size={24} color={theme.warning} />
            <Text style={[styles.emptyHintText, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'لا توجد حسابات بنكية متاحة' : 'No bank accounts available'}
            </Text>
          </View>
        )}
      </ScrollView>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  chipsContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
  },
  chipsContainerRtl: {
    flexDirection: 'row-reverse',
  },
  chipsScroll: {
    maxHeight: 50,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipRtl: {
    marginLeft: 0,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  inputRtl: {
    textAlign: 'right',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  errorText: {
    fontSize: 12,
    marginTop: 6,
  },
  textRtl: {
    textAlign: 'right',
  },
  receiptPicker: {
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 160,
  },
  receiptPreview: {
    width: '100%',
    height: 160,
    position: 'relative',
  },
  receiptThumbnail: {
    width: '100%',
    height: '100%',
  },
  receiptOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
  },
  receiptOverlayRtl: {
    flexDirection: 'row-reverse',
  },
  receiptChangeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  receiptPlaceholder: {
    flex: 1,
    minHeight: 160,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  receiptPlaceholderRtl: {
    flexDirection: 'row-reverse',
  },
  receiptPlaceholderText: {
    fontSize: 14,
    marginTop: 12,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  emptyHintText: {
    fontSize: 14,
  },
});
