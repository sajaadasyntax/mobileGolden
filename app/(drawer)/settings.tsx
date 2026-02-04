import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { t } from '@/lib/i18n';

export default function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const { locale, toggleLocale } = useLocaleStore();
  const { theme, mode, toggleMode } = useThemeStore();
  const isRtl = locale === 'ar';

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
});
