import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '@/stores/theme';
import { useLocaleStore } from '@/stores/locale';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';

interface Batch {
  id: string;
  batchNumber: string;
  quantity: number;
  expiryDate?: string;
  daysUntilExpiry?: number;
}

interface InventoryItem {
  id: string;
  name: string;
  nameAr?: string;
  sku?: string;
  wholesalePrice: number;
  retailPrice: number;
  unit?: string;
  stock?: number;
  batches?: Batch[];
  nearestExpiryDays?: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (item: InventoryItem, quantity: number, priceType: 'wholesale' | 'retail') => void;
  priceType?: 'wholesale' | 'retail';
  shelfId?: string;
  warehouseId?: string;
  skipStockValidation?: boolean; // For procurement - we're buying, not selling
}

export default function InvoiceItemPicker({ visible, onClose, onSelect, priceType = 'wholesale', shelfId, warehouseId, skipStockValidation = false }: Props) {
  const { theme } = useThemeStore();
  const { locale } = useLocaleStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [stockError, setStockError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && user?.branchId) {
      loadItems();
    }
  }, [visible, user?.branchId, shelfId, warehouseId]);

  const loadItems = async () => {
    if (!user?.branchId) return;
    
    setLoading(true);
    try {
      // Get items with prices
      const itemsWithPrices = await api.inventory.itemsWithPrices(user.branchId);
      
      // Get stock data if shelfId or warehouseId is provided
      const stockMap = new Map<string, number>();
      
      const batchMap = new Map<string, Batch[]>();
      
      if (shelfId) {
        try {
          const shelfStock = await api.inventory.stockManagement.getShelfStock(shelfId, { pageSize: 100 });
          const stockData = shelfStock?.data || shelfStock || [];
          stockData.forEach((s: any) => {
            const itemId = s.item?.id || s.itemId;
            if (itemId) {
              stockMap.set(itemId, Number(s.totalQty) || 0);
              
              // Process batch data with expiry
              if (s.batches && Array.isArray(s.batches)) {
                const batches = s.batches.map((b: any) => {
                  const expiryDate = b.expiryDate ? new Date(b.expiryDate) : null;
                  const daysUntilExpiry = expiryDate 
                    ? Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : null;
                  return {
                    id: b.id,
                    batchNumber: b.batchNumber || 'N/A',
                    quantity: Number(b.quantity) || 0,
                    expiryDate: b.expiryDate,
                    daysUntilExpiry,
                  };
                }).sort((a: Batch, b: Batch) => 
                  (a.daysUntilExpiry || 9999) - (b.daysUntilExpiry || 9999)
                );
                batchMap.set(itemId, batches);
              }
            }
          });
        } catch (e) {
          console.warn('Failed to load shelf stock:', e);
        }
      } else if (warehouseId) {
        try {
          const warehouseStock = await api.inventory.stockManagement.getWarehouseStock(warehouseId, { pageSize: 100 });
          const stockData = warehouseStock?.data || warehouseStock || [];
          stockData.forEach((s: any) => {
            const itemId = s.item?.id || s.itemId;
            if (itemId) {
              stockMap.set(itemId, Number(s.totalQty) || 0);
              
              // Process batch data with expiry
              if (s.batches && Array.isArray(s.batches)) {
                const batches = s.batches.map((b: any) => {
                  const expiryDate = b.expiryDate ? new Date(b.expiryDate) : null;
                  const daysUntilExpiry = expiryDate 
                    ? Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : null;
                  return {
                    id: b.id,
                    batchNumber: b.batchNumber || 'N/A',
                    quantity: Number(b.quantity) || 0,
                    expiryDate: b.expiryDate,
                    daysUntilExpiry,
                  };
                }).sort((a: Batch, b: Batch) => 
                  (a.daysUntilExpiry || 9999) - (b.daysUntilExpiry || 9999)
                );
                batchMap.set(itemId, batches);
              }
            }
          });
        } catch (e) {
          console.warn('Failed to load warehouse stock:', e);
        }
      }
      
      // Merge stock info with items
      const itemsWithStock = itemsWithPrices.map((item: any) => {
        const batches = batchMap.get(item.id) || [];
        const nearestExpiryDays = batches.length > 0 && batches[0].daysUntilExpiry !== null
          ? batches[0].daysUntilExpiry
          : undefined;
        return {
          ...item,
          stock: stockMap.get(item.id) || 0,
          batches,
          nearestExpiryDays,
        };
      });
      
      setItems(itemsWithStock);
    } catch (error) {
      console.error('Failed to load items:', error);
      // Fallback to basic items if price fetching fails
      try {
        const basicResult = await api.inventory.items();
        const basicItems = basicResult?.data || basicResult || [];
        setItems(basicItems.map((item: any) => ({
          id: item.id,
          name: item.nameEn || item.name,
          nameAr: item.nameAr,
          sku: item.sku,
          wholesalePrice: 0,
          retailPrice: 0,
          unit: item.unit?.symbol || item.unit?.name,
          stock: 0,
        })));
      } catch {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.nameAr?.toLowerCase().includes(query) ||
      item.sku?.toLowerCase().includes(query)
    );
  });

  const validateStock = (item: InventoryItem, qty: number): boolean => {
    // Skip stock validation for procurement (we're buying, not selling)
    if (skipStockValidation) {
      if (qty <= 0) {
        setStockError(isRtl ? 'الكمية يجب أن تكون أكبر من صفر' : 'Quantity must be greater than zero');
        return false;
      }
      setStockError(null);
      return true;
    }
    
    const availableStock = item.stock || 0;
    
    if (qty <= 0) {
      setStockError(isRtl ? 'الكمية يجب أن تكون أكبر من صفر' : 'Quantity must be greater than zero');
      return false;
    }
    
    if (qty > availableStock) {
      setStockError(
        isRtl 
          ? `المخزون غير كافي. المتاح: ${availableStock}` 
          : `Insufficient stock. Available: ${availableStock}`
      );
      return false;
    }
    
    setStockError(null);
    return true;
  };

  const handleSelect = () => {
    if (!selectedItem) return;
    
    const qty = parseInt(quantity) || 0;
    
    // Validate stock before adding
    if (!validateStock(selectedItem, qty)) {
      return;
    }
    
    onSelect(selectedItem, qty, priceType);
    setSelectedItem(null);
    setQuantity('1');
    setStockError(null);
    onClose();
  };

  // Update stock error when quantity changes
  useEffect(() => {
    if (selectedItem && quantity) {
      const qty = parseInt(quantity) || 0;
      if (qty > 0) {
        validateStock(selectedItem, qty);
      } else {
        setStockError(null);
      }
    } else {
      setStockError(null);
    }
  }, [quantity, selectedItem]);

  const getItemPrice = (item: InventoryItem) => {
    return priceType === 'wholesale' ? item.wholesalePrice : item.retailPrice;
  };

  const getExpiryColor = (daysUntilExpiry: number | undefined): string => {
    if (daysUntilExpiry === undefined) return theme.textMuted;
    if (daysUntilExpiry <= 0) return '#dc2626'; // Expired - red
    if (daysUntilExpiry <= 30) return '#ea580c'; // <30 days - orange
    if (daysUntilExpiry <= 90) return '#eab308'; // <90 days - yellow
    return '#22c55e'; // >90 days - green
  };

  const getExpiryLabel = (daysUntilExpiry: number | undefined): string => {
    if (daysUntilExpiry === undefined) return '';
    if (daysUntilExpiry <= 0) {
      return isRtl ? '⚠️ منتهي الصلاحية' : '⚠️ Expired';
    }
    if (daysUntilExpiry <= 7) {
      return isRtl ? `⚠️ ينتهي خلال ${daysUntilExpiry} أيام` : `⚠️ Expires in ${daysUntilExpiry}d`;
    }
    if (daysUntilExpiry <= 30) {
      return isRtl ? `ينتهي خلال ${daysUntilExpiry} يوم` : `Expires in ${daysUntilExpiry}d`;
    }
    return '';
  };

  const renderItem = ({ item }: { item: InventoryItem }) => {
    const isSelected = selectedItem?.id === item.id;
    const price = getItemPrice(item);
    // Only show expiry warnings for sales (not procurement)
    const expiryWarning = skipStockValidation ? null : getExpiryLabel(item.nearestExpiryDays);
    const isNearExpiry = !skipStockValidation && item.nearestExpiryDays !== undefined && item.nearestExpiryDays <= 30;
    
    return (
      <TouchableOpacity
        style={[
          styles.itemCard,
          { 
            backgroundColor: isSelected ? theme.primaryBackground : theme.card,
            borderColor: isSelected ? theme.primary : isNearExpiry ? getExpiryColor(item.nearestExpiryDays) : theme.cardBorder,
          },
          isRtl && styles.itemCardRtl,
        ]}
        onPress={() => setSelectedItem(item)}
      >
        <View style={[styles.itemIcon, isNearExpiry && { backgroundColor: `${getExpiryColor(item.nearestExpiryDays)}15` }]}>
          <Ionicons 
            name={isNearExpiry ? "warning" : "cube"} 
            size={24} 
            color={isNearExpiry ? getExpiryColor(item.nearestExpiryDays) : theme.primary} 
          />
        </View>
        <View style={[styles.itemContent, isRtl && styles.itemContentRtl]}>
          <Text style={[styles.itemName, { color: theme.text }, isRtl && styles.textRtl]}>
            {isRtl ? (item.nameAr || item.name) : item.name}
          </Text>
          <Text style={[styles.itemSku, { color: theme.textMuted }]}>
            {item.sku || 'No SKU'}
          </Text>
          {expiryWarning && (
            <Text style={[styles.expiryWarning, { color: getExpiryColor(item.nearestExpiryDays) }]}>
              {expiryWarning}
            </Text>
          )}
        </View>
        <View style={[styles.itemPrice, isRtl && styles.itemPriceRtl]}>
          <Text style={[styles.priceValue, { color: theme.success }]}>
            ${price.toFixed(2)}
          </Text>
          {/* Only show stock count for sales, not for procurement */}
          {!skipStockValidation && (
            <Text style={[styles.stockText, { color: theme.textMuted }]}>
              {item.stock || 0} {item.unit || t('items', locale)}
            </Text>
          )}
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={24} color={theme.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {t('selectItem', locale)}
          </Text>
          <View style={styles.closeButton} />
        </View>

        {/* Search */}
        <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
          <View style={[styles.searchBar, { backgroundColor: theme.input, borderColor: theme.inputBorder }]}>
            <Ionicons name="search" size={20} color={theme.inputPlaceholder} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }, isRtl && styles.textRtl]}
              placeholder={t('search', locale)}
              placeholderTextColor={theme.inputPlaceholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              textAlign={isRtl ? 'right' : 'left'}
            />
          </View>
        </View>

        {/* Items List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="cube-outline" size={48} color={theme.textMuted} />
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                  {t('noData', locale)}
                </Text>
              </View>
            }
          />
        )}

        {/* Quantity Input & Add Button */}
        {selectedItem && (
          <View style={[styles.footer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {/* Stock info - hide for procurement */}
            {!skipStockValidation && (
              <View style={[styles.stockInfoSection, { borderColor: theme.border }]}>
                <View style={styles.stockInfoRow}>
                  <Text style={[styles.stockInfoLabel, { color: theme.textSecondary }]}>
                    {isRtl ? 'المخزون المتاح:' : 'Available Stock:'}
                  </Text>
                  <Text style={[
                    styles.stockInfoValue, 
                    { color: (selectedItem.stock || 0) > 0 ? theme.success : theme.danger }
                  ]}>
                    {selectedItem.stock || 0} {selectedItem.unit || (isRtl ? 'وحدة' : 'units')}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.quantitySection}>
              <Text style={[styles.footerLabel, { color: theme.textSecondary }]}>
                {t('quantity', locale)}:
              </Text>
              <View style={styles.quantityControls}>
                <TouchableOpacity
                  style={[styles.quantityButton, { backgroundColor: theme.backgroundTertiary }]}
                  onPress={() => setQuantity(Math.max(1, parseInt(quantity) - 1).toString())}
                >
                  <Ionicons name="remove" size={20} color={theme.text} />
                </TouchableOpacity>
                <TextInput
                  style={[
                    styles.quantityInput, 
                    { 
                      backgroundColor: theme.input, 
                      color: theme.text, 
                      borderColor: stockError ? theme.danger : theme.inputBorder 
                    }
                  ]}
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="numeric"
                  textAlign="center"
                />
                <TouchableOpacity
                  style={[styles.quantityButton, { backgroundColor: theme.backgroundTertiary }]}
                  onPress={() => setQuantity((parseInt(quantity) + 1).toString())}
                >
                  <Ionicons name="add" size={20} color={theme.text} />
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Stock error message */}
            {stockError && (
              <View style={styles.errorContainer}>
                <Ionicons name="warning" size={16} color={theme.danger} />
                <Text style={[styles.errorText, { color: theme.danger }]}>
                  {stockError}
                </Text>
              </View>
            )}
            
            {/* Expiry warning for selected item - only for sales, not procurement */}
            {!skipStockValidation && !stockError && selectedItem?.nearestExpiryDays !== undefined && selectedItem.nearestExpiryDays <= 30 && (
              <View style={[
                styles.expiryWarningContainer, 
                { backgroundColor: selectedItem.nearestExpiryDays <= 0 ? '#fee2e2' : '#fef3c7' }
              ]}>
                <Ionicons 
                  name={selectedItem.nearestExpiryDays <= 0 ? "alert-circle" : "time-outline"} 
                  size={16} 
                  color={getExpiryColor(selectedItem.nearestExpiryDays)} 
                />
                <Text style={[styles.expiryWarningText, { color: getExpiryColor(selectedItem.nearestExpiryDays) }]}>
                  {selectedItem.nearestExpiryDays <= 0 
                    ? (isRtl ? 'تحذير: هذا المنتج منتهي الصلاحية!' : 'Warning: This product is expired!')
                    : (isRtl 
                        ? `تحذير: أقرب تاريخ انتهاء خلال ${selectedItem.nearestExpiryDays} يوم` 
                        : `Warning: Nearest expiry in ${selectedItem.nearestExpiryDays} days`)
                  }
                </Text>
              </View>
            )}
            
            <TouchableOpacity
              style={[
                styles.addButton, 
                { backgroundColor: stockError ? theme.textMuted : theme.primary }
              ]}
              onPress={handleSelect}
              disabled={!!stockError}
            >
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.addButtonText}>
                {t('addItem', locale)} - ${(getItemPrice(selectedItem) * parseInt(quantity || '0')).toFixed(2)}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
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
  listContent: {
    padding: 16,
    paddingBottom: 200,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 12,
  },
  itemCardRtl: {
    flexDirection: 'row-reverse',
  },
  itemIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#6366f110',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemContent: {
    flex: 1,
    marginLeft: 12,
  },
  itemContentRtl: {
    marginLeft: 0,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemSku: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  itemPrice: {
    alignItems: 'flex-end',
    marginRight: 12,
  },
  itemPriceRtl: {
    alignItems: 'flex-start',
    marginRight: 0,
    marginLeft: 12,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  stockText: {
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
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    borderTopWidth: 1,
    paddingBottom: 40,
  },
  quantitySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  footerLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityButton: {
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
    fontSize: 16,
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  stockInfoSection: {
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
  },
  stockInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockInfoLabel: {
    fontSize: 14,
  },
  stockInfoValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  expiryWarning: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  expiryWarningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  expiryWarningText: {
    fontSize: 13,
    flex: 1,
    fontWeight: '500',
  },
});

