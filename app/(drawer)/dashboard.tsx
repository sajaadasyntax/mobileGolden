import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

const logo = require('@/assets/logo.jpeg');

export default function DashboardScreen() {
  const { user } = useAuthStore();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const [refreshing, setRefreshing] = useState(false);
  const [dayCycle, setDayCycle] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const isRtl = locale === 'ar';
  const isAdmin = ['ADMIN', 'MANAGER'].includes(user?.role || '');

  const loadData = async () => {
    try {
      if (user) {
        try {
          const cycle = await api.dayCycle.getCurrent(user.branchId);
          setDayCycle(cycle);
        } catch {
          // branchId may be null or day cycle unavailable
        }
        if (isAdmin && user.branchId) {
          try {
            const dash = await api.accounting.reports.dashboard(user.branchId);
            setSummary(dash);
          } catch { /* ignore */ }
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

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US').format(amount);
  };

  // Quick actions based on user role
  const getQuickActions = () => {
    const role = user?.role || '';
    const baseActions = [
      { icon: 'cube-outline', label: t('inventory', locale), route: '/(drawer)/inventory', color: theme.primary },
    ];

    if (['ADMIN', 'MANAGER', 'SHELF_SALES'].includes(role)) {
      baseActions.unshift(
        { icon: 'cart-outline', label: t('newSale', locale), route: '/(drawer)/daily-invoice', color: theme.success }
      );
    }

    if (['ADMIN', 'MANAGER', 'PROCUREMENT'].includes(role)) {
      baseActions.push(
        { icon: 'document-text-outline', label: t('purchaseOrders', locale), route: '/(drawer)/procurement', color: theme.info }
      );
    }

    if (['ADMIN', 'MANAGER', 'WAREHOUSE_SALES'].includes(role)) {
      baseActions.push(
        { icon: 'layers-outline', label: t('goodsRequests', locale), route: '/(drawer)/shelf-requests', color: '#9C27B0' }
      );
    }

    if (['ADMIN', 'MANAGER'].includes(role)) {
      baseActions.push(
        { icon: 'cash-outline', label: t('exchangeRate', locale), route: '/(drawer)/exchange-rate', color: theme.warning },
        { icon: 'people-outline', label: t('customers', locale), route: '/(drawer)/customers', color: theme.textSecondary }
      );
    }

    return baseActions;
  };

  const quickActions = getQuickActions();

  const isDayOpen = dayCycle && dayCycle.status === 'OPEN';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
      }
    >
      {/* Header with Logo */}
      <View style={[styles.header, isRtl && styles.headerRtl]}>
        <Image source={logo} style={styles.headerLogo} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {t('welcomeBack', locale)}
          </Text>
          <Text style={[styles.userName, { color: theme.text }, isRtl && styles.textRtl]}>
            {user?.name}
          </Text>
        </View>
      </View>

      {/* Today's Summary (Admin/Manager) */}
      {isAdmin && summary && (
        <View style={styles.summarySection}>
          <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'ملخص اليوم' : "Today's Summary"}
          </Text>
          <View style={styles.summaryGrid}>
            <View style={[styles.summaryCard, { backgroundColor: theme.success + '15' }]}>
              <Ionicons name="trending-up" size={22} color={theme.success} />
              <Text style={[styles.summaryValue, { color: theme.success }]}>{formatAmount(summary.todaySales || 0)}</Text>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{locale === 'ar' ? 'المبيعات' : 'Sales'}</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: theme.error + '15' }]}>
              <Ionicons name="trending-down" size={22} color={theme.error} />
              <Text style={[styles.summaryValue, { color: theme.error }]}>{formatAmount(summary.todayExpenses || 0)}</Text>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{locale === 'ar' ? 'المصروفات' : 'Expenses'}</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: theme.primary + '15' }]}>
              <Ionicons name="stats-chart" size={22} color={theme.primary} />
              <Text style={[styles.summaryValue, { color: theme.primary }]}>{formatAmount((summary.todaySales || 0) - (summary.todayExpenses || 0))}</Text>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{locale === 'ar' ? 'الربح' : 'Profit'}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Day Status Card - Simple */}
      <TouchableOpacity
        style={[
          styles.dayStatusCard,
          {
            backgroundColor: isDayOpen ? theme.success + '15' : theme.warning + '15',
            borderColor: isDayOpen ? theme.success + '30' : theme.warning + '30',
          },
        ]}
        onPress={() => router.push('/(drawer)/exchange-rate')}
      >
        <View style={[styles.dayStatusContent, isRtl && styles.dayStatusContentRtl]}>
          <View style={[styles.dayStatusIcon, { backgroundColor: theme.background }]}>
            <Ionicons
              name={isDayOpen ? 'sunny' : 'moon'}
              size={28}
              color={isDayOpen ? theme.success : theme.warning}
            />
          </View>
          <View style={styles.dayStatusInfo}>
            <Text style={[styles.dayStatusTitle, { color: theme.text }, isRtl && styles.textRtl]}>
              {isDayOpen ? t('dayIsOpen', locale) : t('dayIsClosed', locale)}
            </Text>
            {isDayOpen && dayCycle?.exchangeRateUsdSdg && (
              <Text style={[styles.exchangeRateText, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                1 USD = {Number(dayCycle.exchangeRateUsdSdg).toLocaleString()} SDG
              </Text>
            )}
            {!isDayOpen && (
              <Text style={[styles.exchangeRateText, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                {locale === 'ar' ? 'اضغط لفتح اليوم' : 'Tap to open day'}
              </Text>
            )}
          </View>
          <Ionicons name={isRtl ? 'chevron-back' : 'chevron-forward'} size={20} color={theme.textSecondary} />
        </View>
      </TouchableOpacity>

      {/* Quick Actions */}
      <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
        {t('quickActions', locale)}
      </Text>
      <View style={styles.actionsGrid}>
        {quickActions.map((action, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.actionCard, { backgroundColor: theme.card }]}
            onPress={() => router.push(action.route as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
              <Ionicons name={action.icon as any} size={28} color={action.color} />
            </View>
            <Text style={[styles.actionLabel, { color: theme.text }, isRtl && styles.textRtl]} numberOfLines={2}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 14,
  },
  headerRtl: {
    flexDirection: 'row-reverse',
  },
  headerLogo: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  greeting: {
    fontSize: 14,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
  },
  summarySection: {
    marginBottom: 20,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 11,
  },
  dayStatusCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
  },
  dayStatusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  dayStatusContentRtl: {
    flexDirection: 'row-reverse',
  },
  dayStatusIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayStatusInfo: {
    flex: 1,
  },
  dayStatusTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  exchangeRateText: {
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '31%',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    minHeight: 120,
    justifyContent: 'center',
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  textRtl: {
    textAlign: 'right',
  },
});
