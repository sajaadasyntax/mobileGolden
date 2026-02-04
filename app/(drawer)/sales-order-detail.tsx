import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

interface SOLine {
  id: string;
  qty: number;
  qtyDelivered: number;
  unitPriceUsd: number;
  unitPriceSdg: number;
  item: {
    id: string;
    nameEn: string;
    nameAr?: string;
    sku: string;
    unit?: { name: string; nameAr?: string };
  };
}

interface SalesOrder {
  id: string;
  orderNumber: string;
  orderDate: string;
  status: string;
  totalSdg: number;
  totalUsd: number;
  notes?: string;
  customer?: {
    id: string;
    name: string;
    nameAr?: string;
  };
  warehouse?: {
    id: string;
    name: string;
    nameAr?: string;
  };
  branch?: {
    id: string;
    name: string;
    nameAr?: string;
  };
  createdBy?: { name: string };
  lines: SOLine[];
}

interface DeliveryLineInput {
  lineId: string;
  qtyToDeliver: string;
  remaining: number;
}

export default function SalesOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  
  const canDeliver = ['ADMIN', 'MANAGER', 'WAREHOUSE_SALES'].includes(user?.role || '');

  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Delivery mode state
  const [deliveryMode, setDeliveryMode] = useState(false);
  const [deliveryLines, setDeliveryLines] = useState<DeliveryLineInput[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (id) {
      loadOrder();
    }
  }, [id]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const data = await api.sales.salesOrders.getById(id!);
      
      const mappedOrder = {
        ...data,
        totalSdg: Number(data.totalSdg),
        totalUsd: Number(data.totalUsd),
        lines: data.lines.map((l: any) => ({
          ...l,
          qty: Number(l.qty),
          qtyDelivered: Number(l.qtyDelivered || 0),
          unitPriceUsd: Number(l.unitPriceUsd),
          unitPriceSdg: Number(l.unitPriceSdg || 0),
        })),
      };
      
      setOrder(mappedOrder);
      initDeliveryLines(mappedOrder.lines);
    } catch (error: any) {
      console.error('Failed to load order:', error);
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'فشل في تحميل الطلب' : 'Failed to load order'
      );
    } finally {
      setLoading(false);
    }
  };

  const initDeliveryLines = (lines: SOLine[]) => {
    const inputs: DeliveryLineInput[] = lines
      .filter(l => l.qty > l.qtyDelivered)
      .map(l => ({
        lineId: l.id,
        qtyToDeliver: '',
        remaining: l.qty - l.qtyDelivered,
      }));
    setDeliveryLines(inputs);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrder();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return theme.textMuted;
      case 'CONFIRMED': return theme.primary;
      case 'PARTIALLY_DELIVERED': return theme.warning;
      case 'FULLY_DELIVERED': return theme.success;
      case 'CANCELLED': return theme.error;
      default: return theme.textMuted;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      DRAFT: { en: 'Draft', ar: 'مسودة' },
      CONFIRMED: { en: 'Confirmed', ar: 'مؤكد' },
      PARTIALLY_DELIVERED: { en: 'Partially Delivered', ar: 'تسليم جزئي' },
      FULLY_DELIVERED: { en: 'Fully Delivered', ar: 'تم التسليم' },
      CANCELLED: { en: 'Cancelled', ar: 'ملغي' },
    };
    return locale === 'ar' ? labels[status]?.ar : labels[status]?.en || status;
  };

  const canDeliverOrder = order && ['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(order.status);
  const hasItemsToDeliver = deliveryLines.some(l => l.remaining > 0);

  const updateDeliveryQty = (lineId: string, value: string) => {
    setDeliveryLines(lines =>
      lines.map(l => l.lineId === lineId ? { ...l, qtyToDeliver: value } : l)
    );
  };

  const setMaxQty = (lineId: string) => {
    setDeliveryLines(lines =>
      lines.map(l => l.lineId === lineId ? { ...l, qtyToDeliver: String(l.remaining) } : l)
    );
  };

  const handleDeliverOrder = async () => {
    const validLines = deliveryLines.filter(l => {
      const qty = parseFloat(l.qtyToDeliver);
      return !isNaN(qty) && qty > 0;
    });

    if (validLines.length === 0) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'يرجى إدخال كمية واحدة على الأقل' : 'Please enter at least one quantity'
      );
      return;
    }

    // Validate quantities
    for (const line of validLines) {
      const qty = parseFloat(line.qtyToDeliver);
      if (qty > line.remaining) {
        Alert.alert(
          locale === 'ar' ? 'خطأ' : 'Error',
          locale === 'ar' ? 'الكمية المدخلة أكبر من المتبقي' : 'Quantity exceeds remaining'
        );
        return;
      }
    }

    try {
      setSubmitting(true);

      await api.sales.salesOrders.deliver({
        orderId: id!,
        lines: validLines.map(l => ({
          lineId: l.lineId,
          qtyDelivered: parseFloat(l.qtyToDeliver),
        })),
      });

      Alert.alert(
        locale === 'ar' ? 'نجاح' : 'Success',
        locale === 'ar' ? 'تم التسليم بنجاح' : 'Delivery completed successfully'
      );
      
      setDeliveryMode(false);
      await loadOrder();
    } catch (error: any) {
      console.error('Failed to deliver:', error);
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        error.message || (locale === 'ar' ? 'فشل في التسليم' : 'Failed to deliver')
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <Ionicons name="cart-outline" size={48} color={theme.textMuted} />
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          {locale === 'ar' ? 'الطلب غير موجود' : 'Order not found'}
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
        keyboardShouldPersistTaps="handled"
      >
        {/* Header Card */}
        <View style={[styles.headerCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={[styles.headerRow, isRtl && styles.rowReverse]}>
            <View>
              <Text style={[styles.orderNumber, { color: theme.text }, isRtl && styles.textRtl]}>
                {order.orderNumber}
              </Text>
              <Text style={[styles.customerName, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                {isRtl ? (order.customer?.nameAr || order.customer?.name) : order.customer?.name || '-'}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>
                {getStatusLabel(order.status)}
              </Text>
            </View>
          </View>

          <View style={[styles.amountRow, { borderTopColor: theme.border }, isRtl && styles.rowReverse]}>
            <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'الإجمالي' : 'Total'}
            </Text>
            <Text style={[styles.amountValue, { color: theme.primary }]}>
              {order.totalUsd.toLocaleString()} {locale === 'ar' ? 'دولار' : 'USD'}
            </Text>
          </View>

          <View style={[styles.infoGrid, { borderTopColor: theme.border }]}>
            <View style={styles.infoItem}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                {locale === 'ar' ? 'تاريخ الطلب' : 'Order Date'}
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {order.orderDate?.split('T')[0]}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                {locale === 'ar' ? 'المستودع' : 'Warehouse'}
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {isRtl ? (order.warehouse?.nameAr || order.warehouse?.name) : order.warehouse?.name || '-'}
              </Text>
            </View>
          </View>
        </View>

        {/* Order Lines */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'الأصناف' : 'Items'} ({order.lines.length})
          </Text>
          
          {order.lines.map((line) => {
            const remaining = line.qty - line.qtyDelivered;
            const isFullyDelivered = remaining <= 0;
            const deliveryInput = deliveryLines.find(d => d.lineId === line.id);
            
            return (
              <View 
                key={line.id} 
                style={[styles.lineItem, { borderBottomColor: theme.border }]}
              >
                <View style={[styles.lineHeader, isRtl && styles.rowReverse]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemName, { color: theme.text }, isRtl && styles.textRtl]}>
                      {isRtl ? (line.item.nameAr || line.item.nameEn) : line.item.nameEn}
                    </Text>
                    <Text style={[styles.itemSku, { color: theme.textMuted }]}>
                      {line.item.sku}
                    </Text>
                  </View>
                  {isFullyDelivered && (
                    <View style={[styles.deliveredBadge, { backgroundColor: theme.successBackground }]}>
                      <Ionicons name="checkmark-circle" size={14} color={theme.success} />
                      <Text style={[styles.deliveredBadgeText, { color: theme.success }]}>
                        {locale === 'ar' ? 'تم التسليم' : 'Delivered'}
                      </Text>
                    </View>
                  )}
                </View>
                
                <View style={[styles.lineDetails, isRtl && styles.rowReverse]}>
                  <View style={styles.qtyInfo}>
                    <Text style={[styles.qtyLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'الكمية' : 'Qty'}
                    </Text>
                    <Text style={[styles.qtyValue, { color: theme.text }]}>
                      {line.qty}
                    </Text>
                  </View>
                  
                  <View style={styles.qtyInfo}>
                    <Text style={[styles.qtyLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'مسلم' : 'Delivered'}
                    </Text>
                    <Text style={[styles.qtyValue, { color: isFullyDelivered ? theme.success : theme.warning }]}>
                      {line.qtyDelivered}
                    </Text>
                  </View>
                  
                  <View style={styles.qtyInfo}>
                    <Text style={[styles.qtyLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'متبقي' : 'Remaining'}
                    </Text>
                    <Text style={[styles.qtyValue, { color: remaining > 0 ? theme.warning : theme.success }]}>
                      {remaining}
                    </Text>
                  </View>
                  
                  <View style={styles.qtyInfo}>
                    <Text style={[styles.qtyLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'السعر' : 'Price'}
                    </Text>
                    <Text style={[styles.qtyValue, { color: theme.text }]}>
                      ${line.unitPriceUsd.toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Delivery Input (only in delivery mode and if not fully delivered) */}
                {deliveryMode && !isFullyDelivered && deliveryInput && (
                  <View style={[styles.deliveryInputs, { borderTopColor: theme.border }]}>
                    <View style={styles.inputRow}>
                      <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                        {locale === 'ar' ? 'كمية التسليم' : 'Qty to Deliver'}
                      </Text>
                      <View style={styles.qtyInputRow}>
                        <TextInput
                          style={[styles.qtyInput, { 
                            backgroundColor: theme.background, 
                            borderColor: theme.border,
                            color: theme.text,
                          }]}
                          value={deliveryInput.qtyToDeliver}
                          onChangeText={(v) => updateDeliveryQty(line.id, v)}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={theme.textMuted}
                        />
                        <TouchableOpacity
                          style={[styles.maxButton, { backgroundColor: theme.primaryBackground }]}
                          onPress={() => setMaxQty(line.id)}
                        >
                          <Text style={[styles.maxButtonText, { color: theme.primary }]}>
                            {locale === 'ar' ? 'الكل' : 'All'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Notes */}
        {order.notes && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'ملاحظات' : 'Notes'}
            </Text>
            <Text style={[styles.notesText, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {order.notes}
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Action Bar */}
      {canDeliver && canDeliverOrder && hasItemsToDeliver && (
        <View style={[styles.actionBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          {deliveryMode ? (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.border }]}
                onPress={() => {
                  setDeliveryMode(false);
                  initDeliveryLines(order.lines);
                }}
              >
                <Text style={[styles.cancelButtonText, { color: theme.text }]}>
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.success }]}
                onPress={handleDeliverOrder}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
                    <Text style={styles.submitButtonText}>
                      {locale === 'ar' ? 'تأكيد التسليم' : 'Confirm Delivery'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.deliverButton, { backgroundColor: theme.primary }]}
              onPress={() => setDeliveryMode(true)}
            >
              <Ionicons name="send-outline" size={20} color="#fff" />
              <Text style={styles.deliverButtonText}>
                {locale === 'ar' ? 'تسليم الطلب' : 'Deliver Order'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
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
  scrollView: {
    flex: 1,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
  headerCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  orderNumber: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  customerName: {
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  amountLabel: {
    fontSize: 14,
  },
  amountValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  infoGrid: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  lineItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
  },
  itemSku: {
    fontSize: 12,
    marginTop: 2,
  },
  deliveredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  deliveredBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  lineDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  qtyInfo: {
    alignItems: 'center',
  },
  qtyLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  qtyValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  deliveryInputs: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputLabel: {
    fontSize: 12,
  },
  qtyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyInput: {
    width: 80,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  maxButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  maxButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    borderTopWidth: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deliverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  deliverButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  textRtl: {
    textAlign: 'right',
  },
});
