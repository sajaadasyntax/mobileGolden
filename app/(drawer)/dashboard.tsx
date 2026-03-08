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

  // Quick actions - max 4 per role, 2 per row
  const getQuickActions = () => {
    const role = user?.role || '';

    if (['ADMIN', 'MANAGER'].includes(role)) {
      return [
        { icon: 'cart-outline', label: locale === 'ar' ? 'المبيعات' : 'Sales', route: '/(drawer)/sales', color: theme.success },
        { icon: 'cube-outline', label: t('inventory', locale), route: '/(drawer)/inventory', color: theme.primary },
        { icon: 'document-text-outline', label: t('procurementOrders', locale), route: '/(drawer)/procurement', color: theme.info },
        { icon: 'swap-horizontal-outline', label: t('transactions', locale), route: '/(drawer)/transactions', color: theme.warning },
      ];
    }

    if (role === 'SHELF_SALES') {
      return [
        { icon: 'flash-outline', label: t('dailyAggregateInvoice', locale), route: '/(drawer)/daily-invoice', color: theme.success },
        { icon: 'cube-outline', label: locale === 'ar' ? 'مخزون الرف' : 'Shelf Inventory', route: '/(drawer)/shelf-inventory', color: theme.primary },
        { icon: 'cart-outline', label: t('salesOrders', locale), route: '/(drawer)/sales', color: theme.info },
        { icon: 'people-outline', label: t('customers', locale), route: '/(drawer)/customers', color: '#9C27B0' },
      ];
    }

    if (role === 'WAREHOUSE_SALES') {
      return [
        { icon: 'cube-outline', label: t('inventory', locale), route: '/(drawer)/inventory', color: theme.primary },
        { icon: 'download-outline', label: locale === 'ar' ? 'أوامر الشراء' : 'Purchase Orders', route: '/(drawer)/procurement', color: theme.info },
        { icon: 'send-outline', label: locale === 'ar' ? 'طلبات البيع' : 'Sales Orders', route: '/(drawer)/warehouse-sales-orders', color: theme.success },
        { icon: 'layers-outline', label: t('shelfRequests', locale), route: '/(drawer)/shelf-requests', color: '#9C27B0' },
      ];
    }

    if (role === 'PROCUREMENT') {
      return [
        { icon: 'document-text-outline', label: t('procurementOrders', locale), route: '/(drawer)/procurement', color: theme.primary },
        { icon: 'cube-outline', label: t('inventory', locale), route: '/(drawer)/inventory', color: theme.info },
      ];
    }

    if (role === 'ACCOUNTANT') {
      return [
        { icon: 'swap-horizontal-outline', label: t('transactions', locale), route: '/(drawer)/transactions', color: theme.primary },
        { icon: 'wallet-outline', label: t('liquidAssets', locale), route: '/(drawer)/liquid-assets', color: theme.success },
        { icon: 'card-outline', label: t('expenses', locale), route: '/(drawer)/expenses', color: theme.error },
        { icon: 'calculator-outline', label: t('budget', locale), route: '/(drawer)/budget', color: theme.info },
      ];
    }

    return [
      { icon: 'cube-outline', label: t('inventory', locale), route: '/(drawer)/inventory', color: theme.primary },
    ];
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

      {/* Day Status Card */}
      <TouchableOpacity
        style={[
          styles.dayStatusCard,
          {
            backgroundColor: isDayOpen ? theme.success + '18' : theme.error + '12',
            borderColor: isDayOpen ? theme.success : theme.error + '60',
          },
        ]}
        onPress={() => router.push('/(drawer)/exchange-rate')}
        activeOpacity={0.8}
      >
        <View style={[styles.dayStatusContent, isRtl && styles.dayStatusContentRtl]}>
          <View style={[styles.dayStatusIcon, { backgroundColor: isDayOpen ? theme.success + '25' : theme.error + '20' }]}>
            <Ionicons
              name={isDayOpen ? 'sunny' : 'moon'}
              size={26}
              color={isDayOpen ? theme.success : theme.error}
            />
          </View>
          <View style={styles.dayStatusInfo}>
            <Text style={[styles.dayStatusTitle, { color: isDayOpen ? theme.success : theme.error }, isRtl && styles.textRtl]}>
              {isDayOpen ? (locale === 'ar' ? 'اليوم مفتوح' : 'Day Open') : (locale === 'ar' ? 'اليوم مغلق' : 'Day Closed')}
            </Text>
            {isDayOpen && dayCycle?.exchangeRateUsdSdg ? (
              <Text style={[styles.exchangeRateText, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                1 USD = {Number(dayCycle.exchangeRateUsdSdg).toLocaleString()} SDG
              </Text>
            ) : (
              <Text style={[styles.exchangeRateText, { color: theme.textMuted }, isRtl && styles.textRtl]}>
                {locale === 'ar' ? 'اضغط لفتح اليوم' : 'Tap to open the day'}
              </Text>
            )}
          </View>
          <View style={[styles.dayStatusBadge, { backgroundColor: isDayOpen ? theme.success : theme.error }]}>
            <Text style={styles.dayStatusBadgeText}>
              {isDayOpen ? (locale === 'ar' ? 'مفتوح' : 'OPEN') : (locale === 'ar' ? 'مغلق' : 'CLOSED')}
            </Text>
          </View>
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
    paddingBottom: 80,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
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
    marginBottom: 14,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 11,
  },
  dayStatusCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
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
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionCard: {
    width: '48%',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    minHeight: 110,
    justifyContent: 'center',
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  textRtl: {
    textAlign: 'right',
  },
  dayStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dayStatusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
