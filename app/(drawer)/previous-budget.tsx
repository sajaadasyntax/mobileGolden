import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface BudgetPeriod {
  id: string;
  period: string;
  monthName: string;
  monthNameAr: string;
  totalSdg: number;
}

export default function PreviousBudgetScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const [periods, setPeriods] = useState<BudgetPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isRtl = locale === 'ar';

  useEffect(() => {
    loadPreviousBudgets();
  }, [user?.branchId]);

  const loadPreviousBudgets = async () => {
    try {
      if (!user?.branchId) return;
      
      const data = await api.accounting.budget.getPreviousPeriods(user.branchId, 12);
      
      if (data && Array.isArray(data)) {
        setPeriods(data.map((p: any, index: number) => ({
          id: p.period || String(index),
          period: p.period,
          monthName: p.monthName,
          monthNameAr: p.monthNameAr,
          totalSdg: Number(p.totalSdg) || 0,
        })));
      }
    } catch (error) {
      console.error('Failed to load previous budgets:', error);
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPreviousBudgets();
    setRefreshing(false);
  };

  const getAmountStatus = (amount: number) => {
    // Determine status based on amount thresholds
    if (amount === 0) {
      return { label: locale === 'ar' ? 'لا مصروفات' : 'No expenses', color: theme.textMuted, icon: 'remove-circle' };
    } else if (amount < 100000) {
      return { label: t('underBudget', locale), color: theme.success, icon: 'trending-down' };
    } else if (amount > 500000) {
      return { label: t('overBudget', locale), color: theme.error, icon: 'trending-up' };
    }
    return { label: t('onTrack', locale), color: theme.primary, icon: 'checkmark-circle' };
  };

  // Calculate summary stats
  const totalPeriods = periods.length;
  const totalSpent = periods.reduce((sum, p) => sum + p.totalSdg, 0);
  const avgSpent = totalPeriods > 0 ? totalSpent / totalPeriods : 0;

  const renderPeriod = ({ item }: { item: BudgetPeriod }) => {
    const statusConfig = getAmountStatus(item.totalSdg);
    
    return (
      <TouchableOpacity style={[styles.periodCard, { backgroundColor: theme.card }]}>
        <View style={[styles.periodHeader, isRtl && styles.periodHeaderRtl]}>
          <View style={[styles.periodInfo, isRtl && styles.periodInfoRtl]}>
            <Text style={[styles.periodName, { color: theme.text }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? item.monthNameAr : item.monthName}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + '20' }]}>
              <Ionicons name={statusConfig.icon as any} size={12} color={statusConfig.color} />
              <Text style={[styles.statusText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.amountsRow, isRtl && styles.amountsRowRtl]}>
          <View style={styles.amountItem}>
            <Text style={[styles.amountLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {t('spentAmount', locale)}
            </Text>
            <Text style={[styles.amountValue, { color: theme.text }]}>
              {item.totalSdg.toLocaleString()}
            </Text>
            <Text style={[styles.currencyText, { color: theme.textMuted }]}>
              {locale === 'ar' ? 'ج.س' : 'SDG'}
            </Text>
          </View>
          <View style={styles.amountItem}>
            <Text style={[styles.amountLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'الفرق عن المتوسط' : 'Vs Average'}
            </Text>
            <Text style={[
              styles.amountValue, 
              { color: item.totalSdg <= avgSpent ? theme.success : theme.error }
            ]}>
              {item.totalSdg <= avgSpent ? '-' : '+'}
              {Math.abs(item.totalSdg - avgSpent).toLocaleString()}
            </Text>
            <Text style={[styles.currencyText, { color: theme.textMuted }]}>
              {locale === 'ar' ? 'ج.س' : 'SDG'}
            </Text>
          </View>
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
      {/* Summary Stats */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.summaryValue, { color: theme.text }]}>{totalPeriods}</Text>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'الفترات' : 'Periods'}
          </Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: theme.primaryBackground }]}>
          <Text style={[styles.summaryValue, { color: theme.primary }]}>
            {Math.round(avgSpent / 1000)}K
          </Text>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'المتوسط الشهري' : 'Avg/Month'}
          </Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: theme.warningBackground }]}>
          <Text style={[styles.summaryValue, { color: theme.warning }]}>
            {Math.round(totalSpent / 1000)}K
          </Text>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'الإجمالي' : 'Total'}
          </Text>
        </View>
      </View>

      {/* Periods List */}
      <FlatList
        data={periods}
        keyExtractor={(item) => item.id}
        renderItem={renderPeriod}
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
            <Ionicons name="time-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noData', locale)}</Text>
          </View>
        }
      />
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
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  periodCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  periodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  periodHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  periodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'space-between',
  },
  periodInfoRtl: {
    flexDirection: 'row-reverse',
  },
  periodName: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  amountsRowRtl: {
    flexDirection: 'row-reverse',
  },
  amountItem: {
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  currencyText: {
    fontSize: 10,
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
});
