import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface UserSalesData {
  user: { id: string; name: string; nameAr: string | null; email: string };
  totalSalesUsd: number;
  totalSalesSdg: number;
  totalCOGS: number;
  grossProfit: number;
  invoiceCount: number;
  itemsSold: number;
}

interface ReportData {
  users: UserSalesData[];
  summary: {
    totalRevenue: number;
    totalCOGS: number;
    totalProfit: number;
    profitMargin: number;
  };
}

function getMonthStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthEnd(date: Date): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d;
}

export default function UserSalesReportScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFrom, setDateFrom] = useState(getMonthStart(new Date()));
  const [dateTo, setDateTo] = useState(getMonthEnd(new Date()));
  const [showDatePicker, setShowDatePicker] = useState<'from' | 'to' | null>(null);
  const [data, setData] = useState<ReportData | null>(null);

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US').format(amount);

  const toISOString = (d: Date) => d.toISOString().slice(0, 10);

  useEffect(() => {
    loadReport();
  }, [dateFrom, dateTo]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const result = await api.accounting.reports.userSalesProfit({
        dateFrom: toISOString(dateFrom),
        dateTo: toISOString(dateTo),
      });
      setData(result ?? null);
    } catch (error) {
      console.error('Failed to load user sales report:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReport();
    setRefreshing(false);
  };

  const handleDateChange = (mode: 'from' | 'to') => (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(null);
    }
    if (selectedDate) {
      if (mode === 'from') {
        setDateFrom(selectedDate);
        if (selectedDate > dateTo) {
          setDateTo(selectedDate);
        }
      } else {
        setDateTo(selectedDate);
        if (selectedDate < dateFrom) {
          setDateFrom(selectedDate);
        }
      }
    }
    if (Platform.OS === 'ios') {
      setShowDatePicker(null);
    }
  };

  if (loading && !data) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const summary = data?.summary ?? {
    totalRevenue: 0,
    totalCOGS: 0,
    totalProfit: 0,
    profitMargin: 0,
  };
  const users = data?.users ?? [];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Date Range Selector */}
      <View style={[styles.dateRow, { backgroundColor: theme.surface, borderBottomColor: theme.border }, isRtl && styles.rowReverse]}>
        <TouchableOpacity
          style={[styles.dateButton, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
          onPress={() => setShowDatePicker('from')}
        >
          <Ionicons name="calendar-outline" size={18} color={theme.primary} />
          <Text style={[styles.dateButtonText, { color: theme.text }, isRtl && styles.textRtl]}>
            {dateFrom.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US')}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.dateSeparator, { color: theme.textSecondary }]}>—</Text>
        <TouchableOpacity
          style={[styles.dateButton, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
          onPress={() => setShowDatePicker('to')}
        >
          <Ionicons name="calendar-outline" size={18} color={theme.primary} />
          <Text style={[styles.dateButtonText, { color: theme.text }, isRtl && styles.textRtl]}>
            {dateTo.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US')}
          </Text>
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={showDatePicker === 'from' ? dateFrom : dateTo}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange(showDatePicker)}
          maximumDate={showDatePicker === 'from' ? dateTo : undefined}
          minimumDate={showDatePicker === 'to' ? dateFrom : undefined}
        />
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Summary Cards */}
        <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
          {locale === 'ar' ? 'الملخص' : 'Summary'}
        </Text>
        <View style={[styles.summaryGrid, isRtl && styles.rowReverse]}>
          <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Ionicons name="cash-outline" size={24} color={theme.primary} />
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue'}
            </Text>
            <Text style={[styles.summaryValue, { color: theme.text }, isRtl && styles.textRtl]}>
              ${formatAmount(summary.totalRevenue)}
            </Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Ionicons name="pricetag-outline" size={24} color={theme.error} />
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'تكلفة البضاعة' : 'Total COGS'}
            </Text>
            <Text style={[styles.summaryValue, { color: theme.text }, isRtl && styles.textRtl]}>
              ${formatAmount(summary.totalCOGS)}
            </Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Ionicons name="trending-up" size={24} color={theme.success} />
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'إجمالي الربح' : 'Total Profit'}
            </Text>
            <Text style={[styles.summaryValue, { color: theme.success }, isRtl && styles.textRtl]}>
              ${formatAmount(summary.totalProfit)}
            </Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Ionicons name="pie-chart-outline" size={24} color={theme.warning} />
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'هامش الربح %' : 'Profit Margin %'}
            </Text>
            <Text style={[styles.summaryValue, { color: theme.warning }, isRtl && styles.textRtl]}>
              {formatAmount(summary.profitMargin)}%
            </Text>
          </View>
        </View>

        {/* User List */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 24 }, isRtl && styles.textRtl]}>
          {locale === 'ar' ? 'المبيعات حسب المستخدم' : 'Sales by User'}
        </Text>

        {users.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Ionicons name="people-outline" size={40} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'لا توجد بيانات للفترة المحددة' : 'No data for selected period'}
            </Text>
          </View>
        ) : (
          <View style={styles.userList}>
            {users.map((row) => (
              <View
                key={row.user.id}
                style={[styles.userCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }, isRtl && styles.rowReverse]}
              >
                <View style={[styles.userInfo, isRtl && styles.userInfoRtl]}>
                  <Text style={[styles.userName, { color: theme.text }, isRtl && styles.textRtl]} numberOfLines={1}>
                    {isRtl ? (row.user.nameAr || row.user.name) : row.user.name}
                  </Text>
                  <Text style={[styles.userMeta, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                    {row.invoiceCount} {locale === 'ar' ? 'فاتورة' : 'invoices'} • {row.itemsSold} {locale === 'ar' ? 'عناصر' : 'items'}
                  </Text>
                </View>
                <View style={[styles.userAmounts, isRtl && styles.userAmountsRtl]}>
                  <Text style={[styles.amountSales, { color: theme.text }, isRtl && styles.textRtl]}>
                    ${formatAmount(row.totalSalesUsd)} {locale === 'ar' ? 'مبيعات' : 'sales'}
                  </Text>
                  <Text style={[styles.amountProfit, { color: row.grossProfit >= 0 ? theme.success : theme.error }, isRtl && styles.textRtl]}>
                    ${formatAmount(row.grossProfit)} {locale === 'ar' ? 'ربح' : 'profit'}
                  </Text>
                </View>
              </View>
            ))}
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
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  dateButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dateSeparator: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    minWidth: '47%',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  summaryLabel: {
    fontSize: 12,
    marginTop: 8,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  userList: {
    gap: 12,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  userInfo: {
    flex: 1,
  },
  userInfoRtl: {
    alignItems: 'flex-end',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  userMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  userAmounts: {
    alignItems: 'flex-end',
  },
  userAmountsRtl: {
    alignItems: 'flex-start',
  },
  amountSales: {
    fontSize: 14,
    fontWeight: '600',
  },
  amountProfit: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
  },
  textRtl: {
    textAlign: 'right',
  },
});
