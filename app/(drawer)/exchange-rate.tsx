import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

export default function ExchangeRateScreen() {
  const { user } = useAuthStore();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const [dayCycle, setDayCycle] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [newRate, setNewRate] = useState('');
  const isRtl = locale === 'ar';
  
  // Check if day is actually open (exists and has OPEN status)
  const isDayOpen = dayCycle && dayCycle.status === 'OPEN';

  const loadData = async () => {
    try {
      if (user?.branchId) {
        const cycle = await api.dayCycle.getCurrent(user.branchId);
        setDayCycle(cycle);
        if (cycle?.exchangeRateUsdSdg) {
          setNewRate(cycle.exchangeRateUsdSdg.toString());
        }
      }
    } catch (error) {
      // Day might not be open
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleOpenDay = async () => {
    const rate = parseFloat(newRate);
    if (!rate || rate <= 0) {
      Alert.alert(t('error', locale), t('enterRate', locale));
      return;
    }
    try {
      // If day cycle exists but is closed, reopen it instead
      if (dayCycle && dayCycle.status === 'CLOSED') {
        await api.dayCycle.reopen(dayCycle.id);
        // Update exchange rate after reopening
        await api.dayCycle.updateExchangeRate(dayCycle.id, rate);
      } else {
        await api.dayCycle.open(user?.branchId || '', rate);
      }
      loadData();
      Alert.alert(t('success', locale), t('dayIsOpen', locale));
    } catch (error: any) {
      const message = error?.message || (locale === 'ar' ? 'فشل فتح اليوم' : 'Failed to open day');
      Alert.alert(t('error', locale), message);
    }
  };

  const handleCloseDay = async () => {
    Alert.alert(
      t('closeDay', locale),
      locale === 'ar' ? 'هل تريد إغلاق اليوم؟' : 'Are you sure you want to close today?',
      [
        { text: t('cancel', locale), style: 'cancel' },
        {
          text: t('confirm', locale),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.dayCycle.close(dayCycle.id, { force: true });
              loadData(); // Reload to get updated status
              Alert.alert(t('success', locale), t('dayIsClosed', locale));
            } catch (error: any) {
              const message = error?.message || (locale === 'ar' ? 'فشل إغلاق اليوم' : 'Failed to close day');
              Alert.alert(t('error', locale), message);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
      }
    >
      {/* Current Status Card */}
      <View style={[
        styles.statusCard,
        isDayOpen 
          ? { backgroundColor: theme.success + '15', borderColor: theme.success + '30' }
          : { backgroundColor: theme.warning + '15', borderColor: theme.warning + '30' }
      ]}>
        <View style={[styles.statusHeader, isRtl && styles.statusHeaderRtl]}>
          <View style={[styles.statusIconContainer, { backgroundColor: theme.background + '20' }]}>
            <Ionicons
              name={isDayOpen ? 'sunny' : 'moon'}
              size={32}
              color={isDayOpen ? theme.success : theme.warning}
            />
          </View>
          <View style={[styles.statusInfo, isRtl && styles.statusInfoRtl]}>
            <Text style={[styles.statusTitle, { color: theme.text }, isRtl && styles.textRtl]}>
              {isDayOpen ? t('dayIsOpen', locale) : t('dayIsClosed', locale)}
            </Text>
            {/* Show closed time if day was closed */}
            {dayCycle && dayCycle.status === 'CLOSED' && dayCycle.closedAt && (() => {
              try {
                const closedDate = new Date(dayCycle.closedAt);
                if (isNaN(closedDate.getTime())) {
                  return null;
                }
                return (
                  <Text style={[styles.statusSubtitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                    {locale === 'ar' 
                      ? `تم الإغلاق: ${closedDate.toLocaleTimeString('ar-SA')}`
                      : `Closed: ${closedDate.toLocaleTimeString()}`}
                  </Text>
                );
              } catch {
                return null;
              }
            })()}
            {/* Show opened time if day is open */}
            {isDayOpen && dayCycle.openedAt && (() => {
              try {
                const openedDate = new Date(dayCycle.openedAt);
                if (isNaN(openedDate.getTime())) {
                  return null; // Invalid date, don't display
                }
                return (
                  <Text style={[styles.statusSubtitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                    {locale === 'ar' 
                      ? `تم الفتح: ${openedDate.toLocaleTimeString('ar-SA')}`
                      : `Opened: ${openedDate.toLocaleTimeString()}`}
                  </Text>
                );
              } catch {
                return null; // Error formatting date, don't display
              }
            })()}
          </View>
        </View>

        {isDayOpen && (
          <View style={[styles.currentRateContainer, { borderTopColor: theme.border }]}>
            <Text style={[styles.currentRateLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {t('currentRate', locale)}
            </Text>
            <View style={[styles.rateDisplay, isRtl && styles.rateDisplayRtl]}>
              <Text style={[styles.rateValue, { color: theme.text }]}>1 USD</Text>
              <Ionicons name="swap-horizontal" size={20} color={theme.textSecondary} />
              <Text style={[styles.rateValue, { color: theme.text }]}>
                {Number(dayCycle.exchangeRateUsdSdg).toLocaleString()} SDG
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Exchange Rate Input */}
      <View style={[styles.inputCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.inputTitle, { color: theme.text }, isRtl && styles.textRtl]}>
          {t('setExchangeRate', locale)}
        </Text>
        <Text style={[styles.inputSubtitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
          {locale === 'ar' 
            ? 'أدخل سعر صرف الدولار مقابل الجنيه السوداني'
            : 'Enter the USD to SDG exchange rate'}
        </Text>

        <View style={[styles.rateInputContainer, { backgroundColor: theme.backgroundSecondary }, isRtl && styles.rateInputContainerRtl]}>
          <View style={[styles.rateInputLeft, { backgroundColor: theme.backgroundTertiary }]}>
            <Text style={[styles.currencyLabel, { color: theme.textSecondary }]}>1 USD =</Text>
          </View>
          <TextInput
            style={[styles.rateInput, { color: theme.text }]}
            placeholder="0"
            placeholderTextColor={theme.inputPlaceholder}
            value={newRate}
            onChangeText={setNewRate}
            keyboardType="decimal-pad"
          />
          <View style={[styles.rateInputRight, { backgroundColor: theme.backgroundTertiary }]}>
            <Text style={[styles.currencyLabel, { color: theme.textSecondary }]}>SDG</Text>
          </View>
        </View>

        {!isDayOpen ? (
          <TouchableOpacity style={[styles.openButton, { backgroundColor: theme.success }]} onPress={handleOpenDay}>
            <Ionicons name="sunny" size={20} color="#fff" />
            <Text style={styles.buttonText}>
              {dayCycle?.status === 'CLOSED' 
                ? (locale === 'ar' ? 'إعادة فتح اليوم' : 'Reopen Day')
                : t('openDay', locale)}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.closeButton, { backgroundColor: theme.error }]} onPress={handleCloseDay}>
            <Ionicons name="moon" size={20} color="#fff" />
            <Text style={styles.buttonText}>{t('closeDay', locale)}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Info Card */}
      <View style={[styles.infoCard, { backgroundColor: theme.primaryBackground }]}>
        <Ionicons name="information-circle" size={24} color={theme.primary} />
        <View style={[styles.infoContent, isRtl && styles.infoContentRtl]}>
          <Text style={[styles.infoTitle, { color: theme.primary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'معلومات مهمة' : 'Important Information'}
          </Text>
          <Text style={[styles.infoText, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar'
              ? 'سعر الصرف يؤثر على جميع المعاملات اليومية. تأكد من تحديث السعر يومياً قبل بدء العمل.'
              : 'The exchange rate affects all daily transactions. Make sure to update the rate daily before starting work.'}
          </Text>
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
    paddingBottom: 100,
  },
  statusCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  statusIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  statusInfo: {
    flex: 1,
  },
  statusInfoRtl: {
    alignItems: 'flex-end',
    marginRight: 0,
    marginLeft: 16,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 13,
  },
  currentRateContainer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
  },
  currentRateLabel: {
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  rateDisplayRtl: {
    flexDirection: 'row-reverse',
  },
  rateValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  inputCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  inputTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  rateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
  },
  rateInputContainerRtl: {
    flexDirection: 'row-reverse',
  },
  rateInputLeft: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
  },
  rateInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
  },
  rateInputRight: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
  },
  currencyLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  infoCard: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoContentRtl: {
    alignItems: 'flex-end',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 20,
  },
  textRtl: {
    textAlign: 'right',
  },
});
