import { useState, useEffect, useCallback } from 'react';
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
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api, uploadReceipt, getFullUrl } from '@/lib/api';
import {
  Invoice,
  InvoiceItem as InvoiceItemType,
  generateInvoiceNumber,
} from '@/lib/invoice';
import InvoicePreview from '@/components/InvoicePreview';

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
  const showUsd = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  // Draft from server
  const [draft, setDraft] = useState<any>(null);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<AvailableItem | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [showCheckout, setShowCheckout] = useState(false);

  // Checkout fields
  const [cashReceived, setCashReceived] = useState('');
  const [cardReceived, setCardReceived] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'MIXED'>('CASH');
  const [transactionNumber, setTransactionNumber] = useState('');
  const [receiptImages, setReceiptImages] = useState<string[]>([]); // local URIs before upload
  const [uploadingImages, setUploadingImages] = useState(false);

  // Backend data
  const [availableItems, setAvailableItems] = useState<AvailableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(600);
  const [dayCycle, setDayCycle] = useState<any>(null);
  const [shelfId, setShelfId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null);

  const draftLines: any[] = draft?.lines || [];
  const invoiceTotal = draftLines.reduce((sum: number, line: any) => sum + (Number(line.unitPriceUsd) * line.qty), 0);
  const invoiceTotalSdg = invoiceTotal * exchangeRate;
  const itemCount = draftLines.reduce((sum: number, line: any) => sum + line.qty, 0);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      if (!user) return;

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

      const assignedShelf = (user as any)?.shelf;
      if (assignedShelf) {
        setShelfId(assignedShelf.id);
        // Load server-side draft
        const draftData = await api.sales.dailyInvoiceDraft.getOrCreate(assignedShelf.id);
        setDraft(draftData);
        await loadAvailableItems(assignedShelf.id);
      } else {
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
  }, [user, locale]);

  useEffect(() => {
    loadInitialData();
  }, [user]);

  const refreshDraft = async (currentShelfId?: string) => {
    const sid = currentShelfId || shelfId;
    if (!sid) return;
    const draftData = await api.sales.dailyInvoiceDraft.getOrCreate(sid);
    setDraft(draftData);
  };

  const loadAvailableItems = async (currentShelfId?: string) => {
    try {
      if (!user) return;
      const shelfToUse = currentShelfId || shelfId;
      if (!shelfToUse) return;

      const stockResult = await api.inventory.stockManagement.getShelfStock(shelfToUse, { pageSize: 100 });
      const stockData = stockResult?.data || stockResult || [];
      const itemsWithPrices = await api.inventory.itemsWithPrices(user.branchId);

      const stockMap = new Map<string, { totalStock: number; batches: any[] }>();
      for (const stockItem of stockData) {
        const itemId = stockItem.item?.id || stockItem.itemId;
        if (!itemId) continue;
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
          stockMap.set(itemId, { totalStock: Number(stockItem.totalQty) || 0, batches });
        } catch {
          stockMap.set(itemId, { totalStock: Number(stockItem.totalQty) || 0, batches: [] });
        }
      }

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
      setAvailableItems(items.filter(item => item.totalStock > 0));
    } catch (error) {
      console.error('Failed to load items:', error);
      setAvailableItems([]);
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

  const handleSelectItem = (item: AvailableItem) => {
    if (item.totalStock <= 0) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'هذا المنتج غير متوفر في المخزون' : 'This item is out of stock');
      return;
    }
    setSelectedItem(item);
    setQuantity('1');
  };

  const getAddedQuantity = (itemId: string): number => {
    return draftLines
      .filter((line: any) => line.itemId === itemId)
      .reduce((sum: number, line: any) => sum + line.qty, 0);
  };

  const getAvailableStock = (item: AvailableItem): number => {
    return item.totalStock - getAddedQuantity(item.id);
  };

  const handleAddItem = async () => {
    if (!selectedItem || !shelfId) return;

    const qty = parseInt(quantity) || 1;
    if (qty <= 0) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'الكمية يجب أن تكون أكبر من صفر' : 'Quantity must be greater than 0');
      return;
    }

    const availableStock = getAvailableStock(selectedItem);
    if (qty > availableStock) {
      Alert.alert(t('error', locale), locale === 'ar' ? `الكمية المتوفرة: ${availableStock} فقط` : `Only ${availableStock} available in stock`);
      return;
    }

    // Warn near-expiry
    const nearExpiryBatches = selectedItem.batches.filter(b => {
      if (!b.expiryDate) return false;
      const days = Math.floor((new Date(b.expiryDate).getTime() - Date.now()) / 86400000);
      return days <= 30;
    });
    if (nearExpiryBatches.length > 0) {
      Alert.alert(locale === 'ar' ? 'تحذير' : 'Warning', locale === 'ar' ? 'تحذير: بعض الدفعات قريبة من تاريخ الانتهاء' : 'Warning: Some batches are near expiry');
    }

    try {
      setSaving(true);
      await api.sales.dailyInvoiceDraft.addLine({
        shelfId,
        itemId: selectedItem.id,
        qty,
        unitPriceUsd: selectedItem.retailPrice,
        batchId: selectedItem.batches[0]?.id,
      });
      await refreshDraft();
      setSelectedItem(null);
      setQuantity('1');
      setShowItemPicker(false);
    } catch (error: any) {
      Alert.alert(t('error', locale), error.message || 'Failed to add item');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveItem = async (lineId: string) => {
    try {
      await api.sales.dailyInvoiceDraft.removeLine(lineId);
      await refreshDraft();
    } catch (error: any) {
      Alert.alert(t('error', locale), error.message || 'Failed to remove item');
    }
  };

  const handleUpdateQuantity = async (lineId: string, newQty: number) => {
    if (newQty < 1) return;
    try {
      await api.sales.dailyInvoiceDraft.updateLineQty(lineId, newQty);
      await refreshDraft();
    } catch (error: any) {
      Alert.alert(t('error', locale), error.message || 'Failed to update quantity');
    }
  };

  const handleClearDraft = async () => {
    if (!shelfId) return;
    Alert.alert(
      locale === 'ar' ? 'تأكيد' : 'Confirm',
      locale === 'ar' ? 'هل تريد مسح جميع الأصناف؟' : 'Clear all items?',
      [
        { text: locale === 'ar' ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: locale === 'ar' ? 'مسح' : 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.sales.dailyInvoiceDraft.clearDraft(shelfId);
              await refreshDraft();
            } catch (error: any) {
              Alert.alert(t('error', locale), error.message);
            }
          },
        },
      ]
    );
  };

  const handleCloseInvoice = () => {
    if (draftLines.length === 0) {
      Alert.alert(t('error', locale), t('noItemsInInvoice', locale));
      return;
    }
    setShowCheckout(true);
  };

  const pickReceiptImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets) {
      setReceiptImages(prev => [...prev, ...result.assets.map(a => a.uri)]);
    }
  };

  const removeReceiptImage = (index: number) => {
    setReceiptImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfirmCheckout = async () => {
    const cashAmount = parseFloat(cashReceived) || 0;
    const cardAmount = parseFloat(cardReceived) || 0;
    const totalReceived = cashAmount + cardAmount;

    if (totalReceived < invoiceTotalSdg) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'المبلغ المستلم أقل من الإجمالي' : 'Total received is less than invoice total');
      return;
    }

    if (!shelfId) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'لم يتم تحديد الرف' : 'Shelf not selected');
      return;
    }

    if ((paymentMethod === 'CARD' || paymentMethod === 'MIXED') && transactionNumber && !/^\d{6}$/.test(transactionNumber)) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'رقم المعاملة يجب أن يكون 6 أرقام' : 'Transaction number must be exactly 6 digits');
      return;
    }

    setSaving(true);
    setUploadingImages(true);

    try {
      // Upload receipt images
      let uploadedUrls: string[] = [];
      if (receiptImages.length > 0) {
        for (const uri of receiptImages) {
          const url = await uploadReceipt(uri);
          uploadedUrls.push(url);
        }
      }
      setUploadingImages(false);

      const mappedPaymentMethod = paymentMethod === 'CARD' ? 'BANK_TRANSFER' : paymentMethod as 'CASH' | 'MIXED';

      await api.sales.dailyInvoiceDraft.checkout({
        shelfId,
        paymentMethod: mappedPaymentMethod,
        cashAmountSdg: paymentMethod === 'CASH' ? cashAmount : paymentMethod === 'MIXED' ? cashAmount : 0,
        cardAmountSdg: paymentMethod === 'CARD' ? cardAmount : paymentMethod === 'MIXED' ? cardAmount : 0,
        transactionNumber: transactionNumber || undefined,
        receiptImageUrls: uploadedUrls,
      });

      // Build invoice for preview
      const builtInvoice: Invoice = {
        invoiceNumber: generateInvoiceNumber('SALES'),
        invoiceType: 'SALES',
        invoiceCategory: 'RETAIL',
        invoiceDate: new Date().toISOString(),
        branchId: user?.branchId || '',
        items: draftLines.map((line: any) => ({
          id: line.id,
          itemId: line.itemId,
          name: isRtl ? (line.item?.nameAr || line.item?.nameEn || '') : (line.item?.nameEn || ''),
          nameAr: line.item?.nameAr || line.item?.nameEn || '',
          sku: line.item?.sku || '',
          quantity: line.qty,
          unitPrice: Number(line.unitPriceUsd),
          unitPriceSdg: Number(line.unitPriceUsd) * exchangeRate,
          total: Number(line.unitPriceUsd) * line.qty,
          totalSdg: Number(line.unitPriceUsd) * line.qty * exchangeRate,
          unit: line.item?.unit?.nameEn || 'unit',
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
        paymentMethod: mappedPaymentMethod === 'MIXED' ? 'MIXED' : mappedPaymentMethod === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'CASH',
        amountPaid: invoiceTotal,
        amountPaidSdg: invoiceTotalSdg,
        amountDue: 0,
        amountDueSdg: 0,
        notes: '',
        createdAt: new Date().toISOString(),
      };

      setLastInvoice(builtInvoice);
      setShowCheckout(false);

      Alert.alert(
        t('success', locale),
        t('invoiceClosed', locale),
        [
          {
            text: locale === 'ar' ? 'معاينة الفاتورة' : 'View Invoice',
            onPress: () => setShowPreview(true),
          },
          {
            text: 'OK',
            onPress: () => {
              setCashReceived('');
              setCardReceived('');
              setTransactionNumber('');
              setReceiptImages([]);
              setPaymentMethod('CASH');
              refreshDraft();
            },
          },
        ]
      );
    } catch (error: any) {
      setUploadingImages(false);
      const msg: string = error.message || '';
      if (msg.startsWith('DUPLICATE_TXN:')) {
        const systemId = msg.split(':')[1];
        Alert.alert(
          locale === 'ar' ? 'رقم معاملة مكرر' : 'Duplicate Transaction Number',
          (locale === 'ar'
            ? `رقم المعاملة مستخدم مسبقاً. معرّف النظام: ${systemId}`
            : `This transaction number already exists. System ID: ${systemId}`)
        );
      } else {
        Alert.alert(t('error', locale), msg || (locale === 'ar' ? 'فشل في حفظ الفاتورة' : 'Failed to save invoice'));
      }
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
            {invoiceTotalSdg.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
          </Text>
          {showUsd && (
            <Text style={[styles.statSubValue, { color: theme.textSecondary }]}>
              ${invoiceTotal.toFixed(2)}
            </Text>
          )}
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('invoiceTotal', locale)}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.successBackground }]}>
          <Text style={[styles.statValue, { color: theme.success }]}>{itemCount}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{t('itemsSold', locale)}</Text>
        </View>
      </View>

      {/* Exchange Rate Info - admin/manager only */}
      {showUsd && (
        <View style={[styles.rateInfo, { backgroundColor: theme.infoBackground }]}>
          <Ionicons name="trending-up" size={16} color={theme.info} />
          <Text style={[styles.rateText, { color: theme.info }]}>
            1 USD = {exchangeRate.toLocaleString()} SDG
          </Text>
        </View>
      )}

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
          {draftLines.length > 0 && (
            <TouchableOpacity onPress={handleClearDraft}>
              <Text style={[styles.clearText, { color: theme.error }]}>
                {locale === 'ar' ? 'مسح الكل' : 'Clear All'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {draftLines.length === 0 ? (
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
            {draftLines.map((line: any) => {
              const linePriceSdg = Number(line.unitPriceUsd) * exchangeRate;
              const lineTotalSdg = linePriceSdg * line.qty;
              const itemName = isRtl
                ? (line.item?.nameAr || line.item?.nameEn || '')
                : (line.item?.nameEn || '');
              return (
                <View
                  key={line.id}
                  style={[styles.invoiceItem, { borderBottomColor: theme.border }, isRtl && styles.rowReverse]}
                >
                  <View style={[styles.itemInfo, isRtl && { alignItems: 'flex-end' }]}>
                    <Text style={[styles.itemName, { color: theme.text }]}>{itemName}</Text>
                    <Text style={[styles.itemDetails, { color: theme.textSecondary }]}>
                      {showUsd
                        ? `$${Number(line.unitPriceUsd).toFixed(2)} × ${line.qty}`
                        : `${linePriceSdg.toLocaleString()} ${locale === 'ar' ? 'ج.س' : 'SDG'} × ${line.qty}`}
                    </Text>
                    <Text style={[styles.itemSku, { color: theme.textMuted }]}>
                      {line.item?.sku || ''}
                    </Text>
                  </View>
                  <View style={[styles.itemActions, isRtl && styles.rowReverse]}>
                    <View style={styles.qtyControls}>
                      <TouchableOpacity
                        style={[styles.qtyBtn, { backgroundColor: theme.backgroundTertiary }]}
                        onPress={() => handleUpdateQuantity(line.id, line.qty - 1)}
                      >
                        <Ionicons name="remove" size={16} color={theme.text} />
                      </TouchableOpacity>
                      <Text style={[styles.qtyText, { color: theme.text }]}>{line.qty}</Text>
                      <TouchableOpacity
                        style={[styles.qtyBtn, { backgroundColor: theme.backgroundTertiary }]}
                        onPress={() => handleUpdateQuantity(line.id, line.qty + 1)}
                      >
                        <Ionicons name="add" size={16} color={theme.text} />
                      </TouchableOpacity>
                    </View>
                    <View style={[styles.itemTotals, isRtl && { alignItems: 'flex-start' }]}>
                      <Text style={[styles.itemTotalSdg, { color: theme.primary }]}>
                        {lineTotalSdg.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
                      </Text>
                      {showUsd && (
                        <Text style={[styles.itemTotal, { color: theme.textMuted }]}>
                          ${(Number(line.unitPriceUsd) * line.qty).toFixed(2)}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemoveItem(line.id)}
                      style={styles.removeButton}
                    >
                      <Ionicons name="close-circle" size={22} color={theme.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Invoice Total & Checkout */}
        {draftLines.length > 0 && (
          <View style={[styles.checkoutSection, { borderTopColor: theme.border }]}>
            <View style={[styles.totalRow, isRtl && styles.rowReverse]}>
              <Text style={[styles.totalLabel, { color: theme.text }]}>{t('total', locale)}</Text>
              <View style={{ alignItems: isRtl ? 'flex-start' : 'flex-end' }}>
                <Text style={[styles.totalAmount, { color: theme.primary }]}>
                  {invoiceTotalSdg.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
                </Text>
                {showUsd && (
                  <Text style={[styles.totalAmountSdg, { color: theme.textSecondary }]}>
                    ${invoiceTotal.toFixed(2)}
                  </Text>
                )}
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
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={40}>
          <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{t('selectItem', locale)}</Text>
              <TouchableOpacity onPress={() => setShowItemPicker(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

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
                    <Text style={[styles.pickableItemPriceSdg, { color: theme.primary }]}>
                      {(item.retailPrice * exchangeRate).toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
                    </Text>
                    {showUsd && (
                      <Text style={[styles.pickableItemPrice, { color: theme.textMuted }]}>
                        ${item.retailPrice.toFixed(2)}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
            />

            {selectedItem && (
              <View style={[styles.quantitySection, { borderTopColor: theme.border, backgroundColor: theme.backgroundSecondary }]}>
                <View style={[styles.selectedItemInfo, isRtl && styles.rowReverse]}>
                  <Text style={[styles.selectedItemName, { color: theme.text }]}>
                    {isRtl ? selectedItem.nameAr : selectedItem.name}
                  </Text>
                  <Text style={[styles.selectedItemPrice, { color: theme.primary }]}>
                    {showUsd
                      ? `$${selectedItem.retailPrice.toFixed(2)}`
                      : `${(selectedItem.retailPrice * exchangeRate).toLocaleString()} ${locale === 'ar' ? 'ج.س' : 'SDG'}`}
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
                  style={[styles.addItemButton, { backgroundColor: saving ? theme.textMuted : theme.primary }]}
                  onPress={handleAddItem}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cart" size={20} color="#fff" />
                      <Text style={styles.addItemButtonText}>
                        {t('addToInvoice', locale)} - {showUsd
                          ? `$${(selectedItem.retailPrice * (parseInt(quantity) || 1)).toFixed(2)}`
                          : `${(selectedItem.retailPrice * exchangeRate * (parseInt(quantity) || 1)).toLocaleString()} ${locale === 'ar' ? 'ج.س' : 'SDG'}`}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Checkout Modal */}
      <Modal visible={showCheckout} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={40}>
          <View style={styles.modalOverlay}>
          <View style={[styles.checkoutModal, { backgroundColor: theme.surface }]}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{t('closeInvoice', locale)}</Text>
              <TouchableOpacity onPress={() => setShowCheckout(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.checkoutDetails} keyboardShouldPersistTaps="handled">
              <View style={[styles.checkoutRow, isRtl && styles.rowReverse]}>
                <Text style={[styles.checkoutLabel, { color: theme.textSecondary }]}>{t('itemsSold', locale)}</Text>
                <Text style={[styles.checkoutValue, { color: theme.text }]}>{itemCount}</Text>
              </View>
              <View style={[styles.checkoutRow, isRtl && styles.rowReverse]}>
                <Text style={[styles.checkoutLabel, { color: theme.textSecondary }]}>{t('invoiceTotal', locale)}</Text>
                <View style={{ alignItems: isRtl ? 'flex-start' : 'flex-end' }}>
                  <Text style={[styles.checkoutTotal, { color: theme.success }]}>
                    {invoiceTotalSdg.toLocaleString()} {locale === 'ar' ? 'ج.س' : 'SDG'}
                  </Text>
                  {showUsd && (
                    <Text style={[styles.checkoutTotalSdg, { color: theme.primary }]}>
                      ${invoiceTotal.toFixed(2)}
                    </Text>
                  )}
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

              {/* Card/Bank Input */}
              {(paymentMethod === 'CARD' || paymentMethod === 'MIXED') && (
                <View style={styles.cashInputSection}>
                  <Text style={[styles.cashLabel, { color: theme.text }, isRtl && styles.textRtl]}>
                    {locale === 'ar' ? 'مبلغ التحويل البنكي (SDG)' : 'Bank Transfer Amount (SDG)'}
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

              {/* Transaction Number - for bank/card */}
              {(paymentMethod === 'CARD' || paymentMethod === 'MIXED') && (
                <View style={styles.cashInputSection}>
                  <Text style={[styles.cashLabel, { color: theme.text }, isRtl && styles.textRtl]}>
                    {locale === 'ar' ? 'رقم المعاملة (6 أرقام)' : 'Transaction Number (6 digits)'}
                  </Text>
                  <TextInput
                    style={[styles.cashInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                    value={transactionNumber}
                    onChangeText={(v) => setTransactionNumber(v.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="000000"
                    placeholderTextColor={theme.inputPlaceholder}
                  />
                </View>
              )}

              {/* Receipt Images - for bank/card */}
              {(paymentMethod === 'CARD' || paymentMethod === 'MIXED') && (
                <View style={styles.cashInputSection}>
                  <Text style={[styles.cashLabel, { color: theme.text }, isRtl && styles.textRtl]}>
                    {locale === 'ar' ? 'صور الإيصال' : 'Receipt Images'}
                  </Text>
                  <ScrollView horizontal style={{ marginBottom: 8 }}>
                    {receiptImages.map((uri, idx) => (
                      <View key={idx} style={{ position: 'relative', marginRight: 8 }}>
                        <Image source={{ uri }} style={styles.receiptPreview} resizeMode="cover" />
                        <TouchableOpacity
                          style={styles.removeImageBtn}
                          onPress={() => removeReceiptImage(idx)}
                        >
                          <Ionicons name="close-circle" size={20} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={[styles.addImageBtn, { backgroundColor: theme.backgroundTertiary, borderColor: theme.border }]}
                      onPress={pickReceiptImage}
                    >
                      <Ionicons name="add" size={24} color={theme.primary} />
                      <Text style={[styles.addImageText, { color: theme.primary }]}>
                        {locale === 'ar' ? 'إضافة صورة' : 'Add'}
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>
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
                  <Text style={styles.confirmButtonText}>
                    {uploadingImages
                      ? (locale === 'ar' ? 'جاري رفع الصور...' : 'Uploading images...')
                      : t('confirm', locale)}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {lastInvoice && (
        <InvoicePreview
          visible={showPreview}
          onClose={() => {
            setShowPreview(false);
            setCashReceived('');
            setCardReceived('');
            setTransactionNumber('');
            setReceiptImages([]);
            setPaymentMethod('CASH');
            refreshDraft();
          }}
          invoice={lastInvoice}
          showUsd={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 14 },
  warningTitle: { fontSize: 20, fontWeight: '600', marginTop: 16 },
  warningText: { fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 },
  statsRow: { flexDirection: 'row', padding: 16, gap: 12 },
  statsRowRtl: { flexDirection: 'row-reverse' },
  statCard: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  statSubValue: { fontSize: 12, marginTop: 2 },
  statLabel: { fontSize: 12, marginTop: 4 },
  rateInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginBottom: 12, padding: 10, borderRadius: 8, gap: 8 },
  rateText: { fontSize: 13, fontWeight: '500' },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginBottom: 16, padding: 16, borderRadius: 12, gap: 8 },
  addButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  invoiceSection: { flex: 1, marginHorizontal: 16, marginBottom: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  invoiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  rowReverse: { flexDirection: 'row-reverse' },
  invoiceTitle: { fontSize: 16, fontWeight: '600' },
  clearText: { fontSize: 14 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 14, marginTop: 12 },
  itemsList: { flex: 1 },
  invoiceItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '500' },
  itemDetails: { fontSize: 12, marginTop: 2 },
  itemSku: { fontSize: 10, marginTop: 2 },
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  qtyText: { fontSize: 14, fontWeight: '600', minWidth: 24, textAlign: 'center' },
  itemTotals: { alignItems: 'flex-end' },
  itemTotal: { fontSize: 11, marginTop: 2 },
  itemTotalSdg: { fontSize: 14, fontWeight: '600' },
  removeButton: { padding: 4 },
  checkoutSection: { padding: 16, borderTopWidth: 1 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  totalLabel: { fontSize: 16, fontWeight: '600' },
  totalAmount: { fontSize: 22, fontWeight: '700' },
  totalAmountSdg: { fontSize: 13 },
  checkoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, gap: 8 },
  checkoutButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', margin: 16, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  searchInput: { flex: 1, height: 44, marginLeft: 8, fontSize: 16 },
  itemPickerList: { maxHeight: 300 },
  emptyList: { alignItems: 'center', paddingVertical: 40 },
  emptyListText: { marginTop: 12, fontSize: 14 },
  pickableItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, marginHorizontal: 16, marginBottom: 8, borderRadius: 12, borderWidth: 1 },
  pickableItemName: { fontSize: 15, fontWeight: '500' },
  pickableItemSku: { fontSize: 12, marginTop: 2 },
  pickableItemPrice: { fontSize: 11, marginTop: 2 },
  pickableItemPriceSdg: { fontSize: 16, fontWeight: '600' },
  quantitySection: { padding: 16, borderTopWidth: 1 },
  selectedItemInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  selectedItemName: { fontSize: 16, fontWeight: '600' },
  selectedItemPrice: { fontSize: 16, fontWeight: '600' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  quantityLabel: { fontSize: 14, marginRight: 12 },
  quantityControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyButton: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  quantityInput: { width: 60, height: 40, borderRadius: 10, borderWidth: 1, fontSize: 18, fontWeight: '600' },
  addItemButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, gap: 8 },
  addItemButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  checkoutModal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: '85%' },
  checkoutDetails: { paddingVertical: 16 },
  checkoutRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  checkoutLabel: { fontSize: 14 },
  checkoutValue: { fontSize: 14, fontWeight: '500' },
  checkoutTotal: { fontSize: 24, fontWeight: '700' },
  checkoutTotalSdg: { fontSize: 16, fontWeight: '600' },
  paymentMethodLabel: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 12 },
  paymentMethods: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  paymentMethodBtn: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1 },
  cashInputSection: { marginTop: 8 },
  cashLabel: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  cashInput: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 20, fontWeight: '600', textAlign: 'center' },
  receiptPreview: { width: 80, height: 80, borderRadius: 8 },
  removeImageBtn: { position: 'absolute', top: -6, right: -6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10 },
  addImageBtn: { width: 80, height: 80, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  addImageText: { fontSize: 10, marginTop: 2 },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderRadius: 12, marginTop: 16 },
  changeLabel: { fontSize: 16, fontWeight: '600' },
  changeValue: { fontSize: 20, fontWeight: '700' },
  confirmButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, marginTop: 16, gap: 8 },
  confirmButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  textRtl: { textAlign: 'right' },
});
