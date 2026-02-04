import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface BudgetCategory {
  id: string;
  name: string;
  nameAr?: string;
  allocated: number;
  spent: number;
  icon?: string;
  color?: string;
}

const categoryIcons: Record<string, { icon: string; color: string }> = {
  inventory: { icon: 'cube', color: '#6366f1' },
  salaries: { icon: 'people', color: '#10b981' },
  operations: { icon: 'settings', color: '#ef4444' },
  marketing: { icon: 'megaphone', color: '#f59e0b' },
  utilities: { icon: 'flash', color: '#8b5cf6' },
  rent: { icon: 'home', color: '#ec4899' },
  default: { icon: 'wallet', color: '#3b82f6' },
};

export default function BudgetScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [budget, setBudget] = useState<BudgetCategory[]>([]);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    loadBudget();
  }, [user?.branchId, period]);

  const loadBudget = async () => {
    try {
      if (!user?.branchId) return;
      
      // Load budget data from the budget API
      const budgetData = await api.accounting.budget.list(user.branchId, period);
      
      if (budgetData?.items) {
        setBudget(budgetData.items.map((cat: any) => ({
          id: cat.categoryId || String(Math.random()),
          name: cat.categoryName || 'Unknown',
          nameAr: cat.categoryNameAr,
          allocated: Number(cat.allocatedSdg) || 0,
          spent: Number(cat.spentSdg) || 0,
          icon: undefined,
          color: undefined,
        })));
      }
    } catch (error) {
      console.error('Failed to load budget:', error);
      setBudget([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBudget();
    setRefreshing(false);
  };

  const getCategoryStyle = (name: string) => {
    const key = name.toLowerCase().replace(/\s+/g, '');
    return categoryIcons[key] || categoryIcons.default;
  };

  const totalAllocated = budget.reduce((sum, b) => sum + b.allocated, 0);
  const totalSpent = budget.reduce((sum, b) => sum + b.spent, 0);
  const remaining = totalAllocated - totalSpent;

  const getStatusInfo = (allocated: number, spent: number) => {
    if (allocated === 0) return { status: locale === 'ar' ? 'غير محدد' : 'Not set', color: theme.textMuted };
    const percentage = (spent / allocated) * 100;
    if (percentage >= 100) {
      return { status: t('overBudget', locale), color: theme.error };
    } else if (percentage >= 80) {
      return { status: locale === 'ar' ? 'قارب على الانتهاء' : 'Near limit', color: theme.warning };
    }
    return { status: t('onTrack', locale), color: theme.success };
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US').format(amount);
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
      {/* Budget Overview */}
      <View style={[styles.overviewCard, { backgroundColor: theme.card, borderColor: theme.primaryBackground }]}>
        <Text style={[styles.periodText, { color: theme.primary }, isRtl && styles.textRtl]}>
          {new Date(period + '-01').toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-US', { 
            year: 'numeric', 
            month: 'long' 
          })}
        </Text>
        
        <View style={styles.overviewGrid}>
          <View style={styles.overviewItem}>
            <Text style={[styles.overviewLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {t('allocatedAmount', locale)}
            </Text>
            <Text style={[styles.overviewValue, { color: theme.text }]}>{formatAmount(totalAllocated)}</Text>
            <Text style={[styles.overviewCurrency, { color: theme.textSecondary }]}>{locale === 'ar' ? 'ج.س' : 'SDG'}</Text>
          </View>
          <View style={styles.overviewItem}>
            <Text style={[styles.overviewLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {t('spentAmount', locale)}
            </Text>
            <Text style={[styles.overviewValue, { color: theme.warning }]}>{formatAmount(totalSpent)}</Text>
            <Text style={[styles.overviewCurrency, { color: theme.textSecondary }]}>{locale === 'ar' ? 'ج.س' : 'SDG'}</Text>
          </View>
          <View style={styles.overviewItem}>
            <Text style={[styles.overviewLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {t('remainingAmount', locale)}
            </Text>
            <Text style={[styles.overviewValue, { color: remaining >= 0 ? theme.success : theme.error }]}>
              {formatAmount(remaining)}
            </Text>
            <Text style={[styles.overviewCurrency, { color: theme.textSecondary }]}>{locale === 'ar' ? 'ج.س' : 'SDG'}</Text>
          </View>
        </View>

        {/* Progress Bar */}
        {totalAllocated > 0 && (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: theme.backgroundTertiary }]}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: `${Math.min((totalSpent / totalAllocated) * 100, 100)}%`,
                    backgroundColor: totalSpent > totalAllocated ? theme.error : theme.primary,
                  }
                ]} 
              />
            </View>
            <Text style={[styles.progressText, { color: theme.text }]}>
              {((totalSpent / totalAllocated) * 100).toFixed(0)}%
            </Text>
          </View>
        )}
      </View>

      {/* Budget Categories */}
      <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
        {locale === 'ar' ? 'فئات الميزانية' : 'Budget Categories'}
      </Text>

      {budget.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="pie-chart-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {locale === 'ar' ? 'لا توجد بيانات ميزانية' : 'No budget data available'}
          </Text>
        </View>
      ) : (
        budget.map((category) => {
          const percentage = category.allocated > 0 ? (category.spent / category.allocated) * 100 : 0;
          const statusInfo = getStatusInfo(category.allocated, category.spent);
          const style = getCategoryStyle(category.name);
          const categoryColor = category.color || style.color;
          
          return (
            <View key={category.id} style={[styles.categoryCard, { backgroundColor: theme.card }]}>
              <View style={[styles.categoryHeader, isRtl && styles.categoryHeaderRtl]}>
                <View style={[styles.categoryIcon, { backgroundColor: categoryColor + '15' }]}>
                  <Ionicons name={category.icon as any || style.icon as any} size={24} color={categoryColor} />
                </View>
                <View style={[styles.categoryInfo, isRtl && styles.categoryInfoRtl]}>
                  <Text style={[styles.categoryName, { color: theme.text }, isRtl && styles.textRtl]}>
                    {locale === 'ar' ? category.nameAr || category.name : category.name}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '20' }]}>
                    <Text style={[styles.statusText, { color: statusInfo.color }]}>
                      {statusInfo.status}
                    </Text>
                  </View>
                </View>
              </View>
              
              <View style={styles.categoryProgress}>
                <View style={[styles.progressBar, { backgroundColor: theme.backgroundTertiary }]}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { 
                        width: `${Math.min(percentage, 100)}%`,
                        backgroundColor: categoryColor,
                      }
                    ]} 
                  />
                </View>
              </View>
              
              <View style={[styles.categoryAmounts, isRtl && styles.categoryAmountsRtl]}>
                <Text style={[styles.spentText, { color: theme.textSecondary }]}>
                  {formatAmount(category.spent)} / {formatAmount(category.allocated)} {locale === 'ar' ? 'ج.س' : 'SDG'}
                </Text>
                <Text style={[styles.percentText, { color: categoryColor }]}>
                  {percentage.toFixed(0)}%
                </Text>
              </View>
            </View>
          );
        })
      )}
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
  overviewCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
  },
  periodText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  overviewGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  overviewItem: {
    flex: 1,
    alignItems: 'center',
  },
  overviewLabel: {
    fontSize: 11,
    marginBottom: 4,
    textAlign: 'center',
  },
  overviewValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  overviewCurrency: {
    fontSize: 11,
    marginTop: 2,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
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
  categoryCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 12,
  },
  categoryInfoRtl: {
    marginLeft: 0,
    marginRight: 12,
    flexDirection: 'row-reverse',
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  categoryProgress: {
    marginBottom: 8,
  },
  categoryAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryAmountsRtl: {
    flexDirection: 'row-reverse',
  },
  spentText: {
    fontSize: 12,
  },
  percentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  textRtl: {
    textAlign: 'right',
  },
});
