import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface BatchInfo {
  id: string;
  batchNumber: string;
  qtyRemaining: number;
  expiryDate?: string;
  unitCostUsd: number;
  receivedDate: string;
}

interface InventoryItem {
  id: string;
  sku: string;
  nameEn: string;
  nameAr: string;
  unit?: { symbol: string; name: string };
  category?: { name: string; nameAr: string };
  totalStock: number;
  batches: BatchInfo[];
}

export default function ShelfInventoryScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [shelfId, setShelfId] = useState<string | null>(null);
  const [shelfName, setShelfName] = useState<string>('');

  useEffect(() => {
    loadInitialData();
  }, [user]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      if (!user) return;

      // For SHELF_SALES users, use their assigned shelf
      if (user.role === 'SHELF_SALES' && user.shelf) {
        setShelfId(user.shelf.id);
        setShelfName(locale === 'ar' ? user.shelf.nameAr || user.shelf.name : user.shelf.name);
        
        // Load inventory for this shelf
        await loadShelfInventory(user.shelf.id);
      } else {
        // For admin/manager users, get all shelves
        const shelvesResult = await api.inventory.shelves();
        const shelves = shelvesResult || [];
        
        if (shelves.length > 0) {
          setShelfId(shelves[0].id);
          setShelfName(locale === 'ar' ? shelves[0].nameAr || shelves[0].name : shelves[0].name);
          
          // Load inventory for this shelf
          await loadShelfInventory(shelves[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadShelfInventory = async (shelfIdParam: string) => {
    try {
      // Get shelf stock with item details from backend
      const stockResult = await api.inventory.stockManagement.getShelfStock(shelfIdParam, { pageSize: 100 });
      const stockData = stockResult?.data || stockResult || [];
      
      // For each item with stock, fetch batch details
      const itemsWithBatches: InventoryItem[] = await Promise.all(
        stockData.map(async (stockItem: any) => {
          const item = stockItem.item;
          const totalQty = Number(stockItem.totalQty) || 0;
          
          // Fetch batches for this item on this shelf
          let batches: BatchInfo[] = [];
          try {
            const batchesResult = await api.inventory.stockManagement.getBatches(item.id, { shelfId: shelfIdParam });
            const batchData = batchesResult || [];
            
            batches = batchData
              .filter((b: any) => Number(b.qtyRemaining) > 0)
              .map((b: any) => ({
                id: b.id,
                batchNumber: b.batchNumber || `B-${b.id.substring(0, 8).toUpperCase()}`,
                qtyRemaining: Number(b.qtyRemaining) || 0,
                expiryDate: b.expiryDate,
                unitCostUsd: Number(b.unitCostUsd) || 0,
                receivedDate: b.receivedDate,
              }))
              // Sort by expiry date (FIFO - first to expire first)
              .sort((a: BatchInfo, b: BatchInfo) => {
                if (!a.expiryDate) return 1;
                if (!b.expiryDate) return -1;
                return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
              });
          } catch (batchError) {
            // If batch fetch fails, continue without batch details
            console.warn(`Failed to load batches for item ${item.id}:`, batchError);
          }
          
          return {
            id: item.id,
            sku: item.sku || 'N/A',
            nameEn: item.nameEn || item.name || '',
            nameAr: item.nameAr || item.name || '',
            unit: item.unit,
            category: item.category,
            totalStock: totalQty,
            batches,
          };
        })
      );

      // Filter out items with no stock
      setItems(itemsWithBatches.filter(item => item.totalStock > 0));
    } catch (error) {
      console.error('Failed to load shelf inventory:', error);
      // Try fallback to items list if stock API fails
      try {
        const itemsResult = await api.inventory.items();
        const allItems = itemsResult?.data || itemsResult || [];
        
        const itemsWithBatches: InventoryItem[] = allItems.map((item: any) => ({
          id: item.id,
          sku: item.sku || 'N/A',
          nameEn: item.nameEn || item.name || '',
          nameAr: item.nameAr || item.name || '',
          unit: item.unit,
          category: item.category,
          totalStock: 0,
          batches: [],
        }));
        
        setItems(itemsWithBatches);
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        setItems([]);
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (shelfId) {
      await loadShelfInventory(shelfId);
    }
    setRefreshing(false);
  };

  const getExpiryStatus = (expiryDate?: string) => {
    if (!expiryDate) return { status: 'unknown', color: theme.textMuted };
    
    const expiry = new Date(expiryDate);
    const now = new Date();
    const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) {
      return { status: locale === 'ar' ? 'منتهي' : 'Expired', color: theme.error };
    } else if (daysUntilExpiry <= 30) {
      return { status: locale === 'ar' ? 'قريب الانتهاء' : 'Expiring Soon', color: theme.error };
    } else if (daysUntilExpiry <= 90) {
      return { status: locale === 'ar' ? 'تحذير' : 'Warning', color: theme.warning };
    } else {
      return { status: locale === 'ar' ? 'جيد' : 'Good', color: theme.success };
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStockStatus = (stock: number) => {
    if (stock <= 0) return { text: locale === 'ar' ? 'نفذ' : 'Out', color: theme.error };
    if (stock < 10) return { text: locale === 'ar' ? 'منخفض' : 'Low', color: theme.warning };
    return { text: locale === 'ar' ? 'متوفر' : 'In Stock', color: theme.success };
  };

  const filteredItems = items.filter((item) => {
    const searchLower = search.toLowerCase();
    return (
      item.sku.toLowerCase().includes(searchLower) ||
      item.nameEn.toLowerCase().includes(searchLower) ||
      item.nameAr.includes(search)
    );
  });

  const renderBatch = (batch: BatchInfo, index: number) => {
    const expiryInfo = getExpiryStatus(batch.expiryDate);
    
    return (
      <View 
        key={batch.id} 
        style={[
          styles.batchCard,
          { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }
        ]}
      >
        <View style={[styles.batchHeader, isRtl && styles.rowReverse]}>
          <View style={[styles.batchIndex, { backgroundColor: theme.primaryBackground }]}>
            <Text style={[styles.batchIndexText, { color: theme.primary }]}>{index + 1}</Text>
          </View>
          <Text style={[styles.batchNumber, { color: theme.text }]}>{batch.batchNumber}</Text>
          <View style={[styles.expiryBadge, { backgroundColor: expiryInfo.color + '20' }]}>
            <Text style={[styles.expiryBadgeText, { color: expiryInfo.color }]}>
              {expiryInfo.status}
            </Text>
          </View>
        </View>
        
        <View style={[styles.batchDetails, isRtl && styles.rowReverse]}>
          <View style={styles.batchDetail}>
            <Text style={[styles.batchDetailLabel, { color: theme.textMuted }]}>
              {locale === 'ar' ? 'الكمية' : 'Qty'}
            </Text>
            <Text style={[styles.batchDetailValue, { color: theme.text }]}>
              {batch.qtyRemaining}
            </Text>
          </View>
          <View style={styles.batchDetail}>
            <Text style={[styles.batchDetailLabel, { color: theme.textMuted }]}>
              {locale === 'ar' ? 'تاريخ الانتهاء' : 'Expiry'}
            </Text>
            <Text style={[styles.batchDetailValue, { color: expiryInfo.color }]}>
              {formatDate(batch.expiryDate)}
            </Text>
          </View>
          <View style={styles.batchDetail}>
            <Text style={[styles.batchDetailLabel, { color: theme.textMuted }]}>
              {locale === 'ar' ? 'التكلفة' : 'Cost'}
            </Text>
            <Text style={[styles.batchDetailValue, { color: theme.text }]}>
              ${batch.unitCostUsd.toFixed(2)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: { item: InventoryItem }) => {
    const stockStatus = getStockStatus(item.totalStock);
    const isExpanded = expandedItem === item.id;
    const nearExpiryBatches = item.batches.filter(b => {
      if (!b.expiryDate) return false;
      const daysUntilExpiry = Math.floor((new Date(b.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return daysUntilExpiry <= 90;
    });
    
    return (
      <View style={[styles.itemCard, { backgroundColor: theme.card }]}>
        <TouchableOpacity 
          style={[styles.itemHeader, isRtl && styles.rowReverse]}
          onPress={() => setExpandedItem(isExpanded ? null : item.id)}
        >
          <View style={[styles.itemIcon, { backgroundColor: theme.primaryBackground }]}>
            <Ionicons name="cube" size={24} color={theme.primary} />
          </View>
          <View style={[styles.itemContent, isRtl && styles.itemContentRtl]}>
            <Text style={[styles.itemName, { color: theme.text }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? item.nameAr : item.nameEn}
            </Text>
            <Text style={[styles.itemSku, { color: theme.textSecondary }]}>{item.sku}</Text>
            <View style={[styles.itemMeta, isRtl && styles.rowReverse]}>
              {item.category && (
                <View style={[styles.categoryBadge, { backgroundColor: theme.backgroundTertiary }]}>
                  <Text style={[styles.categoryText, { color: theme.textSecondary }]}>
                    {locale === 'ar' ? item.category.nameAr : item.category.name}
                  </Text>
                </View>
              )}
              {nearExpiryBatches.length > 0 && (
                <View style={[styles.expiryWarning, { backgroundColor: theme.warningBackground }]}>
                  <Ionicons name="warning" size={12} color={theme.warning} />
                  <Text style={[styles.expiryWarningText, { color: theme.warning }]}>
                    {nearExpiryBatches.length} {locale === 'ar' ? 'دفعة قريبة الانتهاء' : 'batch expiring'}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <View style={[styles.itemStock, isRtl && styles.itemStockRtl]}>
            <Text style={[styles.stockValue, { color: theme.text }]}>{item.totalStock}</Text>
            <Text style={[styles.stockStatus, { color: stockStatus.color }]}>
              {stockStatus.text}
            </Text>
            <Ionicons 
              name={isExpanded ? 'chevron-up' : 'chevron-down'} 
              size={20} 
              color={theme.textMuted} 
              style={{ marginTop: 4 }}
            />
          </View>
        </TouchableOpacity>

        {/* Expanded Batch Details */}
        {isExpanded && (
          <View style={[styles.batchesSection, { borderTopColor: theme.border }]}>
            <Text style={[styles.batchesTitle, { color: theme.text }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'الدفعات (FIFO)' : 'Batches (FIFO)'}
            </Text>
            {item.batches.length === 0 ? (
              <Text style={[styles.noBatches, { color: theme.textMuted }]}>
                {locale === 'ar' ? 'لا توجد دفعات' : 'No batches available'}
              </Text>
            ) : (
              item.batches.map((batch, index) => renderBatch(batch, index))
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header with shelf info */}
      <View style={[styles.headerInfo, { backgroundColor: theme.primaryBackground }]}>
        <Ionicons name="storefront" size={20} color={theme.primary} />
        <Text style={[styles.shelfName, { color: theme.primary }]}>
          {shelfName || (locale === 'ar' ? 'الرف' : 'Shelf')}
        </Text>
        <View style={[styles.itemCountBadge, { backgroundColor: theme.primary }]}>
          <Text style={styles.itemCountText}>{items.length} {locale === 'ar' ? 'صنف' : 'items'}</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: theme.card, borderColor: theme.border }, isRtl && styles.searchContainerRtl]}>
        <Ionicons name="search" size={20} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }, isRtl && styles.searchInputRtl]}
          placeholder={t('search', locale)}
          placeholderTextColor={theme.inputPlaceholder}
          value={search}
          onChangeText={setSearch}
          textAlign={isRtl ? 'right' : 'left'}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Legend */}
      <View style={[styles.legend, isRtl && styles.rowReverse]}>
        <View style={[styles.legendItem, isRtl && styles.rowReverse]}>
          <View style={[styles.legendDot, { backgroundColor: theme.success }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>
            {locale === 'ar' ? 'جيد' : 'Good'}
          </Text>
        </View>
        <View style={[styles.legendItem, isRtl && styles.rowReverse]}>
          <View style={[styles.legendDot, { backgroundColor: theme.warning }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>
            {locale === 'ar' ? '< 90 يوم' : '< 90 days'}
          </Text>
        </View>
        <View style={[styles.legendItem, isRtl && styles.rowReverse]}>
          <View style={[styles.legendDot, { backgroundColor: theme.error }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>
            {locale === 'ar' ? '< 30 يوم / منتهي' : '< 30 days / Expired'}
          </Text>
        </View>
      </View>

      {/* Items List */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
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
            <Ionicons name="cube-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noData', locale)}</Text>
          </View>
        }
      />
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
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 10,
  },
  shelfName: {
    fontSize: 15,
    fontWeight: '600',
  },
  itemCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  itemCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchContainerRtl: {
    flexDirection: 'row-reverse',
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    marginLeft: 12,
  },
  searchInputRtl: {
    marginLeft: 0,
    marginRight: 12,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  itemCard: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  itemIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
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
    marginBottom: 2,
  },
  itemSku: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  itemMeta: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 11,
  },
  expiryWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  expiryWarningText: {
    fontSize: 10,
    fontWeight: '500',
  },
  itemStock: {
    alignItems: 'flex-end',
  },
  itemStockRtl: {
    alignItems: 'flex-start',
  },
  stockValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  stockStatus: {
    fontSize: 11,
    marginTop: 2,
  },
  textRtl: {
    textAlign: 'right',
  },
  batchesSection: {
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  batchesTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  noBatches: {
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 13,
  },
  batchCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  batchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  batchIndex: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  batchIndexText: {
    fontSize: 12,
    fontWeight: '700',
  },
  batchNumber: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  expiryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  expiryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  batchDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  batchDetail: {
    alignItems: 'center',
  },
  batchDetailLabel: {
    fontSize: 10,
    marginBottom: 2,
  },
  batchDetailValue: {
    fontSize: 13,
    fontWeight: '600',
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
});

