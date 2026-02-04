import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useThemeStore } from '@/stores/theme';
import { useLocaleStore } from '@/stores/locale';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';
import {
  Invoice,
  InvoiceItem,
  generateInvoiceNumber,
  calculateInvoiceTotals,
} from '@/lib/invoice';
import InvoiceItemPicker from '@/components/InvoiceItemPicker';
import InvoicePreview from '@/components/InvoicePreview';

interface Supplier {
  id: string;
  name: string;
  nameAr?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export default function CreateProcurementInvoiceScreen() {
  const router = useRouter();
  const { theme } = useThemeStore();
  const { locale } = useLocaleStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';

  // Auto-generate PO Number
  const generatePONumber = () => {
    const prefix = 'PO';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  };

  // Form state
  const [invoiceCategory, setInvoiceCategory] = useState<'WHOLESALE' | 'CONSIGNMENT'>('WHOLESALE');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [notes, setNotes] = useState('');
  const [poNumber, setPONumber] = useState(generatePONumber());
  const [operationNumber, setOperationNumber] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(600);

  // UI State
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);
  
  // Supplier picker state
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');

  // Load exchange rate and suppliers
  useEffect(() => {
    loadExchangeRate();
    loadSuppliers();
  }, []);

  const loadExchangeRate = async () => {
    try {
      if (user?.branchId) {
        const dayCycle = await api.dayCycle.getCurrent(user.branchId);
        if (dayCycle?.exchangeRateUsdSdg) {
          setExchangeRate(dayCycle.exchangeRateUsdSdg);
        }
      }
    } catch (error) {
      console.error('Failed to load exchange rate:', error);
    }
  };

  const loadSuppliers = async () => {
    setSuppliersLoading(true);
    try {
      const result = await api.procurement.suppliers.list(1, 100);
      const suppliersData = result?.data || result || [];
      setSuppliers(suppliersData.map((s: any) => ({
        id: s.id,
        name: s.name || s.nameEn || 'Unknown',
        nameAr: s.nameAr,
        phone: s.phone,
        email: s.email,
        address: s.address,
      })));
    } catch (error) {
      console.error('Failed to load suppliers:', error);
      setSuppliers([]);
    } finally {
      setSuppliersLoading(false);
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const query = supplierSearch.toLowerCase();
    return (
      s.name.toLowerCase().includes(query) ||
      s.nameAr?.toLowerCase().includes(query) ||
      s.phone?.includes(query)
    );
  });

  const handleAddItem = (
    item: { id: string; name: string; nameAr?: string; sku?: string; wholesalePrice: number; retailPrice: number; unit?: string },
    quantity: number
  ) => {
    // For procurement, we enter cost price in SDG
    // Default to wholesale price * exchange rate as estimate, user can edit
    const unitPriceSdg = Math.round(item.wholesalePrice * exchangeRate * 0.8); // Estimate cost in SDG
    const unitPrice = unitPriceSdg / exchangeRate; // Convert to USD
    const totalSdg = quantity * unitPriceSdg;
    const total = totalSdg / exchangeRate;

    const newItem: InvoiceItem = {
      id: `${item.id}-${Date.now()}`,
      itemId: item.id,
      name: item.name,
      nameAr: item.nameAr,
      sku: item.sku,
      quantity,
      unitPrice,
      unitPriceSdg,
      total,
      totalSdg,
      unit: item.unit,
    };

    setItems([...items, newItem]);
  };

  const handleRemoveItem = (itemId: string) => {
    setItems(items.filter((item) => item.id !== itemId));
  };

  const handleUpdateQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    
    setItems(items.map((item) => {
      if (item.id === itemId) {
        const totalSdg = newQuantity * item.unitPriceSdg;
        const total = totalSdg / exchangeRate;
        return {
          ...item,
          quantity: newQuantity,
          total,
          totalSdg,
        };
      }
      return item;
    }));
  };

  // Update price in SDG (primary currency for procurement)
  const handleUpdatePriceSdg = (itemId: string, newPriceSdg: number) => {
    if (newPriceSdg < 0) return;
    
    setItems(items.map((item) => {
      if (item.id === itemId) {
        const totalSdg = item.quantity * newPriceSdg;
        const unitPrice = newPriceSdg / exchangeRate;
        const total = totalSdg / exchangeRate;
        return {
          ...item,
          unitPrice,
          unitPriceSdg: newPriceSdg,
          total,
          totalSdg,
        };
      }
      return item;
    }));
  };

  const calculateTotals = () => {
    // Calculate totals based on SDG prices
    const subtotalSdg = items.reduce((sum, item) => sum + item.totalSdg, 0);
    const totalSdg = subtotalSdg; // No tax/discount for procurement
    const subtotal = subtotalSdg / exchangeRate;
    const total = totalSdg / exchangeRate;
    
    return {
      subtotal,
      subtotalSdg,
      total,
      totalSdg,
      discount: 0,
      discountSdg: 0,
      tax: 0,
      taxSdg: 0,
    };
  };

  const totals = calculateTotals();

  const buildInvoice = (): Invoice => {
    const invoiceNumber = generateInvoiceNumber('PROCUREMENT', user?.branchId?.substring(0, 3).toUpperCase());
    
    return {
      invoiceNumber,
      invoiceType: 'PROCUREMENT',
      invoiceCategory,
      invoiceDate: new Date().toISOString(),
      dueDate: dueDate ? dueDate.toISOString() : undefined,
      branchId: user?.branchId || '',
      branchName: user?.branch?.name,
      supplier: selectedSupplier ? {
        id: selectedSupplier.id,
        name: selectedSupplier.name,
        nameAr: selectedSupplier.nameAr,
        phone: selectedSupplier.phone,
        email: selectedSupplier.email,
        address: selectedSupplier.address,
      } : undefined,
      items,
      ...totals,
      exchangeRate,
      paymentStatus: 'DRAFT',
      amountPaid: 0,
      amountPaidSdg: 0,
      amountDue: totals.total,
      amountDueSdg: totals.totalSdg,
      notes,
      poNumber,
      operationNumber,
    };
  };

  const handlePreview = () => {
    if (items.length === 0) {
      Alert.alert(
        locale === 'ar' ? 'تنبيه' : 'Warning',
        locale === 'ar' ? 'الرجاء إضافة أصناف للفاتورة' : 'Please add items to the invoice'
      );
      return;
    }

    if (!selectedSupplier) {
      Alert.alert(
        locale === 'ar' ? 'تنبيه' : 'Warning',
        locale === 'ar' ? 'الرجاء اختيار المورد' : 'Please select a supplier'
      );
      return;
    }

    // Check for zero-price items
    const zeroPriceItems = items.filter(item => item.unitPriceSdg <= 0);
    if (zeroPriceItems.length > 0) {
      const itemNames = zeroPriceItems.map(item => isRtl ? (item.nameAr || item.name) : item.name).join(', ');
      Alert.alert(
        locale === 'ar' ? 'تنبيه' : 'Warning',
        locale === 'ar' 
          ? `الأصناف التالية بدون سعر: ${itemNames}. الرجاء تحديد سعر التكلفة.`
          : `The following items have no price: ${itemNames}. Please set a cost price.`
      );
      return;
    }

    const invoice = buildInvoice();
    setCurrentInvoice(invoice);
    setShowPreview(true);
  };

  const handleSaveInvoice = async () => {
    if (!currentInvoice || !selectedSupplier || !user?.branchId) return;
    
    setLoading(true);
    try {
      // Create purchase order in backend - warehouse will be selected during goods receipt
      const purchaseOrderData = {
        supplierId: selectedSupplier.id,
        branchId: user.branchId,
        expectedDate: dueDate ? dueDate.toISOString().split('T')[0] : undefined,
        notes: notes || undefined,
        poNumber: poNumber || undefined,
        operationNumber: operationNumber || undefined,
        isConsignment: invoiceCategory === 'CONSIGNMENT',
        lines: items.map(item => ({
          itemId: item.itemId,
          qty: item.quantity,
          unitPriceSdg: item.unitPriceSdg,
        })),
      };
      
      const purchaseOrder = await api.procurement.createPurchaseOrder(purchaseOrderData);
      
      Alert.alert(
        locale === 'ar' ? 'نجاح' : 'Success',
        locale === 'ar' 
          ? 'تم حفظ أمر الشراء بنجاح. المستودع سيتم تحديده عند استلام البضائع.'
          : 'Purchase order saved successfully. Warehouse will be selected when receiving goods.',
        [
          {
            text: locale === 'ar' ? 'موافق' : 'OK',
            onPress: () => {
              setShowPreview(false);
              router.back();
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Failed to save procurement order:', error);
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        error.message || (locale === 'ar' ? 'فشل في حفظ أمر الشراء' : 'Failed to save purchase order')
      );
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency: 'USD' | 'SDG') => {
    const symbol = currency === 'USD' ? '$' : 'SDG';
    return `${symbol} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Invoice Type Selection */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {locale === 'ar' ? 'نوع الفاتورة' : 'Invoice Type'}
          </Text>
          <View style={styles.typeButtons}>
            <TouchableOpacity
              style={[
                styles.typeButton,
                { 
                  backgroundColor: invoiceCategory === 'WHOLESALE' ? theme.warning : theme.backgroundTertiary,
                  borderColor: invoiceCategory === 'WHOLESALE' ? theme.warning : theme.border,
                },
              ]}
              onPress={() => setInvoiceCategory('WHOLESALE')}
            >
              <Ionicons 
                name="document-text" 
                size={20} 
                color={invoiceCategory === 'WHOLESALE' ? '#fff' : theme.textSecondary} 
              />
              <Text style={[
                styles.typeButtonText,
                { color: invoiceCategory === 'WHOLESALE' ? '#fff' : theme.textSecondary }
              ]}>
                {locale === 'ar' ? 'شراء مباشر' : 'Direct Purchase'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.typeButton,
                { 
                  backgroundColor: invoiceCategory === 'CONSIGNMENT' ? theme.warning : theme.backgroundTertiary,
                  borderColor: invoiceCategory === 'CONSIGNMENT' ? theme.warning : theme.border,
                },
              ]}
              onPress={() => setInvoiceCategory('CONSIGNMENT')}
            >
              <Ionicons 
                name="layers" 
                size={20} 
                color={invoiceCategory === 'CONSIGNMENT' ? '#fff' : theme.textSecondary} 
              />
              <Text style={[
                styles.typeButtonText,
                { color: invoiceCategory === 'CONSIGNMENT' ? '#fff' : theme.textSecondary }
              ]}>
                {t('consignmentInvoice', locale)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Supplier Selection */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t('supplier', locale)} *
          </Text>
          <TouchableOpacity 
            style={[styles.selectButton, { backgroundColor: theme.input, borderColor: theme.inputBorder }]}
            onPress={() => setShowSupplierPicker(true)}
          >
            <Ionicons name="business" size={20} color={theme.textSecondary} />
            <Text style={[styles.selectButtonText, { color: selectedSupplier ? theme.text : theme.textMuted }]}>
              {selectedSupplier 
                ? (isRtl ? (selectedSupplier.nameAr || selectedSupplier.name) : selectedSupplier.name)
                : (locale === 'ar' ? 'اختر المورد' : 'Select Supplier')
              }
            </Text>
            <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
          </TouchableOpacity>
          <Text style={[styles.helperText, { color: theme.textMuted }]}>
            {locale === 'ar' 
              ? 'سيتم تحديد المستودع عند استلام البضائع'
              : 'Warehouse will be selected when receiving goods'}
          </Text>
        </View>

        {/* PO Number (Auto-generated) & Operation Number */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'رقم أمر الشراء (تلقائي)' : 'PO Number (Auto)'}
              </Text>
              <View style={[styles.autoNumberContainer, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
                <Text style={[styles.autoNumberText, { color: theme.text }]}>{poNumber}</Text>
                <TouchableOpacity onPress={() => setPONumber(generatePONumber())}>
                  <Ionicons name="refresh" size={18} color={theme.primary} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.halfInput}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                {t('operationNumber', locale)}
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={operationNumber}
                onChangeText={setOperationNumber}
                placeholder="OP-001"
                placeholderTextColor={theme.inputPlaceholder}
              />
            </View>
          </View>

          {/* Expected Date */}
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'تاريخ الاستلام المتوقع' : 'Expected Delivery Date'}
            </Text>
            <TouchableOpacity
              style={[styles.selectButton, { backgroundColor: theme.input, borderColor: theme.inputBorder }]}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} />
              <Text style={[styles.selectButtonText, { color: dueDate ? theme.text : theme.textMuted }]}>
                {dueDate 
                  ? dueDate.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', { 
                      year: 'numeric', 
                      month: 'short', 
                      day: 'numeric' 
                    })
                  : (locale === 'ar' ? 'اختر التاريخ (اختياري)' : 'Select date (optional)')
                }
              </Text>
              {dueDate && (
                <TouchableOpacity onPress={() => setDueDate(null)}>
                  <Ionicons name="close-circle" size={20} color={theme.textMuted} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Exchange Rate Display */}
        <View style={[styles.rateCard, { backgroundColor: theme.warningBackground }]}>
          <Ionicons name="trending-up" size={20} color={theme.warning} />
          <Text style={[styles.rateText, { color: theme.warning }]}>
            {locale === 'ar' ? 'سعر الصرف: ' : 'Exchange Rate: '}
            1 USD = {exchangeRate.toLocaleString()} SDG
          </Text>
        </View>

        {/* Items Section */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={[styles.sectionHeader, isRtl && styles.rowReverse]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {t('items', locale)} ({items.length})
            </Text>
            <TouchableOpacity
              style={[styles.addItemButton, { backgroundColor: theme.warning }]}
              onPress={() => setShowItemPicker(true)}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addItemButtonText}>{t('addItem', locale)}</Text>
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <View style={styles.emptyItems}>
              <Ionicons name="cube-outline" size={48} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                {locale === 'ar' ? 'لا توجد أصناف' : 'No items added'}
              </Text>
              <Text style={[styles.emptySubtext, { color: theme.textMuted }]}>
                {locale === 'ar' ? 'اضغط على "إضافة صنف" للبدء' : 'Tap "Add Item" to get started'}
              </Text>
            </View>
          ) : (
            items.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.itemCard,
                  { backgroundColor: theme.backgroundSecondary },
                  index < items.length - 1 && { marginBottom: 12 },
                ]}
              >
                <View style={[styles.itemHeader, isRtl && styles.rowReverse]}>
                  <View style={[styles.itemInfo, isRtl && { alignItems: 'flex-end' }]}>
                    <Text style={[styles.itemName, { color: theme.text }, isRtl && styles.textRtl]}>
                      {isRtl ? (item.nameAr || item.name) : item.name}
                    </Text>
                    <Text style={[styles.itemSku, { color: theme.textMuted }]}>
                      {item.sku || 'No SKU'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveItem(item.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.error} />
                  </TouchableOpacity>
                </View>

                {/* Cost Price Input in SDG */}
                <View style={[styles.priceRow, isRtl && styles.rowReverse]}>
                  <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>
                    {locale === 'ar' ? 'سعر التكلفة (ج.س):' : 'Cost Price (SDG):'}
                  </Text>
                  <View style={[styles.priceInputContainer, { backgroundColor: theme.input, borderColor: theme.inputBorder }]}>
                    <TextInput
                      style={[styles.priceInput, { color: theme.text }]}
                      value={Math.round(item.unitPriceSdg).toString()}
                      onChangeText={(val) => handleUpdatePriceSdg(item.id, parseFloat(val) || 0)}
                      keyboardType="numeric"
                    />
                    <Text style={{ color: theme.textMuted }}>{locale === 'ar' ? 'ج.س' : 'SDG'}</Text>
                  </View>
                </View>
                {/* USD equivalent */}
                <Text style={[styles.usdEquivalent, { color: theme.textMuted }]}>
                  ≈ ${item.unitPrice.toFixed(2)} USD
                </Text>

                <View style={[styles.itemFooter, isRtl && styles.rowReverse]}>
                  <View style={styles.quantityControls}>
                    <TouchableOpacity
                      style={[styles.qtyButton, { backgroundColor: theme.backgroundTertiary }]}
                      onPress={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                    >
                      <Ionicons name="remove" size={16} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.qtyValue, { color: theme.text }]}>{item.quantity}</Text>
                    <TouchableOpacity
                      style={[styles.qtyButton, { backgroundColor: theme.backgroundTertiary }]}
                      onPress={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                    >
                      <Ionicons name="add" size={16} color={theme.text} />
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.itemTotals, isRtl && { alignItems: 'flex-start' }]}>
                    <Text style={[styles.itemTotal, { color: theme.warning }]}>
                      {formatCurrency(item.totalSdg, 'SDG')}
                    </Text>
                    <Text style={[styles.itemTotalSdg, { color: theme.textMuted }]}>
                      ≈ {formatCurrency(item.total, 'USD')}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Notes */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t('notes', locale)}
          </Text>
          <TextInput
            style={[styles.notesInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
            value={notes}
            onChangeText={setNotes}
            placeholder={locale === 'ar' ? 'أضف ملاحظات...' : 'Add notes...'}
            placeholderTextColor={theme.inputPlaceholder}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            textAlign={isRtl ? 'right' : 'left'}
          />
        </View>

        {/* Totals Summary - Primary in SDG */}
        {items.length > 0 && (
          <View style={[styles.totalsCard, { backgroundColor: theme.warningBackground }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>{t('subtotal', locale)}</Text>
              <Text style={[styles.totalValue, { color: theme.text }]}>{formatCurrency(totals.subtotalSdg, 'SDG')}</Text>
            </View>
            <View style={[styles.grandTotalRow, { borderTopColor: theme.warning }]}>
              <Text style={[styles.grandTotalLabel, { color: theme.warning }]}>{t('grandTotal', locale)}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.grandTotalValue, { color: theme.warning }]}>{formatCurrency(totals.totalSdg, 'SDG')}</Text>
                <Text style={[styles.grandTotalSdg, { color: theme.textSecondary }]}>≈ {formatCurrency(totals.total, 'USD')}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={[styles.bottomBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.bottomTotals}>
          <Text style={[styles.bottomTotalLabel, { color: theme.textSecondary }]}>{t('total', locale)}</Text>
          <Text style={[styles.bottomTotalValue, { color: theme.warning }]}>{formatCurrency(totals.totalSdg, 'SDG')}</Text>
        </View>
        <TouchableOpacity
          style={[styles.previewButton, { backgroundColor: theme.warning }]}
          onPress={handlePreview}
          disabled={items.length === 0}
        >
          <Ionicons name="eye" size={20} color="#fff" />
          <Text style={styles.previewButtonText}>
            {locale === 'ar' ? 'معاينة وحفظ' : 'Preview & Save'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Item Picker Modal - Skip stock validation for procurement */}
      <InvoiceItemPicker
        visible={showItemPicker}
        onClose={() => setShowItemPicker(false)}
        onSelect={(item, quantity) => handleAddItem(item, quantity)}
        priceType="wholesale"
        skipStockValidation={true}
      />

      {/* Invoice Preview Modal */}
      <InvoicePreview
        visible={showPreview}
        onClose={() => setShowPreview(false)}
        invoice={currentInvoice}
        onSave={handleSaveInvoice}
      />

      {/* Supplier Picker Modal */}
      <Modal
        visible={showSupplierPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSupplierPicker(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          {/* Modal Header */}
          <View style={[styles.modalHeader, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowSupplierPicker(false)} style={styles.modalCloseButton}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {locale === 'ar' ? 'اختر المورد' : 'Select Supplier'}
            </Text>
            <View style={styles.modalCloseButton} />
          </View>

          {/* Search Bar */}
          <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
            <View style={[styles.searchBar, { backgroundColor: theme.input, borderColor: theme.inputBorder }]}>
              <Ionicons name="search" size={20} color={theme.inputPlaceholder} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }, isRtl && styles.textRtl]}
                placeholder={locale === 'ar' ? 'بحث...' : 'Search...'}
                placeholderTextColor={theme.inputPlaceholder}
                value={supplierSearch}
                onChangeText={setSupplierSearch}
                textAlign={isRtl ? 'right' : 'left'}
              />
            </View>
          </View>

          {/* Suppliers List */}
          {suppliersLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          ) : (
            <FlatList
              data={filteredSuppliers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.supplierListContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.supplierCard,
                    { 
                      backgroundColor: selectedSupplier?.id === item.id ? theme.primaryBackground : theme.card,
                      borderColor: selectedSupplier?.id === item.id ? theme.primary : theme.cardBorder,
                    },
                  ]}
                  onPress={() => {
                    setSelectedSupplier(item);
                    setShowSupplierPicker(false);
                  }}
                >
                  <View style={[styles.supplierIcon, { backgroundColor: theme.warningBackground }]}>
                    <Ionicons name="business" size={24} color={theme.warning} />
                  </View>
                  <View style={[styles.supplierInfo, isRtl && styles.supplierInfoRtl]}>
                    <Text style={[styles.supplierName, { color: theme.text }, isRtl && styles.textRtl]}>
                      {isRtl ? (item.nameAr || item.name) : item.name}
                    </Text>
                    {item.phone && (
                      <Text style={[styles.supplierPhone, { color: theme.textMuted }]}>
                        {item.phone}
                      </Text>
                    )}
                  </View>
                  {selectedSupplier?.id === item.id && (
                    <Ionicons name="checkmark-circle" size={24} color={theme.primary} />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptySuppliers}>
                  <Ionicons name="business-outline" size={48} color={theme.textMuted} />
                  <Text style={[styles.emptySuppliersText, { color: theme.textMuted }]}>
                    {locale === 'ar' ? 'لا يوجد موردين' : 'No suppliers found'}
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </Modal>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={dueDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={new Date()}
          onChange={(event, selectedDate) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (event.type === 'set' && selectedDate) {
              setDueDate(selectedDate);
            }
            if (Platform.OS === 'android') {
              setShowDatePicker(false);
            }
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  section: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  halfInput: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '500',
  },
  textInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 15,
  },
  autoNumberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  autoNumberText: {
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginTop: 12,
  },
  selectButtonText: {
    flex: 1,
    fontSize: 15,
  },
  rateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
  },
  rateText: {
    fontSize: 14,
    fontWeight: '500',
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  addItemButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyItems: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    marginTop: 4,
  },
  itemCard: {
    padding: 16,
    borderRadius: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemSku: {
    fontSize: 12,
  },
  textRtl: {
    textAlign: 'right',
  },
  removeButton: {
    padding: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  priceLabel: {
    fontSize: 13,
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  priceInput: {
    fontSize: 15,
    paddingVertical: 8,
    minWidth: 80,
  },
  usdEquivalent: {
    fontSize: 11,
    marginTop: 4,
    marginLeft: 12,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyValue: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },
  itemTotals: {
    alignItems: 'flex-end',
  },
  itemTotal: {
    fontSize: 16,
    fontWeight: '700',
  },
  itemTotalSdg: {
    fontSize: 12,
    marginTop: 2,
  },
  notesInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    fontSize: 15,
    minHeight: 100,
    marginTop: 12,
  },
  totalsCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  totalLabel: {
    fontSize: 14,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    marginTop: 8,
    borderTopWidth: 2,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  grandTotalValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  grandTotalSdg: {
    fontSize: 13,
    marginTop: 2,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  bottomTotals: {},
  bottomTotalLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  bottomTotalValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  previewButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  searchContainer: {
    padding: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  supplierListContent: {
    padding: 16,
    paddingBottom: 100,
  },
  supplierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 12,
  },
  supplierIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  supplierInfo: {
    flex: 1,
    marginLeft: 12,
  },
  supplierInfoRtl: {
    marginLeft: 0,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  supplierName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  supplierPhone: {
    fontSize: 13,
  },
  emptySuppliers: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptySuppliersText: {
    fontSize: 16,
    marginTop: 12,
  },
  helperText: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
});

