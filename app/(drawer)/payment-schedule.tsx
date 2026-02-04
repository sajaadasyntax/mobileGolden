import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface ScheduledPayment {
  id: string;
  invoiceNumber: string;
  supplier: string;
  supplierNameAr?: string;
  amount: number;
  dueDate: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
}

export default function PaymentScheduleScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  const [payments, setPayments] = useState<ScheduledPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    try {
      const data = await api.accounting.paymentSchedules.list();
      
      if (data?.data) {
        setPayments(data.data.map((p: any) => ({
          id: p.id,
          invoiceNumber: p.invoice?.invoiceNumber || 'N/A',
          supplier: p.invoice?.supplier?.name || 'Unknown',
          supplierNameAr: p.invoice?.supplier?.nameAr,
          amount: Number(p.amountSdg) || 0,
          dueDate: p.dueDate?.split('T')[0] || '',
          status: p.status,
        })));
      }
    } catch (error) {
      console.error('Failed to load payment schedules:', error);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPayments();
    setRefreshing(false);
  };

  const handleMarkPaid = async (payment: ScheduledPayment) => {
    Alert.alert(
      locale === 'ar' ? 'تأكيد الدفع' : 'Confirm Payment',
      locale === 'ar' 
        ? `هل تم دفع ${payment.amount.toLocaleString()} ج.س للفاتورة ${payment.invoiceNumber}؟`
        : `Mark ${payment.amount.toLocaleString()} SDG for invoice ${payment.invoiceNumber} as paid?`,
      [
        { text: t('cancel', locale), style: 'cancel' },
        {
          text: locale === 'ar' ? 'تم الدفع' : 'Mark Paid',
          onPress: async () => {
            try {
              await api.accounting.paymentSchedules.markPaid(payment.id);
              Alert.alert(t('success', locale), locale === 'ar' ? 'تم تسجيل الدفع' : 'Payment recorded');
              loadPayments();
            } catch (error: any) {
              Alert.alert(t('error', locale), error?.message || 'Failed to mark as paid');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OVERDUE': return theme.error;
      case 'PENDING': 
        // Check if it's due today
        return theme.warning;
      case 'PAID': return theme.success;
      case 'CANCELLED': return theme.textMuted;
      default: return theme.textSecondary;
    }
  };

  const getStatusLabel = (status: string, dueDate: string) => {
    const today = new Date().toISOString().split('T')[0];
    
    if (status === 'PENDING' && dueDate === today) {
      return locale === 'ar' ? 'مستحق اليوم' : 'Due Today';
    }
    
    const labels: Record<string, { en: string; ar: string }> = {
      OVERDUE: { en: 'Overdue', ar: 'متأخر' },
      PENDING: { en: 'Upcoming', ar: 'قادم' },
      PAID: { en: 'Paid', ar: 'مدفوع' },
      CANCELLED: { en: 'Cancelled', ar: 'ملغى' },
    };
    return labels[status]?.[locale] || status;
  };

  const isDueToday = (dueDate: string) => {
    return dueDate === new Date().toISOString().split('T')[0];
  };

  const overduePayments = payments.filter(p => p.status === 'OVERDUE');
  const dueTodayPayments = payments.filter(p => p.status === 'PENDING' && isDueToday(p.dueDate));
  const upcomingPayments = payments.filter(p => p.status === 'PENDING' && !isDueToday(p.dueDate));

  const totalOverdue = overduePayments.reduce((sum, p) => sum + p.amount, 0);
  const totalDueToday = dueTodayPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalUpcoming = upcomingPayments.reduce((sum, p) => sum + p.amount, 0);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: theme.errorBackground }]}>
          <Ionicons name="alert-circle" size={24} color={theme.error} />
          <Text style={[styles.summaryLabel, { color: theme.error }]}>
            {locale === 'ar' ? 'متأخر' : 'Overdue'}
          </Text>
          <Text style={[styles.summaryAmount, { color: theme.error }]}>
            {totalOverdue.toLocaleString()}
          </Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: theme.warningBackground }]}>
          <Ionicons name="time" size={24} color={theme.warning} />
          <Text style={[styles.summaryLabel, { color: theme.warning }]}>
            {locale === 'ar' ? 'اليوم' : 'Due Today'}
          </Text>
          <Text style={[styles.summaryAmount, { color: theme.warning }]}>
            {totalDueToday.toLocaleString()}
          </Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: theme.primaryBackground }]}>
          <Ionicons name="calendar" size={24} color={theme.primary} />
          <Text style={[styles.summaryLabel, { color: theme.primary }]}>
            {locale === 'ar' ? 'قادم' : 'Upcoming'}
          </Text>
          <Text style={[styles.summaryAmount, { color: theme.primary }]}>
            {totalUpcoming.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Payment List */}
      <ScrollView
        style={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Overdue Section */}
        {overduePayments.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.error }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'دفعات متأخرة' : 'Overdue Payments'}
            </Text>
            {overduePayments.map((payment) => (
              <PaymentCard 
                key={payment.id} 
                payment={payment} 
                theme={theme} 
                locale={locale} 
                isRtl={isRtl}
                getStatusColor={getStatusColor}
                getStatusLabel={getStatusLabel}
                onMarkPaid={() => handleMarkPaid(payment)}
              />
            ))}
          </View>
        )}

        {/* Due Today Section */}
        {dueTodayPayments.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.warning }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'مستحقة اليوم' : 'Due Today'}
            </Text>
            {dueTodayPayments.map((payment) => (
              <PaymentCard 
                key={payment.id} 
                payment={payment} 
                theme={theme} 
                locale={locale} 
                isRtl={isRtl}
                getStatusColor={getStatusColor}
                getStatusLabel={getStatusLabel}
                onMarkPaid={() => handleMarkPaid(payment)}
              />
            ))}
          </View>
        )}

        {/* Upcoming Section */}
        {upcomingPayments.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.primary }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'دفعات قادمة' : 'Upcoming Payments'}
            </Text>
            {upcomingPayments.map((payment) => (
              <PaymentCard 
                key={payment.id} 
                payment={payment} 
                theme={theme} 
                locale={locale} 
                isRtl={isRtl}
                getStatusColor={getStatusColor}
                getStatusLabel={getStatusLabel}
                onMarkPaid={() => handleMarkPaid(payment)}
              />
            ))}
          </View>
        )}

        {/* Empty State */}
        {payments.filter(p => p.status !== 'PAID' && p.status !== 'CANCELLED').length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color={theme.success} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'لا توجد دفعات مجدولة' : 'No scheduled payments'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function PaymentCard({ payment, theme, locale, isRtl, getStatusColor, getStatusLabel, onMarkPaid }: any) {
  return (
    <View
      style={[styles.paymentCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
    >
      <View style={[styles.paymentHeader, isRtl && styles.rowReverse]}>
        <View style={[styles.paymentInfo, isRtl && { alignItems: 'flex-end' }]}>
          <Text style={[styles.invoiceNumber, { color: theme.text }, isRtl && styles.textRtl]}>
            {payment.invoiceNumber}
          </Text>
          <Text style={[styles.supplierName, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {isRtl ? (payment.supplierNameAr || payment.supplier) : payment.supplier}
          </Text>
        </View>
        <View style={[
          styles.statusBadge,
          { backgroundColor: `${getStatusColor(payment.status)}20` }
        ]}>
          <Text style={[styles.statusText, { color: getStatusColor(payment.status) }]}>
            {getStatusLabel(payment.status, payment.dueDate)}
          </Text>
        </View>
      </View>
      
      <View style={[styles.paymentFooter, { borderTopColor: theme.border }, isRtl && styles.rowReverse]}>
        <View style={isRtl ? { alignItems: 'flex-end' } : {}}>
          <Text style={[styles.dateLabel, { color: theme.textMuted }]}>
            {locale === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}
          </Text>
          <Text style={[styles.dateValue, { color: getStatusColor(payment.status) }]}>
            {payment.dueDate}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.paymentAmount, { color: theme.text }]}>
            {payment.amount.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
          </Text>
          {payment.status !== 'PAID' && payment.status !== 'CANCELLED' && (
            <TouchableOpacity 
              style={[styles.payButton, { backgroundColor: theme.success }]}
              onPress={onMarkPaid}
            >
              <Text style={styles.payButtonText}>
                {locale === 'ar' ? 'تسجيل الدفع' : 'Mark Paid'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
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
    padding: 16,
    paddingBottom: 0,
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  summaryAmount: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  listContainer: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  paymentCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  paymentInfo: {
    flex: 1,
  },
  invoiceNumber: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  supplierName: {
    fontSize: 13,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  paymentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  dateLabel: {
    fontSize: 11,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  payButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 6,
  },
  payButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  textRtl: {
    textAlign: 'right',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
});
