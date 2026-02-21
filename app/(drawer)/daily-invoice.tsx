import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';
import {
  Invoice,
  InvoiceItem as InvoiceItemType,
  generateInvoiceNumber,
} from '@/lib/invoice';
import InvoicePreview from '@/components/InvoicePreview';

interface SaleItem {
  id: string;
  itemId: string;
  batchId?: string;
  name: string;
  nameAr: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitPriceSdg: number;
  total: number;
  totalSdg: number;
  unit: string;
  expiryDate?: string;
}

interface AvailableItem {
  id: string;
  name: string;
  nameAr: string;
  sku: string;
  retailPrice: number;
  wholesalePrice: number;
  unit: string;
  batches: {
    id: string;
    qtyRemaining: number;
    expiryDate?: string;
    unitCostUsd: number;
  }[];
  totalStock: number;
}

export default function DailyInvoiceScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  
  const [invoiceItems, setInvoiceItems] = useState<SaleItem[]>([]);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<AvailableItem | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [showCheckout, setShowCheckout] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [cardReceived, setCardReceived] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'MIXED'>('CASH');
  
  // Backend data
  const [availableItems, setAvailableItems] = useState<AvailableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(600);
  const [dayCycle, setDayCycle] = useState<any>(null);
  const [dailyAggregate, setDailyAggregate] = useState<any>(null);
  const [shelfId, setShelfId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null);

  const invoiceTotal = invoiceItems.reduce((sum, item) => sum + item.total, 0);
  const invoiceTotalSdg = invoiceItems.reduce((sum, item) => sum + item.totalSdg, 0);
  const itemCount = invoiceItems.reduce((sum, item) => sum + item.quantity, 0);

  // Load backend data on mount
  useEffect(() => {
    loadInitialData();
  }, [user]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      if (!user) return;
      
      // Get day cycle and exchange rate
      const cycle = await api.dayCycle.getCurrent(user.branchId);
      if (!cycle) {
        Alert.alert(
          locale === 'ar' ? 'تنبيه' : 'Warning',
          locale === 'ar' ? 'يجب فتح اليوم أولاً' : 'Day must be opened first'
        );
        setLoading(false);
        return;
      }
      setDayCycle(cycle);
      setExchangeRate(Number(cycle.exchangeRateUsdSdg) || 600);
      
      // Use the user's assigned shelf directly
      const assignedShelf = (user as any)?.shelf;
      
      if (assignedShelf) {
        setShelfId(assignedShelf.id);
        
        // Load daily aggregate invoice for this shelf
        try {
          const aggregate = await api.sales.dailyAggregate?.getOrCreate(assignedShelf.id);
          setDailyAggregate(aggregate);
        } catch (e) {
          // Aggregate might not exist yet
        }
        
        // Load items with stock info, passing the shelf ID
        await loadAvailableItems(assignedShelf.id);
      } else {
        // No shelf assigned, show error
        Alert.alert(
          locale === 'ar' ? 'خطأ' : 'Error',
          locale === 'ar' ? 'لا يوجد رف مخصص لهذا المستخدم' : 'No shelf assigned to this user'
        );
        setLoading(false);
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableItems = async (currentShelfId?: string) => {
    try {
      if (!user) return;
      
      const shelfToUse = currentShelfId || shelfId;
      if (!shelfToUse) return;
      
      // Get shelf stock with batch info
      const stockResult = await api.inventory.stockManagement.getShelfStock(shelfToUse, { pageSize: 100 });
      const stockData = stockResult?.data || stockResult || [];
      
      // Get items with prices
      const itemsWithPrices = await api.inventory.itemsWithPrices(user.branchId);
      
      // Create a map of stock quantities and batches by item ID
      const stockMap = new Map<string, { totalStock: number; batches: any[] }>();
      
      for (const stockItem of stockData) {
        const itemId = stockItem.item?.id || stockItem.itemId;
        if (!itemId) continue;
        
        // Get batches for this item
        try {
          const batchesResult = await api.inventory.stockManagement.getBatches(itemId, { shelfId: shelfToUse });
          const batches = (batchesResult || [])
            .filter((b: any) => Number(b.qtyRemaining) > 0)
            .map((b: any) => ({
              id: b.id,
              qtyRemaining: Number(b.qtyRemaining) || 0,
              expiryDate: b.expiryDate,
              unitCostUsd: Number(b.unitCostUsd) || 0,
            }));
          
          stockMap.set(itemId, {
            totalStock: Number(stockItem.totalQty) || 0,
            batches,
          });
        } catch {
          stockMap.set(itemId, {
            totalStock: Number(stockItem.totalQty) || 0,
            batches: [],
          });
        }
      }
      
      // Transform to AvailableItem format with real stock data
      const items: AvailableItem[] = itemsWithPrices.map((item: any) => {
        const stockInfo = stockMap.get(item.id);
        return {
          id: item.id,
          name: item.name,
          nameAr: item.nameAr || item.name,
          sku: item.sku || 'N/A',
          retailPrice: item.retailPrice || 0,
          wholesalePrice: item.wholesalePrice || 0,
          unit: item.unit || 'unit',
          batches: stockInfo?.batches || [],
          totalStock: stockInfo?.totalStock || 0,
        };
      });
      
      // Only show items with stock available
      setAvailableItems(items.filter(item => item.totalStock > 0));
    } catch (error) {
      console.error('Failed to load items:', error);
      // Fallback to items without stock info
      try {
        const itemsWithPrices = await api.inventory.itemsWithPrices(user.branchId);
        const items: AvailableItem[] = itemsWithPrices.map((item: any) => ({
          id: item.id,
          name: item.name,
          nameAr: item.nameAr || item.name,
          sku: item.sku || 'N/A',
          retailPrice: item.retailPrice || 0,
          wholesalePrice: item.wholesalePrice || 0,
          unit: item.unit || 'unit',
          batches: [],
          totalStock: 0,
        }));
        setAvailableItems(items);
      } catch {
        setAvailableItems([]);
      }
    }
  };

  const onRefresh = async () => {
    await loadInitialData();
  };

  const filteredItems = availableItems.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.nameAr.includes(searchQuery) ||
    item.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectItem = async (item: AvailableItem) => {
    // Check if item has stock
    if (item.totalStock <= 0) {
      Alert.alert(
        t('error', locale),
        locale === 'ar' ? 'هذا المنتج غير متوفر في المخزون' : 'This item is out of stock'
      );
      return;
    }
    setSelectedItem(item);
    setQuantity('1');
  };

  // Calculate already added quantity for an item
  const getAddedQuantity = (itemId: string): number => {
    return invoiceItems
      .filter(item => item.itemId === itemId)
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  // Get available stock for an item (total stock - already added)
  const getAvailableStock = (item: AvailableItem): number => {
    const addedQty = getAddedQuantity(item.id);
    return item.totalStock - addedQty;
  };

  const handleAddItem = () => {
    if (!selectedItem) return;
    
    const qty = parseInt(quantity) || 1;
    if (qty <= 0) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'الكمية يجب أن تكون أكبر من صفر' : 'Quantity must be greater than 0');
      return;
    }

    // Stock validation
    const availableStock = getAvailableStock(selectedItem);
    if (qty > availableStock) {
      Alert.alert(
        t('error', locale),
        locale === 'ar' 
          ? `الكمية المتوفرة: ${availableStock} فقط` 
          : `Only ${availableStock} available in stock`
      );
      return;
    }

    // Check for near-expiry batches and warn
    const nearExpiryBatches = selectedItem.batches.filter(b => {
      if (!b.expiryDate) return false;
      const daysToExpiry = Math.floor((new Date(b.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return daysToExpiry <= 30;
    });
    
    if (nearExpiryBatches.length > 0) {
      // Show warning but still allow adding
      const expiryWarning = locale === 'ar'
        ? 'تحذير: بعض الدفعات قريبة من تاريخ الانتهاء'
        : 'Warning: Some batches are near expiry';
      Alert.alert(locale === 'ar' ? 'تحذير' : 'Warning', expiryWarning);
    }

    const unitPrice = selectedItem.retailPrice;
    const total = unitPrice * qty;
    const totalSdg = total * exchangeRate;

    // Get the first batch to use (FIFO)
    const firstBatch = selectedItem.batches[0];

    const newItem: SaleItem = {
      id: `${selectedItem.id}-${Date.now()}`,
      itemId: selectedItem.id,
      batchId: firstBatch?.id,
      name: selectedItem.name,
      nameAr: selectedItem.nameAr,
      expiryDate: firstBatch?.expiryDate,
      sku: selectedItem.sku,
      quantity: qty,
      unitPrice,
      unitPriceSdg: unitPrice * exchangeRate,
      total,
      totalSdg,
      unit: selectedItem.unit,
    };

    setInvoiceItems([...invoiceItems, newItem]);
    setSelectedItem(null);
    setQuantity('1');
    setShowItemPicker(false);
  };

  const handleRemoveItem = (itemId: string) => {
    setInvoiceItems(invoiceItems.filter(item => item.id !== itemId));
  };

  const handleUpdateQuantity = (itemId: string, newQty: number) => {
    if (newQty < 1) return;
    
    setInvoiceItems(invoiceItems.map(item => {
      if (item.id === itemId) {
        const total = item.unitPrice * newQty;
        return {
          ...item,
          quantity: newQty,
          total,
          totalSdg: total * exchangeRate,
        };
      }
      return item;
    }));
  };

  const handleCloseInvoice = () => {
    if (invoiceItems.length === 0) {
      Alert.alert(t('error', locale), t('noItemsInInvoice', locale));
      return;
    }
    setShowCheckout(true);
  };

  const handleConfirmCheckout = async () => {
    const cashAmount = parseFloat(cashReceived) || 0;
    const cardAmount = parseFloat(cardReceived) || 0;
    const totalReceived = cashAmount + cardAmount;
    
    if (totalReceived < invoiceTotalSdg) {
      Alert.alert(
        t('error', locale), 
        locale === 'ar' ? 'المبلغ المستلم أقل من الإجمالي' : 'Total received is less than invoice total'
      );
      return;
    }

    if (!shelfId) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'لم يتم تحديد الرف' : 'Shelf not selected');
      return;
    }

    setSaving(true);
    try {
      // Create sales invoice via backend
      await api.sales.createInvoice({
        shelfId,
        invoiceType: 'RETAIL',
        notes: `Daily aggregate sale - ${paymentMethod}`,
        lines: invoiceItems.map(item => ({
          itemId: item.itemId,
          qty: item.quantity,
          unitPriceUsd: item.unitPrice,
        })),
      });

      // Update daily aggregate totals
      if (dailyAggregate) {
        try {
          await api.sales.dailyAggregate?.update(shelfId, {
            cashTotalSdg: (dailyAggregate.cashTotalSdg || 0) + cashAmount,
            cardTotalSdg: (dailyAggregate.cardTotalSdg || 0) + cardAmount,
            itemCount: (dailyAggregate.itemCount || 0) + itemCount,
            transactionCount: (dailyAggregate.transactionCount || 0) + 1,
          });
        } catch (e) {
          console.error('Failed to update aggregate:', e);
        }
      }

      const builtInvoice: Invoice = {
        invoiceNumber: generateInvoiceNumber('SALES'),
        invoiceType: 'SALES',
        invoiceCategory: 'RETAIL',
        invoiceDate: new Date().toISOString(),
        branchId: user?.branchId || '',
        items: invoiceItems.map((it) => ({
          id: it.id,
          itemId: it.itemId,
          name: it.name,
          nameAr: it.nameAr,
          sku: it.sku,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          unitPriceSdg: it.unitPriceSdg,
          total: it.total,
          totalSdg: it.totalSdg,
          unit: it.unit,
        })),
        subtotal: invoiceTotal,
        subtotalSdg: invoiceTotalSdg,
        discount: 0,
        discountSdg: 0,
        tax: 0,
        taxSdg: 0,
        total: invoiceTotal,
        totalSdg: invoiceTotalSdg,
        exchangeRate,
        paymentStatus: 'PAID',
        paymentMethod: paymentMethod === 'MIXED' ? 'MIXED' : paymentMethod === 'CARD' ? 'BANK_TRANSFER' : 'CASH',
        amountPaid: invoiceTotal,
        amountPaidSdg: invoiceTotalSdg,
        amountDue: 0,
        amountDueSdg: 0,
        notes: `Daily aggregate sale - ${paymentMethod}`,
        createdAt: new Date().toISOString(),
      };

      setLastInvoice(builtInvoice);
      setShowCheckout(false);

      Alert.alert(
        t('success', locale), 
        t('invoiceClosed', locale),
        [
          { text: locale === 'ar' ? 'معاينة الفاتورة' : 'View Invoice', onPress: () => {
            setShowPreview(true);
          }},
          { text: 'OK', onPress: () => {
            setInvoiceItems([]);
            setCashReceived('');
            setCardReceived('');
            loadInitialData();
          }},
        ]
      );
    } catch (error: any) {
      Alert.alert(
        t('error', locale),
        error.message || (locale === 'ar' ? 'فشل في حفظ الفاتورة' : 'Failed to save invoice')
      );
    } finally {
      setSaving(false);
    }
  };

  const changeAmount = (parseFloat(cashReceived) || 0) + (parseFloat(cardReceived) || 0) - invoiceTotalSdg;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          {locale === 'ar' ? 'جاري التحميل...' : 'Loading...'}
        </Text>
      </View>
    );
  }

  if (!dayCycle) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <Ionicons name="moon" size={64} color={theme.warning} />
        <Text style={[styles.warningTitle, { color: theme.text }]}>
          {locale === 'ar' ? 'اليوم مغلق' : 'Day is Closed'}
        </Text>
        <Text style={[styles.warningText, { color: theme.textSecondary }]}>
          {locale === 'ar' ? 'يجب فتح اليوم من قبل المدير للبدء بالمبيعات' : 'The day must be opened by an admin to start sales'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header Stats */}
      <View style={[styles.statsRow, isRtl && styles.statsRowRtl]}>
        <View style={[styles.statCard, { backgroundColor: theme.primaryBackground }]}>
          <Text style={[styles.statValue, { color: theme.primary }]}>
            ${invoiceTotal.toFixed(2)}
          </Text>
          <Text style={[styles.statSubValue, { color: theme.textSecondary }]}>
            {invoiceTotalSdg.toLocaleString()} SDG
          </Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('invoiceTotal', locale)}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.successBackground }]}>
          <Text style={[styles.statValue, { color: theme.success }]}>{itemCount}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('itemsSold', locale)}</Text>
        </View>
      </View>

      {/* Exchange Rate Info */}
      <View style={[styles.rateInfo, { backgroundColor: theme.infoBackground }]}>
        <Ionicons name="trending-up" size={16} color={theme.info} />
        <Text style={[styles.rateText, { color: theme.info }]}>
          1 USD = {exchangeRate.toLocaleString()} SDG
        </Text>
      </View>

      {/* Quick Add Button */}
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: theme.primary }]}
        onPress={() => setShowItemPicker(true)}
      >
        <Ionicons name="add-circle" size={24} color="#fff" />
        <Text style={styles.addButtonText}>{t('instantSale', locale)}</Text>
      </TouchableOpacity>

      {/* Current Invoice Items */}
      <View style={[styles.invoiceSection, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <View style={[styles.invoiceHeader, isRtl && styles.rowReverse]}>
          <Text style={[styles.invoiceTitle, { color: theme.text }]}>{t('currentInvoice', locale)}</Text>
          {invoiceItems.length > 0 && (
            <TouchableOpacity onPress={() => setInvoiceItems([])}>
              <Text style={[styles.clearText, { color: theme.error }]}>
                {locale === 'ar' ? 'مسح الكل' : 'Clear All'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {invoiceItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={48} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              {t('noItemsInInvoice', locale)}
            </Text>
          </View>
        ) : (
          <ScrollView 
            style={styles.itemsList}
            refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={theme.primary} />}
          >
            {invoiceItems.map((item) => (
              <View 
                key={item.id} 
                style={[
                  styles.invoiceItem, 
                  { borderBottomColor: theme.border },
                  isRtl && styles.rowReverse
                ]}
              >
                <View style={[styles.itemInfo, isRtl && { alignItems: 'flex-end' }]}>
                  <Text style={[styles.itemName, { color: theme.text }]}>
                    {isRtl ? item.nameAr : item.name}
                  </Text>
                  <Text style={[styles.itemDetails, { color: theme.textSecondary }]}>
                    ${item.unitPrice.toFixed(2)} × {item.quantity}
                  </Text>
                  <Text style={[styles.itemSku, { color: theme.textMuted }]}>
                    {item.sku}
                  </Text>
                </View>
                <View style={[styles.itemActions, isRtl && styles.rowReverse]}>
                  <View style={styles.qtyControls}>
                    <TouchableOpacity 
                      style={[styles.qtyBtn, { backgroundColor: theme.backgroundTertiary }]}
                      onPress={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                    >
                      <Ionicons name="remove" size={16} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.qtyText, { color: theme.text }]}>{item.quantity}</Text>
                    <TouchableOpacity 
                      style={[styles.qtyBtn, { backgroundColor: theme.backgroundTertiary }]}
                      onPress={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                    >
                      <Ionicons name="add" size={16} color={theme.text} />
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.itemTotals, isRtl && { alignItems: 'flex-start' }]}>
                    <Text style={[styles.itemTotal, { color: theme.primary }]}>
                      ${item.total.toFixed(2)}
                    </Text>
                    <Text style={[styles.itemTotalSdg, { color: theme.textMuted }]}>
                      {item.totalSdg.toLocaleString()} SDG
                    </Text>
                  </View>
                  <TouchableOpacity 
                    onPress={() => handleRemoveItem(item.id)}
                    style={styles.removeButton}
                  >
                    <Ionicons name="close-circle" size={22} color={theme.error} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Invoice Total & Checkout */}
        {invoiceItems.length > 0 && (
          <View style={[styles.checkoutSection, { borderTopColor: theme.border }]}>
            <View style={[styles.totalRow, isRtl && styles.rowReverse]}>
              <Text style={[styles.totalLabel, { color: theme.text }]}>{t('total', locale)}</Text>
              <View style={{ alignItems: isRtl ? 'flex-start' : 'flex-end' }}>
                <Text style={[styles.totalAmount, { color: theme.primary }]}>${invoiceTotal.toFixed(2)}</Text>
                <Text style={[styles.totalAmountSdg, { color: theme.textSecondary }]}>
                  {invoiceTotalSdg.toLocaleString()} SDG
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.checkoutButton, { backgroundColor: theme.success }]}
              onPress={handleCloseInvoice}
            >
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={styles.checkoutButtonText}>{t('closeInvoice', locale)}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Item Picker Modal */}
      <Modal visible={showItemPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{t('selectItem', locale)}</Text>
              <TouchableOpacity onPress={() => setShowItemPicker(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={[styles.searchContainer, { backgroundColor: theme.input, borderColor: theme.inputBorder }]}>
              <Ionicons name="search" size={20} color={theme.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }, isRtl && { textAlign: 'right' }]}
                placeholder={t('search', locale)}
                placeholderTextColor={theme.inputPlaceholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Items List */}
            <FlatList
              data={filteredItems}
              keyExtractor={item => item.id}
              style={styles.itemPickerList}
              ListEmptyComponent={
                <View style={styles.emptyList}>
                  <Ionicons name="cube-outline" size={48} color={theme.textMuted} />
                  <Text style={[styles.emptyListText, { color: theme.textMuted }]}>
                    {locale === 'ar' ? 'لا توجد أصناف' : 'No items found'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickableItem,
                    { backgroundColor: selectedItem?.id === item.id ? theme.primaryBackground : theme.card },
                    { borderColor: selectedItem?.id === item.id ? theme.primary : theme.cardBorder },
                  ]}
                  onPress={() => handleSelectItem(item)}
                >
                  <View style={isRtl ? { alignItems: 'flex-end', flex: 1 } : { flex: 1 }}>
                    <Text style={[styles.pickableItemName, { color: theme.text }]}>
                      {isRtl ? item.nameAr : item.name}
                    </Text>
                    <Text style={[styles.pickableItemSku, { color: theme.textSecondary }]}>
                      {item.sku}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.pickableItemPrice, { color: theme.primary }]}>
                      ${item.retailPrice.toFixed(2)}
                    </Text>
                    <Text style={[styles.pickableItemPriceSdg, { color: theme.textMuted }]}>
                      {(item.retailPrice * exchangeRate).toLocaleString()} SDG
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />

            {/* Quantity Input */}
            {selectedItem && (
              <View style={[styles.quantitySection, { borderTopColor: theme.border, backgroundColor: theme.backgroundSecondary }]}>
                <View style={[styles.selectedItemInfo, isRtl && styles.rowReverse]}>
                  <Text style={[styles.selectedItemName, { color: theme.text }]}>
                    {isRtl ? selectedItem.nameAr : selectedItem.name}
                  </Text>
                  <Text style={[styles.selectedItemPrice, { color: theme.primary }]}>
                    ${selectedItem.retailPrice.toFixed(2)}
                  </Text>
                </View>
                
                <View style={[styles.quantityRow, isRtl && styles.rowReverse]}>
                  <Text style={[styles.quantityLabel, { color: theme.textSecondary }]}>{t('qty', locale)}:</Text>
                  <View style={styles.quantityControls}>
                    <TouchableOpacity
                      style={[styles.qtyButton, { backgroundColor: theme.backgroundTertiary }]}
                      onPress={() => setQuantity(String(Math.max(1, parseInt(quantity) - 1)))}
                    >
                      <Ionicons name="remove" size={20} color={theme.text} />
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.quantityInput, { backgroundColor: theme.input, color: theme.text, borderColor: theme.inputBorder }]}
                      value={quantity}
                      onChangeText={setQuantity}
                      keyboardType="numeric"
                      textAlign="center"
                    />
                    <TouchableOpacity
                      style={[styles.qtyButton, { backgroundColor: theme.backgroundTertiary }]}
                      onPress={() => setQuantity(String(parseInt(quantity) + 1))}
                    >
                      <Ionicons name="add" size={20} color={theme.text} />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.addItemButton, { backgroundColor: theme.primary }]}
                  onPress={handleAddItem}
                >
                  <Ionicons name="cart" size={20} color="#fff" />
                  <Text style={styles.addItemButtonText}>
                    {t('addToInvoice', locale)} - ${(selectedItem.retailPrice * (parseInt(quantity) || 1)).toFixed(2)}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Checkout Modal */}
      <Modal visible={showCheckout} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.checkoutModal, { backgroundColor: theme.surface }]}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{t('closeInvoice', locale)}</Text>
              <TouchableOpacity onPress={() => setShowCheckout(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.checkoutDetails}>
              <View style={[styles.checkoutRow, isRtl && styles.rowReverse]}>
                <Text style={[styles.checkoutLabel, { color: theme.textSecondary }]}>{t('itemsSold', locale)}</Text>
                <Text style={[styles.checkoutValue, { color: theme.text }]}>{itemCount}</Text>
              </View>
              <View style={[styles.checkoutRow, isRtl && styles.rowReverse]}>
                <Text style={[styles.checkoutLabel, { color: theme.textSecondary }]}>{t('invoiceTotal', locale)}</Text>
                <View style={{ alignItems: isRtl ? 'flex-start' : 'flex-end' }}>
                  <Text style={[styles.checkoutTotal, { color: theme.primary }]}>
                    ${invoiceTotal.toFixed(2)}
                  </Text>
                  <Text style={[styles.checkoutTotalSdg, { color: theme.success }]}>
                    {invoiceTotalSdg.toLocaleString()} SDG
                  </Text>
                </View>
              </View>

              {/* Payment Method */}
              <Text style={[styles.paymentMethodLabel, { color: theme.text }, isRtl && styles.textRtl]}>
                {locale === 'ar' ? 'طريقة الدفع' : 'Payment Method'}
              </Text>
              <View style={[styles.paymentMethods, isRtl && styles.rowReverse]}>
                {(['CASH', 'CARD', 'MIXED'] as const).map((method) => (
                  <TouchableOpacity
                    key={method}
                    style={[
                      styles.paymentMethodBtn,
                      { 
                        backgroundColor: paymentMethod === method ? theme.primary : theme.backgroundTertiary,
                        borderColor: paymentMethod === method ? theme.primary : theme.border,
                      }
                    ]}
                    onPress={() => setPaymentMethod(method)}
                  >
                    <Ionicons 
                      name={method === 'CASH' ? 'cash' : method === 'CARD' ? 'card' : 'wallet'} 
                      size={18} 
                      color={paymentMethod === method ? '#fff' : theme.textSecondary} 
                    />
                    <Text style={{ color: paymentMethod === method ? '#fff' : theme.textSecondary, fontSize: 12, marginTop: 4 }}>
                      {method === 'CASH' ? (locale === 'ar' ? 'نقدي' : 'Cash') : 
                       method === 'CARD' ? (locale === 'ar' ? 'بطاقة' : 'Card') : 
                       (locale === 'ar' ? 'مختلط' : 'Mixed')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Cash Input */}
              {(paymentMethod === 'CASH' || paymentMethod === 'MIXED') && (
                <View style={styles.cashInputSection}>
                  <Text style={[styles.cashLabel, { color: theme.text }, isRtl && styles.textRtl]}>
                    {locale === 'ar' ? 'المبلغ النقدي (SDG)' : 'Cash Amount (SDG)'}
                  </Text>
                  <TextInput
                    style={[styles.cashInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                    value={cashReceived}
                    onChangeText={setCashReceived}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={theme.inputPlaceholder}
                  />
                </View>
              )}

              {/* Card Input */}
              {(paymentMethod === 'CARD' || paymentMethod === 'MIXED') && (
                <View style={styles.cashInputSection}>
                  <Text style={[styles.cashLabel, { color: theme.text }, isRtl && styles.textRtl]}>
                    {locale === 'ar' ? 'مبلغ البطاقة (SDG)' : 'Card Amount (SDG)'}
                  </Text>
                  <TextInput
                    style={[styles.cashInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                    value={cardReceived}
                    onChangeText={setCardReceived}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={theme.inputPlaceholder}
                  />
                </View>
              )}

              {changeAmount >= 0 && (parseFloat(cashReceived) > 0 || parseFloat(cardReceived) > 0) && (
                <View style={[styles.changeRow, { backgroundColor: theme.successBackground }, isRtl && styles.rowReverse]}>
                  <Text style={[styles.changeLabel, { color: theme.success }]}>{t('changeAmount', locale)}</Text>
                  <Text style={[styles.changeValue, { color: theme.success }]}>
                    {changeAmount.toLocaleString()} SDG
                  </Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.confirmButton, { backgroundColor: theme.success }]}
              onPress={handleConfirmCheckout}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={22} color="#fff" />
                  <Text style={styles.confirmButtonText}>{t('confirm', locale)}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {lastInvoice && (
        <InvoicePreview
          visible={showPreview}
          onClose={() => {
            setShowPreview(false);
            setInvoiceItems([]);
            setCashReceived('');
            setCardReceived('');
            loadInitialData();
          }}
          invoice={lastInvoice}
          options={{ locale: locale as 'en' | 'ar', includePaymentDetails: true }}
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
  loadingText: {
    marginTop: 16,
    fontSize: 14,
  },
  warningTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  warningText: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  statsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statsRowRtl: {
    flexDirection: 'row-reverse',
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  statSubValue: {
    fontSize: 12,
    marginTop: 2,
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  rateInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  rateText: {
    fontSize: 13,
    fontWeight: '500',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  invoiceSection: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  invoiceTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  clearText: {
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
  },
  itemsList: {
    flex: 1,
  },
  invoiceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
  },
  itemDetails: {
    fontSize: 12,
    marginTop: 2,
  },
  itemSku: {
    fontSize: 10,
    marginTop: 2,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 24,
    textAlign: 'center',
  },
  itemTotals: {
    alignItems: 'flex-end',
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemTotalSdg: {
    fontSize: 11,
  },
  removeButton: {
    padding: 4,
  },
  checkoutSection: {
    padding: 16,
    borderTopWidth: 1,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: '700',
  },
  totalAmountSdg: {
    fontSize: 13,
  },
  checkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  checkoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    height: 44,
    marginLeft: 8,
    fontSize: 16,
  },
  itemPickerList: {
    maxHeight: 300,
  },
  emptyList: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyListText: {
    marginTop: 12,
    fontSize: 14,
  },
  pickableItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  pickableItemName: {
    fontSize: 15,
    fontWeight: '500',
  },
  pickableItemSku: {
    fontSize: 12,
    marginTop: 2,
  },
  pickableItemPrice: {
    fontSize: 16,
    fontWeight: '600',
  },
  pickableItemPriceSdg: {
    fontSize: 11,
    marginTop: 2,
  },
  quantitySection: {
    padding: 16,
    borderTopWidth: 1,
  },
  selectedItemInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  selectedItemName: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectedItemPrice: {
    fontSize: 16,
    fontWeight: '600',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  quantityLabel: {
    fontSize: 14,
    marginRight: 12,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityInput: {
    width: 60,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 18,
    fontWeight: '600',
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  addItemButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  checkoutModal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    maxHeight: '80%',
  },
  checkoutDetails: {
    paddingVertical: 16,
  },
  checkoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  checkoutLabel: {
    fontSize: 14,
  },
  checkoutValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  checkoutTotal: {
    fontSize: 24,
    fontWeight: '700',
  },
  checkoutTotalSdg: {
    fontSize: 16,
    fontWeight: '600',
  },
  paymentMethodLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 12,
  },
  paymentMethods: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  paymentMethodBtn: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  cashInputSection: {
    marginTop: 8,
  },
  cashLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  cashInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  changeLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  changeValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  textRtl: {
    textAlign: 'right',
  },
});
