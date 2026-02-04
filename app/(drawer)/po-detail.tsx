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
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

interface POLine {
  id: string;
  qty: number;
  qtyReceived: number;
  unitPriceSdg: number;
  item: {
    id: string;
    name: string;
    nameAr?: string;
    sku: string;
    unit?: { name: string; nameAr?: string };
  };
}

interface GoodsReceipt {
  id: string;
  grNumber: string;
  receiptDate: string;
  receiptType: string;
  receivedBy?: { name: string };
  lines: { qtyReceived: number; itemId: string }[];
}

interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  totalSdg: number;
  paidAmountSdg?: number;
  status: string;
  dueDate: string;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  orderDate: string;
  status: string;
  totalSdg: number;
  totalUsd: number;
  notes?: string;
  supplier?: {
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
  approvedBy?: { name: string };
  lines: POLine[];
  goodsReceipts: GoodsReceipt[];
  supplierInvoices?: SupplierInvoice[];
}

interface Warehouse {
  id: string;
  name: string;
  nameAr?: string;
}

interface ReceiptLineInput {
  lineId: string;
  itemId: string;
  qtyToReceive: string;
  expiryDate: Date | null;
  unitCostSdg: number;
  remaining: number;
}

export default function PODetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  
  const canReceive = ['ADMIN', 'MANAGER', 'PROCUREMENT', 'WAREHOUSE_SALES'].includes(user?.role || '');
  const canApprove = ['ADMIN', 'MANAGER'].includes(user?.role || '');

  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Receive mode state
  const [receiveMode, setReceiveMode] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [showWarehousePicker, setShowWarehousePicker] = useState(false);
  const [receiptLines, setReceiptLines] = useState<ReceiptLineInput[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState('');
  
  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerLineId, setDatePickerLineId] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadOrder();
    }
  }, [id]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const [orderData, warehousesData] = await Promise.all([
        api.procurement.getOrderById(id!),
        user?.branchId ? api.inventory.warehouses(user.branchId) : Promise.resolve({ data: [] }),
      ]);
      
      const mappedOrder = {
        ...orderData,
        totalSdg: Number(orderData.totalSdg) || 0,
        totalUsd: Number(orderData.totalUsd) || 0,
        lines: (orderData.lines || []).map((l: any) => ({
          ...l,
          qty: Number(l.qty) || 0,
          qtyReceived: Number(l.qtyReceived) || 0,
          unitPriceSdg: Number(l.unitPriceSdg) || 0,
        })),
        goodsReceipts: orderData.goodsReceipts || [],
        supplierInvoices: orderData.supplierInvoices || [],
      };
      
      setOrder(mappedOrder);
      
      const whList = warehousesData?.data || warehousesData || [];
      setWarehouses(whList);
      if (whList.length > 0) {
        setSelectedWarehouse(whList[0].id);
      }
      
      // Initialize receipt lines
      initReceiptLines(mappedOrder.lines);
    } catch (error: any) {
      console.error('Failed to load order:', error);
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'فشل في تحميل أمر الشراء' : 'Failed to load purchase order'
      );
    } finally {
      setLoading(false);
    }
  };

  const initReceiptLines = (lines: POLine[]) => {
    const inputs: ReceiptLineInput[] = lines
      .filter(l => l.qty > l.qtyReceived)
      .map(l => ({
        lineId: l.id,
        itemId: l.item.id,
        qtyToReceive: '',
        expiryDate: null,
        unitCostSdg: l.unitPriceSdg,
        remaining: l.qty - l.qtyReceived,
      }));
    setReceiptLines(inputs);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrder();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return theme.textMuted;
      case 'APPROVED': return theme.primary;
      case 'PARTIALLY_RECEIVED': return theme.warning;
      case 'FULLY_RECEIVED': return theme.success;
      case 'CLOSED': return theme.textSecondary;
      case 'CANCELLED': return theme.error;
      default: return theme.textMuted;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      DRAFT: { en: 'Draft', ar: 'مسودة' },
      APPROVED: { en: 'Approved', ar: 'معتمد' },
      PARTIALLY_RECEIVED: { en: 'Partially Received', ar: 'استلام جزئي' },
      FULLY_RECEIVED: { en: 'Fully Received', ar: 'مستلم بالكامل' },
      CLOSED: { en: 'Closed', ar: 'مغلق' },
      CANCELLED: { en: 'Cancelled', ar: 'ملغي' },
    };
    return locale === 'ar' ? labels[status]?.ar : labels[status]?.en || status;
  };

  const canReceiveGoods = order && ['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status);
  // Check if there are items to receive from the actual order lines, not just receiptLines state
  const hasItemsToReceive = order?.lines.some(l => (Number(l.qty) || 0) > (Number(l.qtyReceived) || 0)) ?? false;

  const updateReceiptQty = (lineId: string, value: string) => {
    setReceiptLines(lines =>
      lines.map(l => l.lineId === lineId ? { ...l, qtyToReceive: value } : l)
    );
  };

  const setMaxQty = (lineId: string) => {
    setReceiptLines(lines =>
      lines.map(l => l.lineId === lineId ? { ...l, qtyToReceive: String(l.remaining) } : l)
    );
  };

  const openDatePicker = (lineId: string) => {
    setDatePickerLineId(lineId);
    setShowDatePicker(true);
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate && datePickerLineId) {
      setReceiptLines(lines =>
        lines.map(l => l.lineId === datePickerLineId ? { ...l, expiryDate: selectedDate } : l)
      );
    }
    if (Platform.OS === 'android') {
      setDatePickerLineId(null);
    }
  };

  const handleReceiveGoods = async () => {
    if (!selectedWarehouse) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'يرجى اختيار المستودع' : 'Please select a warehouse'
      );
      return;
    }

    const validLines = receiptLines.filter(l => {
      const qty = parseFloat(l.qtyToReceive);
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
      const qty = parseFloat(line.qtyToReceive);
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

      await api.procurement.goodsReceipts.create({
        purchaseOrderId: id!,
        warehouseId: selectedWarehouse,
        notes: notes || undefined,
        lines: validLines.map(l => ({
          purchaseOrderLineId: l.lineId,
          itemId: l.itemId,
          qtyReceived: parseFloat(l.qtyToReceive),
          unitCostSdg: l.unitCostSdg,
          expiryDate: l.expiryDate?.toISOString().split('T')[0],
        })),
      });

      Alert.alert(
        locale === 'ar' ? 'نجاح' : 'Success',
        locale === 'ar' ? 'تم استلام البضائع بنجاح' : 'Goods received successfully'
      );
      
      setReceiveMode(false);
      setNotes('');
      await loadOrder();
    } catch (error: any) {
      console.error('Failed to receive goods:', error);
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        error.message || (locale === 'ar' ? 'فشل في استلام البضائع' : 'Failed to receive goods')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveOrder = async () => {
    if (!order) return;

    Alert.alert(
      locale === 'ar' ? 'اعتماد أمر الشراء' : 'Approve Purchase Order',
      locale === 'ar'
        ? `هل تريد اعتماد أمر الشراء ${order.poNumber}؟`
        : `Approve purchase order ${order.poNumber}?`,
      [
        { text: locale === 'ar' ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: locale === 'ar' ? 'اعتماد' : 'Approve',
          onPress: async () => {
            try {
              setSubmitting(true);
              await api.procurement.approve(order.id);
              Alert.alert(
                locale === 'ar' ? 'نجاح' : 'Success',
                locale === 'ar' ? 'تم اعتماد أمر الشراء بنجاح' : 'Purchase order approved successfully'
              );
              await loadOrder();
            } catch (error: any) {
              console.error('Failed to approve order:', error);
              Alert.alert(
                locale === 'ar' ? 'خطأ' : 'Error',
                error.message || (locale === 'ar' ? 'فشل في اعتماد أمر الشراء' : 'Failed to approve purchase order')
              );
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
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
        <Ionicons name="document-text-outline" size={48} color={theme.textMuted} />
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          {locale === 'ar' ? 'أمر الشراء غير موجود' : 'Purchase order not found'}
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
              <Text style={[styles.poNumber, { color: theme.text }, isRtl && styles.textRtl]}>
                {order.poNumber}
              </Text>
              <Text style={[styles.supplierName, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                {isRtl ? (order.supplier?.nameAr || order.supplier?.name) : order.supplier?.name}
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
              {order.totalSdg.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
            </Text>
          </View>

          {/* Due Amount Section */}
          {(() => {
            if (!order.supplierInvoices || order.supplierInvoices.length === 0) return null;
            
            const outstandingInvoices = order.supplierInvoices.filter(inv => 
              ['OUTSTANDING', 'SCHEDULED'].includes(inv.status)
            );
            
            if (outstandingInvoices.length === 0) return null;
            
            const totalDue = outstandingInvoices.reduce((sum, inv) => {
              const total = Number(inv.totalSdg) || 0;
              const paid = Number(inv.paidAmountSdg) || 0;
              return sum + (total - paid);
            }, 0);

            if (totalDue <= 0) return null;

            return (
              <View style={[styles.dueAmountRow, { borderTopColor: theme.border, backgroundColor: theme.errorBackground + '20' }, isRtl && styles.rowReverse]}>
                <View style={styles.dueAmountInfo}>
                  <Text style={[styles.dueAmountLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                    {locale === 'ar' ? 'المبلغ المستحق' : 'Amount Due'}
                  </Text>
                  {outstandingInvoices.map(inv => {
                    const invDue = (Number(inv.totalSdg) || 0) - (Number(inv.paidAmountSdg) || 0);
                    if (invDue > 0) {
                      return (
                        <Text key={inv.id} style={[styles.invoiceNumber, { color: theme.textMuted }, isRtl && styles.textRtl]}>
                          {inv.invoiceNumber}
                        </Text>
                      );
                    }
                    return null;
                  })}
                </View>
                <Text style={[styles.dueAmountValue, { color: theme.error }, isRtl && styles.textRtl]}>
                  {totalDue.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
                </Text>
              </View>
            );
          })()}

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
                {locale === 'ar' ? 'بواسطة' : 'Created By'}
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {order.createdBy?.name || '-'}
              </Text>
            </View>
          </View>
        </View>

        {/* Warehouse Selection (Receive Mode) */}
        {receiveMode && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'المستودع *' : 'Warehouse *'}
            </Text>
            <TouchableOpacity
              style={[styles.pickerButton, { borderColor: theme.border, backgroundColor: theme.background }]}
              onPress={() => setShowWarehousePicker(true)}
            >
              <Text style={[styles.pickerButtonText, { color: selectedWarehouse ? theme.text : theme.textMuted }]}>
                {selectedWarehouse 
                  ? (isRtl ? (warehouses.find(w => w.id === selectedWarehouse)?.nameAr || warehouses.find(w => w.id === selectedWarehouse)?.name) : warehouses.find(w => w.id === selectedWarehouse)?.name)
                  : (locale === 'ar' ? '-- اختر المستودع --' : '-- Select Warehouse --')
                }
              </Text>
              <Ionicons name="chevron-down" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Order Lines */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'الأصناف' : 'Items'} ({order.lines.length})
          </Text>
          
          {order.lines.map((line) => {
            const remaining = line.qty - line.qtyReceived;
            const isFullyReceived = remaining <= 0;
            const receiptInput = receiptLines.find(r => r.lineId === line.id);
            
            return (
              <View 
                key={line.id} 
                style={[styles.lineItem, { borderBottomColor: theme.border }]}
              >
                <View style={[styles.lineHeader, isRtl && styles.rowReverse]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemName, { color: theme.text }, isRtl && styles.textRtl]}>
                      {isRtl ? (line.item.nameAr || line.item.name) : line.item.name}
                    </Text>
                    <Text style={[styles.itemSku, { color: theme.textMuted }]}>
                      {line.item.sku}
                    </Text>
                  </View>
                  {isFullyReceived && (
                    <View style={[styles.receivedBadge, { backgroundColor: theme.successBackground }]}>
                      <Ionicons name="checkmark-circle" size={14} color={theme.success} />
                      <Text style={[styles.receivedBadgeText, { color: theme.success }]}>
                        {locale === 'ar' ? 'مستلم' : 'Received'}
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
                      {locale === 'ar' ? 'مستلم' : 'Received'}
                    </Text>
                    <Text style={[styles.qtyValue, { color: isFullyReceived ? theme.success : theme.warning }]}>
                      {line.qtyReceived}
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
                      {line.unitPriceSdg.toLocaleString()}
                    </Text>
                  </View>
                </View>

                {/* Receive Input (only in receive mode and if not fully received) */}
                {receiveMode && !isFullyReceived && receiptInput && (
                  <View style={[styles.receiveInputs, { borderTopColor: theme.border }]}>
                    <View style={styles.inputRow}>
                      <View style={styles.qtyInputContainer}>
                        <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                          {locale === 'ar' ? 'الكمية' : 'Qty'}
                        </Text>
                        <View style={styles.qtyInputRow}>
                          <TextInput
                            style={[styles.qtyInput, { 
                              backgroundColor: theme.background, 
                              borderColor: theme.border,
                              color: theme.text,
                            }]}
                            value={receiptInput.qtyToReceive}
                            onChangeText={(v) => updateReceiptQty(line.id, v)}
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
                      
                      <View style={styles.expiryInputContainer}>
                        <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                          {locale === 'ar' ? 'تاريخ الانتهاء' : 'Expiry Date'}
                        </Text>
                        <TouchableOpacity
                          style={[styles.dateButton, { 
                            backgroundColor: theme.background, 
                            borderColor: theme.border,
                          }]}
                          onPress={() => openDatePicker(line.id)}
                        >
                          <Text style={[styles.dateButtonText, { color: receiptInput.expiryDate ? theme.text : theme.textMuted }]}>
                            {receiptInput.expiryDate 
                              ? receiptInput.expiryDate.toISOString().split('T')[0]
                              : (locale === 'ar' ? 'اختر' : 'Select')
                            }
                          </Text>
                          <Ionicons name="calendar-outline" size={18} color={theme.textMuted} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Notes (Receive Mode) */}
        {receiveMode && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'ملاحظات' : 'Notes'}
            </Text>
            <TextInput
              style={[styles.notesInput, { 
                backgroundColor: theme.background, 
                borderColor: theme.border,
                color: theme.text,
                textAlign: isRtl ? 'right' : 'left',
              }]}
              value={notes}
              onChangeText={setNotes}
              placeholder={locale === 'ar' ? 'ملاحظات الاستلام (اختياري)' : 'Receipt notes (optional)'}
              placeholderTextColor={theme.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>
        )}

        {/* Goods Receipts History */}
        {order.goodsReceipts.length > 0 && !receiveMode && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'سجل الاستلام' : 'Receipt History'} ({order.goodsReceipts.length})
            </Text>
            
            {order.goodsReceipts.map((gr) => (
              <View 
                key={gr.id} 
                style={[styles.receiptItem, { borderBottomColor: theme.border }]}
              >
                <View style={[styles.receiptHeader, isRtl && styles.rowReverse]}>
                  <View>
                    <Text style={[styles.grNumber, { color: theme.text }]}>
                      {gr.grNumber}
                    </Text>
                    <Text style={[styles.grDate, { color: theme.textSecondary }]}>
                      {gr.receiptDate?.split('T')[0]}
                    </Text>
                  </View>
                  <View style={[
                    styles.receiptTypeBadge, 
                    { backgroundColor: gr.receiptType === 'FULL' ? theme.successBackground : theme.warningBackground }
                  ]}>
                    <Text style={[
                      styles.receiptTypeText, 
                      { color: gr.receiptType === 'FULL' ? theme.success : theme.warning }
                    ]}>
                      {gr.receiptType === 'FULL' 
                        ? (locale === 'ar' ? 'كامل' : 'Full') 
                        : (locale === 'ar' ? 'جزئي' : 'Partial')
                      }
                    </Text>
                  </View>
                </View>
                <Text style={[styles.receivedBy, { color: theme.textMuted }]}>
                  {locale === 'ar' ? 'بواسطة: ' : 'By: '}{gr.receivedBy?.name || '-'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Notes (View Mode) */}
        {order.notes && !receiveMode && (
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

      {/* Action Bar - Show for warehouse users when order is approved and has items to receive */}
      {canReceive && canReceiveGoods && hasItemsToReceive && (
        <View style={[styles.actionBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          {receiveMode ? (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.border }]}
                onPress={() => {
                  setReceiveMode(false);
                  setNotes('');
                  initReceiptLines(order.lines);
                }}
              >
                <Text style={[styles.cancelButtonText, { color: theme.text }]}>
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.success }]}
                onPress={handleReceiveGoods}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
                    <Text style={styles.submitButtonText}>
                      {locale === 'ar' ? 'تأكيد الاستلام' : 'Confirm Receipt'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : warehouses.length === 0 ? (
            <View style={[styles.draftMessageContainer, { backgroundColor: theme.warningBackground }]}>
              <Ionicons name="warning-outline" size={20} color={theme.warning} />
              <Text style={[styles.draftMessageText, { color: theme.warning }]}>
                {locale === 'ar' 
                  ? 'لا توجد مستودعات متاحة. الرجاء إضافة مستودع أولاً.' 
                  : 'No warehouses available. Please add a warehouse first.'}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.receiveButton, { backgroundColor: theme.primary }]}
              onPress={() => {
                // Re-initialize receipt lines when entering receive mode
                if (order) {
                  initReceiptLines(order.lines);
                }
                setReceiveMode(true);
              }}
            >
              <Ionicons name="cube-outline" size={20} color="#fff" />
              <Text style={styles.receiveButtonText}>
                {locale === 'ar' ? 'استلام البضائع' : 'Receive Goods'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Approve Button for Admin/Manager when order is DRAFT */}
      {canApprove && order?.status === 'DRAFT' && !receiveMode && (
        <View style={[styles.actionBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.approveButton, { backgroundColor: theme.success }]}
            onPress={handleApproveOrder}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.approveButtonText}>
                  {locale === 'ar' ? 'اعتماد أمر الشراء' : 'Approve Order'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Message for DRAFT orders that need approval (for non-admin users) */}
      {!canApprove && canReceive && order?.status === 'DRAFT' && hasItemsToReceive && !receiveMode && (
        <View style={[styles.actionBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <View style={[styles.draftMessageContainer, { backgroundColor: theme.warningBackground }]}>
            <Ionicons name="time-outline" size={20} color={theme.warning} />
            <Text style={[styles.draftMessageText, { color: theme.warning }]}>
              {locale === 'ar' 
                ? 'يجب اعتماد أمر الشراء من المدير قبل استلام البضائع' 
                : 'This order needs admin approval before goods can be received'}
            </Text>
          </View>
        </View>
      )}

      {/* Message for warehouse users when order is fully received */}
      {canReceive && order?.status === 'FULLY_RECEIVED' && !receiveMode && (
        <View style={[styles.actionBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <View style={[styles.draftMessageContainer, { backgroundColor: theme.successBackground }]}>
            <Ionicons name="checkmark-circle" size={20} color={theme.success} />
            <Text style={[styles.draftMessageText, { color: theme.success }]}>
              {locale === 'ar' 
                ? 'تم استلام جميع البضائع' 
                : 'All goods have been received'}
            </Text>
          </View>
        </View>
      )}

      {/* Warehouse Picker Modal */}
      <Modal
        visible={showWarehousePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWarehousePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {locale === 'ar' ? 'اختر المستودع' : 'Select Warehouse'}
              </Text>
              <TouchableOpacity onPress={() => setShowWarehousePicker(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={warehouses}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.warehouseItem,
                    { 
                      backgroundColor: selectedWarehouse === item.id ? theme.primaryBackground : 'transparent',
                      borderBottomColor: theme.border,
                    }
                  ]}
                  onPress={() => {
                    setSelectedWarehouse(item.id);
                    setShowWarehousePicker(false);
                  }}
                >
                  <Text style={[styles.warehouseItemText, { color: theme.text }, isRtl && styles.textRtl]}>
                    {isRtl ? (item.nameAr || item.name) : item.name}
                  </Text>
                  {selectedWarehouse === item.id && (
                    <Ionicons name="checkmark" size={20} color={theme.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={receiptLines.find(l => l.lineId === datePickerLineId)?.expiryDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
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
  poNumber: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  supplierName: {
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
  dueAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 16,
    paddingTop: 16,
    padding: 12,
    borderRadius: 8,
    borderTopWidth: 1,
  },
  dueAmountInfo: {
    flex: 1,
  },
  dueAmountLabel: {
    fontSize: 14,
    marginBottom: 4,
    fontWeight: '600',
  },
  invoiceNumber: {
    fontSize: 12,
    marginTop: 2,
  },
  dueAmountValue: {
    fontSize: 22,
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
  receivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  receivedBadgeText: {
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
  receiveInputs: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  qtyInputContainer: {
    flex: 1,
  },
  expiryInputContainer: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  qtyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
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
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateButtonText: {
    fontSize: 14,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  receiptItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  grNumber: {
    fontSize: 14,
    fontWeight: '600',
  },
  grDate: {
    fontSize: 12,
  },
  receiptTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  receiptTypeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  receivedBy: {
    fontSize: 12,
    marginTop: 4,
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
  receiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  receiveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  approveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    width: '100%',
  },
  approveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  draftMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 10,
    flex: 1,
  },
  draftMessageText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  textRtl: {
    textAlign: 'right',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  pickerButtonText: {
    fontSize: 16,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  warehouseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  warehouseItemText: {
    fontSize: 16,
    flex: 1,
  },
});
