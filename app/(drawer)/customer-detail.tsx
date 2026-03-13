import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface Customer {
  id: string;
  name: string;
  nameAr?: string;
  phone?: string;
  email?: string;
  customerType: 'WHOLESALE' | 'RETAIL';
  creditLimitSdg: number;
  isActive: boolean;
}

interface OutstandingInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalSdg: number;
  paidAmountSdg: number;
  status: string;
}

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [outstandingInvoices, setOutstandingInvoices] = useState<OutstandingInvoice[]>([]);
  const [balanceSdg, setBalanceSdg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      if (!id) return;

      // Fetch customer data
      const customerData = await api.sales.customers.getById(id);
      const customerResult = customerData?.result?.data?.json ?? customerData?.result?.data ?? customerData;

      if (customerResult) {
        setCustomer({
          id: customerResult.id,
          name: customerResult.name,
          nameAr: customerResult.nameAr,
          phone: customerResult.phone,
          email: customerResult.email,
          customerType: customerResult.customerType || 'RETAIL',
          creditLimitSdg: Number(customerResult.creditLimitSdg) || 0,
          isActive: customerResult.isActive ?? true,
        });
      }

      // Fetch outstanding receivables for this customer
      const branchId = user?.branchId;
      if (branchId) {
        try {
          const receivables = await api.accounting.reports.outstandingReceivables(branchId, id);
          const invoices = receivables?.invoices ?? receivables?.result?.data?.json?.invoices ?? [];
          const total = receivables?.totalReceivables ?? receivables?.result?.data?.json?.totalReceivables ?? 0;
          setOutstandingInvoices(
            (Array.isArray(invoices) ? invoices : []).map((inv: any) => ({
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              invoiceDate: inv.invoiceDate || inv.createdAt,
              totalSdg: Number(inv.totalSdg) || 0,
              paidAmountSdg: Number(inv.paidAmountSdg) || 0,
              status: inv.status || 'ISSUED',
            }))
          );
          setBalanceSdg(Number(total) || 0);
        } catch (err) {
          console.warn('Failed to load outstanding receivables:', err);
          setOutstandingInvoices([]);
          setBalanceSdg(0);
        }
      } else {
        setOutstandingInvoices([]);
        setBalanceSdg(0);
      }
    } catch (error) {
      console.error('Failed to load customer details:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return `${amount.toLocaleString()} ${locale === 'ar' ? 'ج.س' : 'SDG'}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderInvoice = ({ item }: { item: OutstandingInvoice }) => {
    const remaining = item.totalSdg - item.paidAmountSdg;
    return (
      <TouchableOpacity
        style={[styles.invoiceCard, { backgroundColor: theme.card }, isRtl && styles.invoiceCardRtl]}
        onPress={() => router.push({ pathname: '/(drawer)/outstanding-invoices' })}
      >
        <View style={[styles.invoiceIcon, { backgroundColor: theme.warning + '20' }]}>
          <Ionicons name="document-text" size={24} color={theme.warning} />
        </View>
        <View style={[styles.invoiceContent, isRtl && styles.invoiceContentRtl]}>
          <View style={[styles.invoiceHeader, isRtl && styles.invoiceHeaderRtl]}>
            <Text style={[styles.invoiceNumber, { color: theme.text }]}>{item.invoiceNumber}</Text>
            <View style={[styles.statusBadge, { backgroundColor: theme.warning + '20' }]}>
              <Text style={[styles.statusText, { color: theme.warning }]}>{item.status}</Text>
            </View>
          </View>
          <Text style={[styles.invoiceDate, { color: theme.textMuted }, isRtl && styles.textRtl]}>
            {formatDate(item.invoiceDate)}
          </Text>
        </View>
        <View style={[styles.invoiceAmount, isRtl && styles.invoiceAmountRtl]}>
          <Text style={[styles.amountValue, { color: theme.primary }]}>
            {formatCurrency(remaining)}
          </Text>
          <Text style={[styles.amountLabel, { color: theme.textMuted }]}>
            {locale === 'ar' ? 'متبقي' : 'remaining'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <Ionicons name="person-outline" size={48} color={theme.textSecondary} />
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          {locale === 'ar' ? 'العميل غير موجود' : 'Customer not found'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Customer Header Card */}
        <View style={[styles.headerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.customerHeader, isRtl && styles.customerHeaderRtl]}>
            <View style={[styles.customerIcon, { backgroundColor: '#8b5cf620' }]}>
              <Ionicons name="person" size={32} color="#8b5cf6" />
            </View>
            <View style={[styles.customerInfo, isRtl && styles.customerInfoRtl]}>
              <Text style={[styles.customerName, { color: theme.text }, isRtl && styles.textRtl]}>
                {locale === 'ar' && customer.nameAr ? customer.nameAr : customer.name}
              </Text>
              {customer.phone && (
                <View style={[styles.contactRow, isRtl && styles.contactRowRtl]}>
                  <Ionicons name="call-outline" size={14} color={theme.textSecondary} />
                  <Text style={[styles.contactText, { color: theme.textSecondary }]}>
                    {customer.phone}
                  </Text>
                </View>
              )}
              <View style={[styles.typeBadge, customer.customerType === 'WHOLESALE' ? styles.wholesaleBadge : styles.retailBadge]}>
                <Text style={[styles.typeText, customer.customerType === 'WHOLESALE' ? styles.wholesaleText : styles.retailText]}>
                  {customer.customerType === 'WHOLESALE' ? t('wholesale', locale) : t('retail', locale)}
                </Text>
              </View>
            </View>
          </View>

          {/* Outstanding Balance */}
          <View style={[styles.balanceCard, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
            <Text style={[styles.balanceLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'المبلغ المستحق' : 'Amount Owed'}
            </Text>
            <Text style={[styles.balanceAmount, { color: balanceSdg > 0 ? theme.error : theme.success }, isRtl && styles.textRtl]}>
              {formatCurrency(Math.abs(balanceSdg))}
            </Text>
          </View>
        </View>

        {/* Outstanding Invoices List */}
        <View style={styles.invoicesSection}>
          <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'الفواتير المعلقة' : 'Outstanding Invoices'} ({outstandingInvoices.length})
          </Text>
          {outstandingInvoices.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'لا توجد فواتير معلقة' : 'No outstanding invoices'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={outstandingInvoices}
              keyExtractor={(item) => item.id}
              renderItem={renderInvoice}
              scrollEnabled={false}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  headerCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  customerHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  customerIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  customerInfoRtl: {
    marginLeft: 0,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  customerName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  contactRowRtl: {
    flexDirection: 'row-reverse',
  },
  contactText: {
    fontSize: 14,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  wholesaleBadge: {
    backgroundColor: '#3b82f620',
  },
  retailBadge: {
    backgroundColor: '#f59e0b20',
  },
  typeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  wholesaleText: {
    color: '#3b82f6',
  },
  retailText: {
    color: '#f59e0b',
  },
  balanceCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '700',
  },
  invoicesSection: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  listContent: {
    gap: 12,
  },
  invoiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
  },
  invoiceCardRtl: {
    flexDirection: 'row-reverse',
  },
  invoiceIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  invoiceContent: {
    flex: 1,
    marginLeft: 12,
  },
  invoiceContentRtl: {
    marginLeft: 0,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  invoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  invoiceHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  invoiceDate: {
    fontSize: 12,
  },
  invoiceAmount: {
    alignItems: 'flex-end',
  },
  invoiceAmountRtl: {
    alignItems: 'flex-start',
  },
  amountValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  amountLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  textRtl: {
    textAlign: 'right',
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
});
