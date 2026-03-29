import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { t } from '@/lib/i18n';
import { api, getFullUrl } from '@/lib/api';
import { offlineVoidInvoice, getLocalQueuedInvoices } from '@/lib/offlineApi';
import { connectivity } from '@/lib/connectivity';

interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalSdg: number;
  totalUsd: number;
  status: string;
  invoiceType: string;
  paymentMethod?: string;
  transactionNumber?: string;
  receiptImageUrls?: string[];
  customer?: { name: string };
  createdBy?: { id: string; name: string };
  shelf?: { name: string; nameAr: string };
  lines?: Array<{
    id: string;
    qty: number;
    unitPriceSdg: number;
    totalSdg: number;
    item: { nameEn: string; nameAr: string; sku: string; unit?: { nameEn: string } };
  }>;
}

export default function SalesScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const showUsd = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptImages, setReceiptImages] = useState<string[]>([]);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailedInvoice, setDetailedInvoice] = useState<SalesInvoice | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'paid' | 'outstanding' | 'cancelled'>('all');
  const isRtl = locale === 'ar';
  const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  // Check if user can void invoices
  const canVoidInvoice = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const loadInvoices = async () => {
    try {
      if (user?.branchId) {
        // Merge server invoices with locally queued offline invoices
        const queued = await getLocalQueuedInvoices();
        const queuedFormatted: SalesInvoice[] = queued.map((q: any) => ({
          id: q._localRef,
          invoiceNumber: q._localRef,
          invoiceDate: new Date(q._createdAt).toISOString(),
          totalSdg: 0,
          totalUsd: 0,
          status: 'OFFLINE_PENDING',
          invoiceType: q.invoiceType || 'RETAIL',
          _queued: true,
        }));

        if (connectivity.isOnline()) {
          const result = await api.sales.invoices(user.branchId);
          const serverInvoices = result?.result?.data?.data || result?.data || [];
          setInvoices([...queuedFormatted, ...serverInvoices]);
        } else {
          setInvoices(queuedFormatted);
        }
      }
    } catch (error) {
      console.error('Failed to load invoices:', error);
      Alert.alert(locale === 'ar' ? 'خطأ' : 'Error', locale === 'ar' ? 'فشل تحميل الفواتير' : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadInvoices();
    }, [user])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInvoices();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return theme.success;
      case 'CONFIRMED':
      case 'ISSUED':
        return theme.primary;
      case 'DRAFT':
        return theme.textSecondary;
      case 'CANCELLED':
        return theme.error;
      default:
        return theme.warning;
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return `${amount.toLocaleString()} ${currency === 'USD' ? t('usd', locale) : t('sdg', locale)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const handleInvoicePress = async (invoice: SalesInvoice) => {
    // Admin/manager navigate to full detail screen
    if (isAdminOrManager) {
      router.push({ pathname: '/(drawer)/sales-invoice-detail', params: { id: invoice.id } });
      return;
    }
    setSelectedInvoice(invoice);
    setShowActionModal(true);
    // Fetch full details in background
    if (showUsd) {
      setLoadingDetail(true);
      try {
        const detail = await api.sales.getInvoice(invoice.id);
        setDetailedInvoice(detail);
      } catch (e) {
        console.error('Failed to load invoice detail', e);
      } finally {
        setLoadingDetail(false);
      }
    }
  };

  const handleVoidInvoice = async () => {
    if (!selectedInvoice) return;
    
    Alert.alert(
      locale === 'ar' ? 'إلغاء الفاتورة' : 'Void Invoice',
      locale === 'ar' 
        ? `هل أنت متأكد من إلغاء الفاتورة ${selectedInvoice.invoiceNumber}؟`
        : `Are you sure you want to void invoice ${selectedInvoice.invoiceNumber}?`,
      [
        { text: t('cancel', locale), style: 'cancel' },
        {
          text: locale === 'ar' ? 'إلغاء الفاتورة' : 'Void Invoice',
          style: 'destructive',
          onPress: async () => {
            try {
              const userCtx = {
                userId: user!.id,
                branchId: user!.branchId!,
                shelfId: (user as any)?.shelf?.id,
                role: user!.role,
              };
              const outcome = await offlineVoidInvoice(selectedInvoice.id, undefined, userCtx);
              Alert.alert(
                t('success', locale),
                outcome.queued
                  ? (locale === 'ar' ? 'تم تسجيل الإلغاء وسيتم تطبيقه عند الاتصال' : 'Void queued — will apply when online')
                  : (locale === 'ar' ? 'تم إلغاء الفاتورة بنجاح' : 'Invoice voided successfully')
              );
              setShowActionModal(false);
              setSelectedInvoice(null);
              loadInvoices();
            } catch (error: any) {
              Alert.alert(
                t('error', locale),
                error?.message || (locale === 'ar' ? 'فشل إلغاء الفاتورة' : 'Failed to void invoice')
              );
            }
          },
        },
      ]
    );
  };

  const handleViewReceipt = async () => {
    if (!selectedInvoice || !user?.branchId) return;

    // Check if detailedInvoice has receipt image URLs directly
    const directImages = detailedInvoice?.receiptImageUrls?.length
      ? detailedInvoice.receiptImageUrls
      : [];
    if (directImages.length > 0) {
      setReceiptImages(directImages);
      setShowActionModal(false);
      setShowReceiptModal(true);
      return;
    }

    setLoadingReceipt(true);
    try {
      const result = await api.accounting.transactions.list(user.branchId, {
        transactionType: 'BANK_IN',
        pageSize: 50,
      });
      const transactions: any[] = result?.data || result || [];
      const linked = transactions.find(
        (tx: any) =>
          tx.referenceNumber === selectedInvoice.invoiceNumber ||
          (tx.description && tx.description.includes(selectedInvoice.invoiceNumber))
      );
      if (linked && linked.receiptImages && linked.receiptImages.length > 0) {
        setReceiptImages(linked.receiptImages);
        setShowActionModal(false);
        setShowReceiptModal(true);
      } else {
        Alert.alert(
          locale === 'ar' ? 'لا يوجد إيصال' : 'No Receipt',
          locale === 'ar'
            ? 'لا توجد صورة إيصال مرتبطة بهذه الفاتورة'
            : 'No receipt image found for this invoice'
        );
      }
    } catch (error) {
      console.error('Failed to load receipt:', error);
    } finally {
      setLoadingReceipt(false);
    }
  };

  const getFilteredInvoices = () => {
    switch (activeFilter) {
      case 'paid': return invoices.filter(i => i.status === 'PAID');
      case 'outstanding': return invoices.filter(i => ['DRAFT', 'ISSUED', 'PARTIALLY_PAID'].includes(i.status));
      case 'cancelled': return invoices.filter(i => i.status === 'CANCELLED');
      default: return invoices;
    }
  };

  const filteredInvoices = getFilteredInvoices();

  const renderInvoice = ({ item }: { item: SalesInvoice }) => {
    const statusColor = getStatusColor(item.status);
    const isVoided = item.status === 'CANCELLED' || item.status === 'VOIDED';
    
    return (
      <TouchableOpacity 
        style={[
          styles.invoiceCard, 
          { backgroundColor: theme.card }, 
          isRtl && styles.invoiceCardRtl,
          isVoided && styles.voidedInvoice,
        ]}
        onPress={() => handleInvoicePress(item)}
        disabled={isVoided}
      >
        <View style={[
          styles.invoiceIcon, 
          { backgroundColor: isVoided ? theme.errorBackground : theme.primaryBackground }
        ]}>
          <Ionicons 
            name={isVoided ? "close-circle" : "receipt"} 
            size={24} 
            color={isVoided ? theme.error : theme.primary} 
          />
        </View>
        <View style={[styles.invoiceContent, isRtl && styles.invoiceContentRtl]}>
          <View style={[styles.invoiceHeader, isRtl && styles.invoiceHeaderRtl]}>
            <Text style={[
              styles.invoiceNumber, 
              { color: isVoided ? theme.textMuted : theme.text },
              isVoided && styles.strikethrough,
            ]}>
              {item.invoiceNumber}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {t(item.status.toLowerCase() as any, locale)}
              </Text>
            </View>
          </View>
          <Text style={[styles.customerName, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {item.customer?.name || (locale === 'ar' ? 'عميل نقدي' : 'Walk-in')}
          </Text>
          <View style={[styles.invoiceMeta, isRtl && styles.invoiceMetaRtl]}>
            <Text style={[styles.invoiceDate, { color: theme.textMuted }]}>{formatDate(item.invoiceDate)}</Text>
            <Text style={[styles.invoiceType, { color: theme.primary }]}>
              {item.invoiceType === 'WHOLESALE' ? t('wholesale', locale) : t('retail', locale)}
            </Text>
          </View>
        </View>
        <View style={[styles.invoiceAmount, isRtl && styles.invoiceAmountRtl]}>
          <Text style={[
            styles.amountValue, 
            { color: isVoided ? theme.textMuted : theme.success },
            isVoided && styles.strikethrough,
          ]}>
            {formatCurrency(Number(item.totalSdg), 'SDG')}
          </Text>
          {showUsd && (
            <Text style={[styles.amountSdg, { color: theme.textSecondary }]}>
              {formatCurrency(Number(item.totalUsd), 'USD')}
            </Text>
          )}
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* New Sale Button */}
      <TouchableOpacity 
        style={[styles.newSaleButton, isRtl && styles.newSaleButtonRtl]}
        onPress={() => router.push('/(drawer)/create-sales-invoice')}
      >
        <Ionicons name="add" size={24} color="#fff" />
        <Text style={styles.newSaleText}>{t('newSale', locale)}</Text>
      </TouchableOpacity>

      {/* Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filterContainer, { backgroundColor: theme.card }]} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
        {[
          { key: 'all', label: locale === 'ar' ? 'الكل' : 'All', count: invoices.length },
          { key: 'paid', label: locale === 'ar' ? 'مدفوعة' : 'Paid', count: invoices.filter(i => i.status === 'PAID').length },
          { key: 'outstanding', label: locale === 'ar' ? 'معلقة' : 'Outstanding', count: invoices.filter(i => ['DRAFT', 'ISSUED', 'PARTIALLY_PAID'].includes(i.status)).length },
          { key: 'cancelled', label: locale === 'ar' ? 'ملغاة' : 'Cancelled', count: invoices.filter(i => i.status === 'CANCELLED').length },
        ].map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, { backgroundColor: activeFilter === f.key ? theme.primary : theme.backgroundSecondary }]}
            onPress={() => setActiveFilter(f.key as any)}
          >
            <Text style={[styles.filterTabText, { color: activeFilter === f.key ? '#fff' : theme.textSecondary }]}>
              {f.label} {f.count > 0 ? `(${f.count})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Admin quick links to sales orders and goods requests */}
      {isAdminOrManager && (
        <View style={[styles.quickLinksRow, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.quickLinkBtn, { borderColor: theme.primary }]}
            onPress={() => router.push('/(drawer)/warehouse-sales-orders')}
          >
            <Ionicons name="cube-outline" size={16} color={theme.primary} />
            <Text style={[styles.quickLinkText, { color: theme.primary }]}>
              {locale === 'ar' ? 'طلبات البيع' : 'Sales Orders'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickLinkBtn, { borderColor: theme.primary }]}
            onPress={() => router.push('/(drawer)/shelf-requests')}
          >
            <Ionicons name="git-pull-request-outline" size={16} color={theme.primary} />
            <Text style={[styles.quickLinkText, { color: theme.primary }]}>
              {locale === 'ar' ? 'طلبات الرف' : 'Shelf Requests'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Invoices List */}
      <FlatList
        data={filteredInvoices}
        keyExtractor={(item) => item.id}
        renderItem={renderInvoice}
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
            <Ionicons name="receipt-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noData', locale)}</Text>
            <Text style={[styles.emptySubtext, { color: theme.textMuted }]}>
              {locale === 'ar' ? 'ابدأ ببيع جديد' : 'Start with a new sale'}
            </Text>
          </View>
        }
      />

      {/* Invoice Detail/Action Modal */}
      <Modal
        visible={showActionModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowActionModal(false); setDetailedInvoice(null); }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setShowActionModal(false); setDetailedInvoice(null); }}
        >
          <TouchableOpacity activeOpacity={1}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {selectedInvoice?.invoiceNumber}
              </Text>
              <TouchableOpacity onPress={() => { setShowActionModal(false); setDetailedInvoice(null); }}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 520 }}>
              {/* Invoice Summary */}
              <View style={[styles.modalDetails, { borderColor: theme.border }]}>
                <View style={[styles.detailRow, isRtl && styles.detailRowRtl]}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                    {locale === 'ar' ? 'العميل' : 'Customer'}:
                  </Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {selectedInvoice?.customer?.name || (locale === 'ar' ? 'عميل نقدي' : 'Walk-in')}
                  </Text>
                </View>
                <View style={[styles.detailRow, isRtl && styles.detailRowRtl]}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                    {locale === 'ar' ? 'المبلغ' : 'Amount'}:
                  </Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.detailValue, { color: theme.success }]}>
                      {formatCurrency(Number(selectedInvoice?.totalSdg || 0), 'SDG')}
                    </Text>
                    {showUsd && (
                      <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                        ${Number(selectedInvoice?.totalUsd || 0).toFixed(2)}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={[styles.detailRow, isRtl && styles.detailRowRtl]}>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                    {locale === 'ar' ? 'الحالة' : 'Status'}:
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedInvoice?.status || '') + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(selectedInvoice?.status || '') }]}>
                      {selectedInvoice?.status}
                    </Text>
                  </View>
                </View>

                {/* Extended details for admin/manager */}
                {showUsd && loadingDetail && (
                  <ActivityIndicator size="small" color={theme.primary} style={{ marginTop: 8 }} />
                )}
                {showUsd && detailedInvoice && (
                  <>
                    {detailedInvoice.paymentMethod && (
                      <View style={[styles.detailRow, isRtl && styles.detailRowRtl]}>
                        <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                          {locale === 'ar' ? 'طريقة الدفع' : 'Payment'}:
                        </Text>
                        <Text style={[styles.detailValue, { color: theme.text }]}>
                          {detailedInvoice.paymentMethod === 'BANK_TRANSFER'
                            ? (locale === 'ar' ? 'تحويل بنكي' : 'Bank Transfer')
                            : detailedInvoice.paymentMethod === 'CASH'
                            ? (locale === 'ar' ? 'نقدي' : 'Cash')
                            : detailedInvoice.paymentMethod}
                        </Text>
                      </View>
                    )}
                    {detailedInvoice.transactionNumber && (
                      <View style={[styles.detailRow, isRtl && styles.detailRowRtl]}>
                        <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                          {locale === 'ar' ? 'رقم المعاملة' : 'Transaction #'}:
                        </Text>
                        <Text style={[styles.detailValue, { color: theme.text }]}>
                          {detailedInvoice.transactionNumber}
                        </Text>
                      </View>
                    )}
                    {detailedInvoice.createdBy && (
                      <View style={[styles.detailRow, isRtl && styles.detailRowRtl]}>
                        <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                          {locale === 'ar' ? 'أنشأ بواسطة' : 'Created By'}:
                        </Text>
                        <Text style={[styles.detailValue, { color: theme.text }]}>
                          {detailedInvoice.createdBy.name}
                        </Text>
                      </View>
                    )}
                    {detailedInvoice.shelf && (
                      <View style={[styles.detailRow, isRtl && styles.detailRowRtl]}>
                        <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                          {locale === 'ar' ? 'الرف' : 'Shelf'}:
                        </Text>
                        <Text style={[styles.detailValue, { color: theme.text }]}>
                          {isRtl ? detailedInvoice.shelf.nameAr : detailedInvoice.shelf.name}
                        </Text>
                      </View>
                    )}

                    {/* Receipt Images */}
                    {detailedInvoice.receiptImageUrls && detailedInvoice.receiptImageUrls.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={[styles.detailLabel, { color: theme.textSecondary, marginBottom: 6 }]}>
                          {locale === 'ar' ? 'صور الإيصال' : 'Receipt Images'}:
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          {detailedInvoice.receiptImageUrls.map((url, idx) => (
                            <TouchableOpacity
                              key={idx}
                              onPress={() => {
                                setReceiptImages(detailedInvoice.receiptImageUrls!);
                                setShowActionModal(false);
                                setShowReceiptModal(true);
                              }}
                              style={{ marginRight: 8 }}
                            >
                              <Image
                                source={{ uri: getFullUrl(url) }}
                                style={{ width: 80, height: 80, borderRadius: 8 }}
                                resizeMode="cover"
                              />
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    {/* Line Items */}
                    {detailedInvoice.lines && detailedInvoice.lines.length > 0 && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.detailLabel, { color: theme.textSecondary, marginBottom: 8, fontWeight: '600' }]}>
                          {locale === 'ar' ? 'الأصناف' : 'Line Items'}:
                        </Text>
                        {detailedInvoice.lines.map((line) => (
                          <View
                            key={line.id}
                            style={[styles.lineItem, { borderBottomColor: theme.border }]}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[{ color: theme.text, fontSize: 13, fontWeight: '500' }]}>
                                {isRtl ? line.item.nameAr : line.item.nameEn}
                              </Text>
                              <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                                {line.item.sku} • {line.qty} {line.item.unit?.nameEn || ''}
                              </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 13 }}>
                                {Number(line.totalSdg).toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
                              </Text>
                              <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                                {Number(line.unitPriceSdg).toLocaleString()} × {line.qty}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.modalActions}>
                {/* View Receipt - admin/manager only */}
                {showUsd && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: theme.infoBackground || theme.primaryBackground }]}
                    onPress={handleViewReceipt}
                    disabled={loadingReceipt}
                  >
                    {loadingReceipt ? (
                      <ActivityIndicator size="small" color={theme.info || theme.primary} />
                    ) : (
                      <Ionicons name="image-outline" size={20} color={theme.info || theme.primary} />
                    )}
                    <Text style={[styles.actionButtonText, { color: theme.info || theme.primary }]}>
                      {locale === 'ar' ? 'عرض الإيصال' : 'View Receipt'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Void Invoice - Only for admin/manager and non-cancelled invoices */}
                {canVoidInvoice && selectedInvoice?.status !== 'CANCELLED' && selectedInvoice?.status !== 'VOIDED' && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: theme.errorBackground }]}
                    onPress={handleVoidInvoice}
                  >
                    <Ionicons name="close-circle-outline" size={20} color={theme.error} />
                    <Text style={[styles.actionButtonText, { color: theme.error }]}>
                      {locale === 'ar' ? 'إلغاء الفاتورة' : 'Void Invoice'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Receipt Images Modal */}
      <Modal
        visible={showReceiptModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReceiptModal(false)}
      >
        <View style={styles.receiptModalOverlay}>
          <TouchableOpacity
            style={styles.receiptModalClose}
            onPress={() => setShowReceiptModal(false)}
          >
            <Ionicons name="close-circle" size={40} color="#fff" />
          </TouchableOpacity>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width: '100%' }}>
            {receiptImages.map((img, idx) => (
              <Image
                key={idx}
                source={{ uri: getFullUrl(img) }}
                style={styles.receiptFullImage}
                resizeMode="contain"
              />
            ))}
          </ScrollView>
        </View>
      </Modal>
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
  newSaleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  newSaleButtonRtl: {
    flexDirection: 'row-reverse',
  },
  newSaleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  invoiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
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
  customerName: {
    fontSize: 13,
    marginTop: 4,
  },
  invoiceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  invoiceMetaRtl: {
    flexDirection: 'row-reverse',
  },
  invoiceDate: {
    fontSize: 11,
  },
  invoiceType: {
    fontSize: 11,
  },
  invoiceAmount: {
    alignItems: 'flex-end',
  },
  invoiceAmountRtl: {
    alignItems: 'flex-start',
  },
  amountValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  amountSdg: {
    fontSize: 11,
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
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
  },
  voidedInvoice: {
    opacity: 0.6,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  modalDetails: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 16,
    marginBottom: 20,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailRowRtl: {
    flexDirection: 'row-reverse',
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalActions: {
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  receiptModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  receiptModalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  receiptPage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  receiptFullImage: {
    width: '100%',
    height: '80%',
  },
  filterContainer: {
    maxHeight: 52,
    borderBottomWidth: 1,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  quickLinksRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderTopWidth: 1,
  },
  quickLinkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  quickLinkText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
