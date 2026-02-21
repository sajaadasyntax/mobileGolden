import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

export default function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const { locale, toggleLocale } = useLocaleStore();
  const { theme, mode, toggleMode } = useThemeStore();
  const isRtl = locale === 'ar';
  const isAdmin = ['ADMIN', 'MANAGER'].includes(user?.role || '');

  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [editingBank, setEditingBank] = useState<any>(null);
  const [bankForm, setBankForm] = useState({ bankName: '', bankNameAr: '', accountNumber: '', iban: '' });
  const [savingBank, setSavingBank] = useState(false);

  useEffect(() => {
    if (isAdmin) loadBankAccounts();
  }, [isAdmin]);

  const loadBankAccounts = async () => {
    setLoadingBanks(true);
    try {
      const result = await api.accounting.bankAccounts.list();
      setBankAccounts(result || []);
    } catch { /* ignore */ }
    setLoadingBanks(false);
  };

  const openBankModal = (bank?: any) => {
    if (bank) {
      setEditingBank(bank);
      setBankForm({ bankName: bank.bankName, bankNameAr: bank.bankNameAr || '', accountNumber: bank.accountNumber, iban: bank.iban || '' });
    } else {
      setEditingBank(null);
      setBankForm({ bankName: '', bankNameAr: '', accountNumber: '', iban: '' });
    }
    setShowBankModal(true);
  };

  const saveBankAccount = async () => {
    if (!bankForm.bankName || !bankForm.accountNumber) {
      Alert.alert(locale === 'ar' ? 'خطأ' : 'Error', locale === 'ar' ? 'الاسم ورقم الحساب مطلوبان' : 'Bank name and account number are required');
      return;
    }
    setSavingBank(true);
    try {
      if (editingBank) {
        await api.accounting.bankAccounts.update({ id: editingBank.id, ...bankForm });
      } else {
        await api.accounting.bankAccounts.create(bankForm);
      }
      setShowBankModal(false);
      await loadBankAccounts();
    } catch (e: any) {
      Alert.alert(locale === 'ar' ? 'خطأ' : 'Error', e?.message || 'Failed');
    }
    setSavingBank(false);
  };

  const deleteBankAccount = (bank: any) => {
    Alert.alert(
      locale === 'ar' ? 'تأكيد' : 'Confirm',
      locale === 'ar' ? 'هل تريد حذف هذا الحساب البنكي؟' : 'Delete this bank account?',
      [
        { text: locale === 'ar' ? 'إلغاء' : 'Cancel', style: 'cancel' },
        { text: locale === 'ar' ? 'حذف' : 'Delete', style: 'destructive', onPress: async () => {
          try { await api.accounting.bankAccounts.delete(bank.id); await loadBankAccounts(); } catch { /* ignore */ }
        }},
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      t('logout', locale),
      locale === 'ar' ? 'هل تريد تسجيل الخروج؟' : 'Are you sure you want to logout?',
      [
        { text: t('cancel', locale), style: 'cancel' },
        {
          text: t('logout', locale),
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const SettingItem = ({
    icon,
    label,
    value,
    onPress,
    showArrow = true,
    rightComponent,
  }: {
    icon: string;
    label: string;
    value?: string;
    onPress?: () => void;
    showArrow?: boolean;
    rightComponent?: React.ReactNode;
  }) => (
    <TouchableOpacity
      style={[
        styles.settingItem, 
        { backgroundColor: theme.surface },
        isRtl && styles.settingItemRtl
      ]}
      onPress={onPress}
      disabled={!onPress && !rightComponent}
    >
      <View style={[styles.settingLeft, isRtl && styles.settingLeftRtl]}>
        <View style={[styles.settingIcon, { backgroundColor: theme.primaryBackground }]}>
          <Ionicons name={icon as any} size={20} color={theme.primary} />
        </View>
        <Text style={[styles.settingLabel, { color: theme.text }, isRtl && styles.textRtl]}>{label}</Text>
      </View>
      <View style={[styles.settingRight, isRtl && styles.settingRightRtl]}>
        {value && <Text style={[styles.settingValue, { color: theme.textSecondary }]}>{value}</Text>}
        {rightComponent}
        {showArrow && !rightComponent && (
          <Ionicons 
            name={isRtl ? 'chevron-back' : 'chevron-forward'} 
            size={20} 
            color={theme.textSecondary} 
          />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.background }]} 
      contentContainerStyle={styles.content}
    >
      {/* Profile Section */}
      <View style={styles.profileSection}>
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'U'}</Text>
        </View>
        <Text style={[styles.profileName, { color: theme.text }, isRtl && styles.textRtl]}>{user?.name}</Text>
        <Text style={[styles.profileEmail, { color: theme.textSecondary }, isRtl && styles.textRtl]}>{user?.email}</Text>
        <View style={[styles.roleBadge, { backgroundColor: theme.primaryBackground }]}>
          <Text style={[styles.roleText, { color: theme.primary }]}>{user?.role}</Text>
        </View>
      </View>

      {/* Settings Sections */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
          {locale === 'ar' ? 'الإعدادات العامة' : 'General'}
        </Text>
        
        <SettingItem
          icon="language"
          label={t('language', locale)}
          value={locale === 'ar' ? t('arabic', locale) : t('english', locale)}
          onPress={toggleLocale}
        />
        
        <SettingItem
          icon="notifications-outline"
          label={t('notifications', locale)}
          rightComponent={
            <Switch
              value={true}
              onValueChange={() => {}}
              trackColor={{ false: theme.backgroundTertiary, true: `${theme.primary}80` }}
              thumbColor={theme.primary}
            />
          }
          showArrow={false}
        />
        
        <SettingItem
          icon={mode === 'dark' ? 'moon' : 'sunny'}
          label={mode === 'dark' ? t('darkMode', locale) : t('lightMode', locale)}
          rightComponent={
            <Switch
              value={mode === 'dark'}
              onValueChange={toggleMode}
              trackColor={{ false: theme.backgroundTertiary, true: `${theme.primary}80` }}
              thumbColor={theme.primary}
            />
          }
          showArrow={false}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
          {locale === 'ar' ? 'الحساب' : 'Account'}
        </Text>
        
        <SettingItem
          icon="business-outline"
          label={locale === 'ar' ? 'الفرع' : 'Branch'}
          value={locale === 'ar' ? user?.branch?.nameAr : user?.branch?.name}
          showArrow={false}
        />
        
        <SettingItem
          icon="shield-checkmark-outline"
          label={locale === 'ar' ? 'الصلاحيات' : 'Permissions'}
          onPress={() => {}}
        />
      </View>

      {/* Bank Accounts Section (Admin only) */}
      {isAdmin && (
        <View style={styles.section}>
          <View style={[styles.sectionHeader, isRtl && { flexDirection: 'row-reverse' }]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'الحسابات البنكية' : 'Bank Accounts'}
            </Text>
            <TouchableOpacity onPress={() => openBankModal()} style={[styles.addButton, { backgroundColor: theme.primaryBackground }]}>
              <Ionicons name="add" size={18} color={theme.primary} />
            </TouchableOpacity>
          </View>
          {loadingBanks ? (
            <ActivityIndicator color={theme.primary} style={{ padding: 20 }} />
          ) : bankAccounts.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'لا توجد حسابات بنكية' : 'No bank accounts'}
            </Text>
          ) : (
            bankAccounts.map((bank) => (
              <View key={bank.id} style={[styles.bankCard, { backgroundColor: theme.surface }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bankName, { color: theme.text }]}>{locale === 'ar' ? bank.bankNameAr || bank.bankName : bank.bankName}</Text>
                  <Text style={[styles.bankNumber, { color: theme.textSecondary }]}>{bank.accountNumber}</Text>
                  {bank.iban && <Text style={[styles.bankIban, { color: theme.textSecondary }]}>IBAN: {bank.iban}</Text>}
                </View>
                <View style={styles.bankActions}>
                  <TouchableOpacity onPress={() => openBankModal(bank)} style={styles.bankActionBtn}>
                    <Ionicons name="pencil" size={18} color={theme.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteBankAccount(bank)} style={styles.bankActionBtn}>
                    <Ionicons name="trash" size={18} color={theme.error} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* Bank Account Modal */}
      <Modal visible={showBankModal} transparent animationType="slide" onRequestClose={() => setShowBankModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{editingBank ? (locale === 'ar' ? 'تعديل الحساب' : 'Edit Account') : (locale === 'ar' ? 'إضافة حساب بنكي' : 'Add Bank Account')}</Text>
              <TouchableOpacity onPress={() => setShowBankModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>{locale === 'ar' ? 'اسم البنك' : 'Bank Name'}</Text>
              <TextInput style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]} value={bankForm.bankName} onChangeText={(v) => setBankForm({ ...bankForm, bankName: v })} placeholder={locale === 'ar' ? 'اسم البنك' : 'Bank Name'} placeholderTextColor={theme.inputPlaceholder} />
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 12 }]}>{locale === 'ar' ? 'اسم البنك (عربي)' : 'Bank Name (Arabic)'}</Text>
              <TextInput style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]} value={bankForm.bankNameAr} onChangeText={(v) => setBankForm({ ...bankForm, bankNameAr: v })} placeholder={locale === 'ar' ? 'اسم البنك بالعربي' : 'Bank Name in Arabic'} placeholderTextColor={theme.inputPlaceholder} />
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 12 }]}>{locale === 'ar' ? 'رقم الحساب' : 'Account Number'}</Text>
              <TextInput style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]} value={bankForm.accountNumber} onChangeText={(v) => setBankForm({ ...bankForm, accountNumber: v })} placeholder={locale === 'ar' ? 'رقم الحساب' : 'Account Number'} placeholderTextColor={theme.inputPlaceholder} />
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 12 }]}>IBAN</Text>
              <TextInput style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]} value={bankForm.iban} onChangeText={(v) => setBankForm({ ...bankForm, iban: v })} placeholder="IBAN" placeholderTextColor={theme.inputPlaceholder} />
              <TouchableOpacity style={[styles.saveButton, { backgroundColor: theme.primary }, savingBank && { opacity: 0.6 }]} onPress={saveBankAccount} disabled={savingBank}>
                {savingBank ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{locale === 'ar' ? 'حفظ' : 'Save'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
          {locale === 'ar' ? 'الدعم' : 'Support'}
        </Text>
        
        <SettingItem
          icon="help-circle-outline"
          label={locale === 'ar' ? 'المساعدة' : 'Help & Support'}
          onPress={() => {}}
        />
        
        <SettingItem
          icon="information-circle-outline"
          label={t('about', locale)}
          value="v1.0.0"
          showArrow={false}
        />
      </View>

      {/* Logout Button */}
      <TouchableOpacity 
        style={[
          styles.logoutButton, 
          { backgroundColor: theme.errorBackground },
          isRtl && styles.logoutButtonRtl
        ]} 
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={20} color={theme.error} />
        <Text style={[styles.logoutText, { color: theme.error }]}>{t('logout', locale)}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    marginBottom: 12,
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  settingItemRtl: {
    flexDirection: 'row-reverse',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingLeftRtl: {
    flexDirection: 'row-reverse',
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 15,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingRightRtl: {
    flexDirection: 'row-reverse',
  },
  settingValue: {
    fontSize: 14,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 16,
  },
  logoutButtonRtl: {
    flexDirection: 'row-reverse',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
  },
  textRtl: {
    textAlign: 'right',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  bankName: {
    fontSize: 15,
    fontWeight: '600',
  },
  bankNumber: {
    fontSize: 13,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  bankIban: {
    fontSize: 11,
    marginTop: 2,
  },
  bankActions: {
    flexDirection: 'row',
    gap: 8,
  },
  bankActionBtn: {
    padding: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
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
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  saveButton: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
