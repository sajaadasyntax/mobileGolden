import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/stores/theme';
import { useLocaleStore } from '@/stores/locale';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';
import {
  Invoice,
  InvoiceItem,
  InvoiceParty,
  generateInvoiceNumber,
  calculateInvoiceTotals,
} from '@/lib/invoice';
import InvoiceItemPicker from '@/components/InvoiceItemPicker';
import InvoicePreview from '@/components/InvoicePreview';

interface Customer {
  id: string;
  name: string;
  nameAr?: string;
  phone?: string;
  email?: string;
  address?: string;
  customerType?: string;
  creditLimitSdg?: number;
}

export default function CreateSalesInvoiceScreen() {
  const router = useRouter();
  const { theme } = useThemeStore();
  const { locale } = useLocaleStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';

  // Form state
  const [invoiceCategory, setInvoiceCategory] = useState<'WHOLESALE' | 'RETAIL'>('WHOLESALE');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedShelfId, setSelectedShelfId] = useState<string | null>(null);
  const [shelves, setShelves] = useState<{ id: string; name: string; nameAr?: string; code: string }[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('0');
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('FIXED');
  const [exchangeRate, setExchangeRate] = useState(600); // Default exchange rate

  // UI State
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [dayCycleOpen, setDayCycleOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);

  // Load exchange rate, shelves, and customers
  useEffect(() => {
    loadExchangeRate();
    loadShelves();
    loadCustomers();
  }, [user?.branchId]);

  const loadExchangeRate = async () => {
    try {
      if (user?.branchId) {
        const dayCycle = await api.dayCycle.getCurrent(user.branchId);
        if (dayCycle?.exchangeRateUsdSdg) {
          setExchangeRate(dayCycle.exchangeRateUsdSdg);
          setDayCycleOpen(true);
        } else {
          setDayCycleOpen(false);
        }
      }
    } catch (error) {
      console.error('Failed to load exchange rate:', error);
      setDayCycleOpen(false);
    }
  };

  const loadCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const result = await api.sales.customers.list();
      const data = result?.data || result || [];
      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load customers:', error);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const filteredCustomers = customers.filter(c => {
    const search = customerSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(search) ||
      (c.nameAr && c.nameAr.includes(customerSearch)) ||
      (c.phone && c.phone.includes(search))
    );
  });

  const loadShelves = async () => {
    try {
      if (user?.branchId) {
        const result = await api.inventory.shelves(user.branchId);
        const shelvesData = result || [];
        setShelves(shelvesData);
        // Auto-select first shelf if available
        if (shelvesData.length > 0 && !selectedShelfId) {
          setSelectedShelfId(shelvesData[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load shelves:', error);
    }
  };

  const handleAddItem = (
    item: { id: string; name: string; nameAr?: string; sku?: string; wholesalePrice: number; retailPrice: number; unit?: string },
    quantity: number,
    priceType: 'wholesale' | 'retail'
  ) => {
    const unitPrice = priceType === 'wholesale' ? item.wholesalePrice : item.retailPrice;
    const total = quantity * unitPrice;

    const newItem: InvoiceItem = {
      id: `${item.id}-${Date.now()}`,
      itemId: item.id,
      name: item.name,
      nameAr: item.nameAr,
      sku: item.sku,
      quantity,
      unitPrice,
      unitPriceSdg: unitPrice * exchangeRate,
      total,
      totalSdg: total * exchangeRate,
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
        const total = newQuantity * item.unitPrice;
        return {
          ...item,
          quantity: newQuantity,
          total,
          totalSdg: total * exchangeRate,
        };
      }
      return item;
    }));
  };

  const calculateTotals = () => {
    const itemsForCalculation = items.map(item => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      discountType: item.discountType,
    }));

    return calculateInvoiceTotals(
      itemsForCalculation,
      exchangeRate,
      0, // tax rate
      parseFloat(discount) || 0,
      discountType
    );
  };

  const totals = calculateTotals();

  const buildInvoice = (): Invoice => {
    const invoiceNumber = generateInvoiceNumber('SALES', user?.branchId?.substring(0, 3).toUpperCase());
    
    return {
      invoiceNumber,
      invoiceType: 'SALES',
      invoiceCategory,
      invoiceDate: new Date().toISOString(),
      branchId: user?.branchId || '',
      branchName: user?.branch?.name,
      customer: selectedCustomer ? {
        id: selectedCustomer.id,
        name: selectedCustomer.name,
        nameAr: selectedCustomer.nameAr,
        phone: selectedCustomer.phone,
        email: selectedCustomer.email,
        address: selectedCustomer.address,
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
    };
  };

  const handlePreview = () => {
    // Validate day cycle is open
    if (!dayCycleOpen) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'يجب فتح اليوم أولاً لإنشاء فاتورة' : 'Day must be opened first to create an invoice'
      );
      return;
    }

    // Validate items
    if (items.length === 0) {
      Alert.alert(
        locale === 'ar' ? 'تنبيه' : 'Warning',
        locale === 'ar' ? 'الرجاء إضافة أصناف للفاتورة' : 'Please add items to the invoice'
      );
      return;
    }

    // Validate shelf selection
    if (!selectedShelfId) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'لم يتم تحديد موقع البيع' : 'No shelf location selected'
      );
      return;
    }

    // Validate wholesale requires customer
    if (invoiceCategory === 'WHOLESALE' && !selectedCustomer) {
      Alert.alert(
        locale === 'ar' ? 'تنبيه' : 'Warning',
        locale === 'ar' ? 'يجب تحديد عميل لفاتورة الجملة' : 'Customer is required for wholesale invoice',
        [
          { text: locale === 'ar' ? 'اختيار عميل' : 'Select Customer', onPress: () => setShowCustomerPicker(true) },
          { text: locale === 'ar' ? 'إلغاء' : 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    const invoice = buildInvoice();
    setCurrentInvoice(invoice);
    setShowPreview(true);
  };

  const handleSaveInvoice = async () => {
    if (!currentInvoice || !selectedShelfId) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'يجب اختيار موقع البيع' : 'Please select a shelf location'
      );
      return;
    }
    
    setLoading(true);
    try {
      // Format data for backend API
      await api.sales.createInvoice({
        shelfId: selectedShelfId,
        customerId: currentInvoice.customer?.id,
        invoiceType: currentInvoice.invoiceCategory, // WHOLESALE or RETAIL
        notes: currentInvoice.notes,
        lines: currentInvoice.items.map(item => ({
          itemId: item.itemId,
          qty: item.quantity,
          unitPriceUsd: item.unitPrice,
        })),
      });

      Alert.alert(
        locale === 'ar' ? 'نجاح' : 'Success',
        locale === 'ar' ? 'تم حفظ الفاتورة بنجاح' : 'Invoice saved successfully',
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
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        error.message || (locale === 'ar' ? 'فشل في حفظ الفاتورة' : 'Failed to save invoice')
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
                  backgroundColor: invoiceCategory === 'WHOLESALE' ? theme.primary : theme.backgroundTertiary,
                  borderColor: invoiceCategory === 'WHOLESALE' ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setInvoiceCategory('WHOLESALE')}
            >
              <Ionicons 
                name="business" 
                size={20} 
                color={invoiceCategory === 'WHOLESALE' ? '#fff' : theme.textSecondary} 
              />
              <Text style={[
                styles.typeButtonText,
                { color: invoiceCategory === 'WHOLESALE' ? '#fff' : theme.textSecondary }
              ]}>
                {t('wholesale', locale)}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.typeButton,
                { 
                  backgroundColor: invoiceCategory === 'RETAIL' ? theme.primary : theme.backgroundTertiary,
                  borderColor: invoiceCategory === 'RETAIL' ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setInvoiceCategory('RETAIL')}
            >
              <Ionicons 
                name="storefront" 
                size={20} 
                color={invoiceCategory === 'RETAIL' ? '#fff' : theme.textSecondary} 
              />
              <Text style={[
                styles.typeButtonText,
                { color: invoiceCategory === 'RETAIL' ? '#fff' : theme.textSecondary }
              ]}>
                {t('retail', locale)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Customer Selection */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t('customer', locale)}
          </Text>
          <TouchableOpacity 
            style={[styles.selectButton, { backgroundColor: theme.input, borderColor: theme.inputBorder }]}
            onPress={() => setShowCustomerPicker(true)}
          >
            <Ionicons name="person" size={20} color={theme.textSecondary} />
            <Text style={[styles.selectButtonText, { color: selectedCustomer ? theme.text : theme.textMuted }]}>
              {selectedCustomer 
                ? (isRtl ? (selectedCustomer.nameAr || selectedCustomer.name) : selectedCustomer.name)
                : (locale === 'ar' ? 'عميل نقدي (اختياري)' : 'Walk-in Customer (Optional)')
              }
            </Text>
            <Ionicons name={isRtl ? 'chevron-back' : 'chevron-forward'} size={20} color={theme.textMuted} />
          </TouchableOpacity>
          {selectedCustomer && (
            <TouchableOpacity
              style={styles.clearCustomerBtn}
              onPress={() => setSelectedCustomer(null)}
            >
              <Text style={[styles.clearCustomerText, { color: theme.error }]}>
                {locale === 'ar' ? 'إزالة العميل' : 'Clear Customer'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Exchange Rate Display */}
        <View style={[styles.rateCard, { backgroundColor: theme.infoBackground }]}>
          <Ionicons name="trending-up" size={20} color={theme.info} />
          <Text style={[styles.rateText, { color: theme.info }]}>
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
              style={[styles.addItemButton, { backgroundColor: theme.primary }]}
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
                      {item.sku || 'No SKU'} • {formatCurrency(item.unitPrice, 'USD')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveItem(item.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.error} />
                  </TouchableOpacity>
                </View>

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
                    <Text style={[styles.itemTotal, { color: theme.success }]}>
                      {formatCurrency(item.total, 'USD')}
                    </Text>
                    <Text style={[styles.itemTotalSdg, { color: theme.textMuted }]}>
                      {formatCurrency(item.totalSdg, 'SDG')}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Discount */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t('discount', locale)}
          </Text>
          <View style={styles.discountRow}>
            <View style={[styles.discountInput, { backgroundColor: theme.input, borderColor: theme.inputBorder }]}>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={discount}
                onChangeText={setDiscount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={theme.inputPlaceholder}
              />
            </View>
            <View style={styles.discountTypeButtons}>
              <TouchableOpacity
                style={[
                  styles.discountTypeButton,
                  { 
                    backgroundColor: discountType === 'FIXED' ? theme.primary : theme.backgroundTertiary,
                    borderColor: discountType === 'FIXED' ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => setDiscountType('FIXED')}
              >
                <Text style={{ color: discountType === 'FIXED' ? '#fff' : theme.textSecondary }}>$</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.discountTypeButton,
                  { 
                    backgroundColor: discountType === 'PERCENTAGE' ? theme.primary : theme.backgroundTertiary,
                    borderColor: discountType === 'PERCENTAGE' ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => setDiscountType('PERCENTAGE')}
              >
                <Text style={{ color: discountType === 'PERCENTAGE' ? '#fff' : theme.textSecondary }}>%</Text>
              </TouchableOpacity>
            </View>
          </View>
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

        {/* Totals Summary */}
        {items.length > 0 && (
          <View style={[styles.totalsCard, { backgroundColor: theme.primaryBackground }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>{t('subtotal', locale)}</Text>
              <Text style={[styles.totalValue, { color: theme.text }]}>{formatCurrency(totals.subtotal, 'USD')}</Text>
            </View>
            {totals.discount > 0 && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>{t('discount', locale)}</Text>
                <Text style={[styles.totalValue, { color: theme.error }]}>-{formatCurrency(totals.discount, 'USD')}</Text>
              </View>
            )}
            <View style={[styles.grandTotalRow, { borderTopColor: theme.primary }]}>
              <Text style={[styles.grandTotalLabel, { color: theme.primary }]}>{t('grandTotal', locale)}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.grandTotalValue, { color: theme.primary }]}>{formatCurrency(totals.total, 'USD')}</Text>
                <Text style={[styles.grandTotalSdg, { color: theme.textSecondary }]}>{formatCurrency(totals.totalSdg, 'SDG')}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={[styles.bottomBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.bottomTotals}>
          <Text style={[styles.bottomTotalLabel, { color: theme.textSecondary }]}>{t('total', locale)}</Text>
          <Text style={[styles.bottomTotalValue, { color: theme.primary }]}>{formatCurrency(totals.total, 'USD')}</Text>
        </View>
        <TouchableOpacity
          style={[styles.previewButton, { backgroundColor: theme.primary }]}
          onPress={handlePreview}
          disabled={items.length === 0}
        >
          <Ionicons name="eye" size={20} color="#fff" />
          <Text style={styles.previewButtonText}>
            {locale === 'ar' ? 'معاينة وحفظ' : 'Preview & Save'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Item Picker Modal */}
      <InvoiceItemPicker
        visible={showItemPicker}
        onClose={() => setShowItemPicker(false)}
        onSelect={handleAddItem}
        priceType={invoiceCategory === 'WHOLESALE' ? 'wholesale' : 'retail'}
      />

      {/* Invoice Preview Modal */}
      <InvoicePreview
        visible={showPreview}
        onClose={() => setShowPreview(false)}
        invoice={currentInvoice}
        onSave={handleSaveInvoice}
      />

      {/* Customer Picker Modal */}
      <Modal visible={showCustomerPicker} animationType="slide" transparent>
        <View style={styles.customerModalOverlay}>
          <View style={[styles.customerModalContent, { backgroundColor: theme.surface }]}>
            <View style={[styles.customerModalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.customerModalTitle, { color: theme.text }]}>
                {locale === 'ar' ? 'اختيار العميل' : 'Select Customer'}
              </Text>
              <TouchableOpacity onPress={() => setShowCustomerPicker(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={[styles.customerSearchContainer, { backgroundColor: theme.input, borderColor: theme.inputBorder }]}>
              <Ionicons name="search" size={20} color={theme.textSecondary} />
              <TextInput
                style={[styles.customerSearchInput, { color: theme.text }]}
                placeholder={locale === 'ar' ? 'البحث عن عميل...' : 'Search customers...'}
                placeholderTextColor={theme.inputPlaceholder}
                value={customerSearch}
                onChangeText={setCustomerSearch}
                textAlign={isRtl ? 'right' : 'left'}
              />
              {customerSearch ? (
                <TouchableOpacity onPress={() => setCustomerSearch('')}>
                  <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Walk-in Customer Option */}
            <TouchableOpacity
              style={[styles.customerOption, { backgroundColor: theme.warningBackground, borderColor: theme.warning }]}
              onPress={() => {
                setSelectedCustomer(null);
                setShowCustomerPicker(false);
              }}
            >
              <View style={[styles.customerOptionIcon, { backgroundColor: theme.warning + '30' }]}>
                <Ionicons name="person-outline" size={20} color={theme.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.customerOptionName, { color: theme.warning }]}>
                  {locale === 'ar' ? 'عميل نقدي' : 'Walk-in Customer'}
                </Text>
                <Text style={[styles.customerOptionSub, { color: theme.textSecondary }]}>
                  {locale === 'ar' ? 'بدون بيانات عميل' : 'No customer data'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Customer List */}
            {loadingCustomers ? (
              <View style={styles.customerLoading}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            ) : (
              <FlatList
                data={filteredCustomers}
                keyExtractor={item => item.id}
                style={styles.customerList}
                ListEmptyComponent={
                  <View style={styles.customerEmpty}>
                    <Ionicons name="people-outline" size={48} color={theme.textMuted} />
                    <Text style={[styles.customerEmptyText, { color: theme.textMuted }]}>
                      {locale === 'ar' ? 'لا يوجد عملاء' : 'No customers found'}
                    </Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.customerOption,
                      { 
                        backgroundColor: selectedCustomer?.id === item.id ? theme.primaryBackground : theme.card,
                        borderColor: selectedCustomer?.id === item.id ? theme.primary : theme.border,
                      }
                    ]}
                    onPress={() => {
                      setSelectedCustomer(item);
                      setShowCustomerPicker(false);
                      setCustomerSearch('');
                    }}
                  >
                    <View style={[styles.customerOptionIcon, { backgroundColor: '#8b5cf620' }]}>
                      <Ionicons name="person" size={20} color="#8b5cf6" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.customerOptionName, { color: theme.text }]}>
                        {isRtl ? (item.nameAr || item.name) : item.name}
                      </Text>
                      <View style={[styles.customerMeta, isRtl && styles.rowReverse]}>
                        {item.phone && (
                          <Text style={[styles.customerOptionSub, { color: theme.textSecondary }]}>
                            {item.phone}
                          </Text>
                        )}
                        <View style={[
                          styles.customerTypeBadge,
                          { backgroundColor: item.customerType === 'WHOLESALE' ? '#3b82f620' : '#f59e0b20' }
                        ]}>
                          <Text style={[
                            styles.customerTypeText,
                            { color: item.customerType === 'WHOLESALE' ? '#3b82f6' : '#f59e0b' }
                          ]}>
                            {item.customerType === 'WHOLESALE' ? t('wholesale', locale) : t('retail', locale)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {selectedCustomer?.id === item.id && (
                      <Ionicons name="checkmark-circle" size={24} color={theme.primary} />
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
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
  rowReverse: {
    flexDirection: 'row-reverse',
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
    fontSize: 14,
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
  discountRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  discountInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  input: {
    fontSize: 16,
    paddingVertical: 14,
  },
  discountTypeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  discountTypeButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  clearCustomerBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  clearCustomerText: {
    fontSize: 13,
  },
  // Customer Modal Styles
  customerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  customerModalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  customerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  customerModalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  customerSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  customerSearchInput: {
    flex: 1,
    height: 44,
    marginLeft: 8,
    fontSize: 16,
  },
  customerList: {
    maxHeight: 400,
  },
  customerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  customerOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerOptionName: {
    fontSize: 15,
    fontWeight: '600',
  },
  customerOptionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  customerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  customerTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  customerTypeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  customerLoading: {
    padding: 40,
    alignItems: 'center',
  },
  customerEmpty: {
    padding: 40,
    alignItems: 'center',
  },
  customerEmptyText: {
    marginTop: 12,
    fontSize: 14,
  },
});

