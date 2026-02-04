import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { t } from '@/lib/i18n';

export default function RaiseNotificationScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const isRtl = locale === 'ar';
  
  const [operationNumber, setOperationNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    if (!operationNumber || !amount) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }
    
    // TODO: Implement API call to raise notification
    Alert.alert(t('success', locale), t('noticeRaised', locale));
    setOperationNumber('');
    setAmount('');
    setNotes('');
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        {/* Header Card */}
        <View style={[styles.headerCard, { backgroundColor: theme.primaryBackground }]}>
          <Ionicons name="notifications" size={32} color={theme.primary} />
          <Text style={[styles.headerTitle, { color: theme.primary }, isRtl && styles.textRtl]}>
            {t('raiseNotification', locale)}
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'رفع إشعار بنكي للعملية' : 'Raise a bank notification for the operation'}
          </Text>
        </View>

        {/* Form */}
        <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }, isRtl && styles.textRtl]}>
              {t('operationNumber', locale)} *
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
              placeholder={locale === 'ar' ? 'أدخل رقم العملية' : 'Enter operation number'}
              placeholderTextColor={theme.inputPlaceholder}
              value={operationNumber}
              onChangeText={setOperationNumber}
              keyboardType="default"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }, isRtl && styles.textRtl]}>
              {t('amount', locale)} (USD) *
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
              placeholder={locale === 'ar' ? 'أدخل المبلغ بالدولار' : 'Enter amount in USD'}
              placeholderTextColor={theme.inputPlaceholder}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }, isRtl && styles.textRtl]}>
              {t('notes', locale)}
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
              placeholder={locale === 'ar' ? 'ملاحظات إضافية' : 'Additional notes'}
              placeholderTextColor={theme.inputPlaceholder}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
            />
          </View>

          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: theme.primary }]}
            onPress={handleSubmit}
          >
            <Ionicons name="send" size={20} color="#fff" />
            <Text style={styles.submitButtonText}>
              {t('submit', locale)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  headerCard: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  formCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
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
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  textRtl: {
    textAlign: 'right',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 10,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

