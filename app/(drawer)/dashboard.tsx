import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

export default function DashboardScreen() {
  const { user } = useAuthStore();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const [refreshing, setRefreshing] = useState(false);
  const [dayCycle, setDayCycle] = useState<any>(null);
  const isRtl = locale === 'ar';

  const loadData = async () => {
    try {
      if (user?.branchId) {
        const cycle = await api.dayCycle.getCurrent(user.branchId);
        setDayCycle(cycle);
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
      {/* Simple Header */}
      <View style={[styles.header, isRtl && styles.headerRtl]}>
        <View>
          <Text style={[styles.greeting, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {t('welcomeBack', locale)}
          </Text>
          <Text style={[styles.userName, { color: theme.text }, isRtl && styles.textRtl]}>
            {user?.name}
          </Text>
        </View>
        {user?.branch && (
          <View style={[styles.branchBadge, { backgroundColor: theme.primaryBackground }]}>
            <Text style={[styles.branchText, { color: theme.primary }]}>
              {isRtl ? user.branch.nameAr : user.branch.name}
            </Text>
          </View>
        )}
      </View>

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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerRtl: {
    flexDirection: 'row-reverse',
  },
  greeting: {
    fontSize: 14,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
  },
  branchBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  branchText: {
    fontSize: 12,
    fontWeight: '600',
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
