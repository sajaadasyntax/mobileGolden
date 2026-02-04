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
import { useRouter } from 'expo-router';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface Item {
  id: string;
  sku: string;
  nameEn: string;
  nameAr: string;
  category?: { name: string; nameAr: string };
  unit?: { symbol: string };
  currentStock?: number;
}

export default function InventoryScreen() {
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [locationName, setLocationName] = useState('');
  const [currentWarehouseId, setCurrentWarehouseId] = useState<string | undefined>();
  const [currentShelfId, setCurrentShelfId] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<'all' | 'warehouse' | 'shelf'>('all');
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [shelves, setShelves] = useState<any[]>([]);
  const isRtl = locale === 'ar';

  useEffect(() => {
    loadInventory();
    if (['ADMIN', 'MANAGER', 'PROCUREMENT'].includes(user?.role || '')) {
      loadWarehousesAndShelves();
    }
  }, [user, viewMode, currentWarehouseId, currentShelfId]);

  useEffect(() => {
    // Show location picker when warehouse or shelf mode is selected
    setShowLocationPicker(viewMode === 'warehouse' || viewMode === 'shelf');
  }, [viewMode]);

  const loadWarehousesAndShelves = async () => {
    try {
      const [warehousesData, shelvesData] = await Promise.all([
        api.inventory.warehouses(),
        api.inventory.shelves(),
      ]);
      setWarehouses(warehousesData || []);
      setShelves(shelvesData || []);
    } catch (error) {
      console.error('Failed to load warehouses and shelves:', error);
    }
  };

  const loadInventory = async () => {
    try {
      if (!user) return;
      
      const userRole = user?.role || '';
      
      // Warehouse users see warehouse stock
      if (userRole === 'WAREHOUSE_SALES') {
        const warehouses = await api.inventory.warehouses();
        if (warehouses && warehouses.length > 0) {
          const wh = warehouses[0];
          setCurrentWarehouseId(wh.id);
          setCurrentShelfId(undefined);
          setLocationName(locale === 'ar' ? wh.nameAr || wh.name : wh.name);
          const stockResult = await api.inventory.stockManagement.getWarehouseStock(wh.id, { pageSize: 200 });
          const stockData = stockResult?.data || stockResult || [];
          setItems(mapStockToItems(stockData));
        }
      }
      // Shelf users see ONLY their assigned shelf stock
      else if (userRole === 'SHELF_SALES') {
        // Use the user's assigned shelf directly from the user object
        const assignedShelf = (user as any)?.shelf;
        
        if (!assignedShelf) {
          setItems([]);
          setLocationName(locale === 'ar' ? 'لا يوجد رف مخصص' : 'No assigned shelf');
          return;
        }
        
        setCurrentShelfId(assignedShelf.id);
        setCurrentWarehouseId(undefined);
        setLocationName(locale === 'ar' ? assignedShelf.nameAr || assignedShelf.name : assignedShelf.name);
        const stockResult = await api.inventory.stockManagement.getShelfStock(assignedShelf.id, { pageSize: 200 });
        const stockData = stockResult?.data || stockResult || [];
        setItems(mapStockToItems(stockData));
      }
      // Admin and Procurement can view all, specific warehouse, or specific shelf
      else if (['ADMIN', 'MANAGER', 'PROCUREMENT'].includes(userRole)) {
        if (viewMode === 'warehouse' && currentWarehouseId) {
          // View specific warehouse
          const warehouse = warehouses.find((wh: any) => wh.id === currentWarehouseId);
          setLocationName(warehouse ? (locale === 'ar' ? warehouse.nameAr || warehouse.name : warehouse.name) : '');
          setCurrentShelfId(undefined);
          const stockResult = await api.inventory.stockManagement.getWarehouseStock(currentWarehouseId, { pageSize: 200 });
          const stockData = stockResult?.data || stockResult || [];
          setItems(mapStockToItems(stockData));
        } else if (viewMode === 'shelf' && currentShelfId) {
          // View specific shelf
          const shelf = shelves.find((sh: any) => sh.id === currentShelfId);
          setLocationName(shelf ? (locale === 'ar' ? shelf.nameAr || shelf.name : shelf.name) : '');
          setCurrentWarehouseId(undefined);
          const stockResult = await api.inventory.stockManagement.getShelfStock(currentShelfId, { pageSize: 200 });
          const stockData = stockResult?.data || stockResult || [];
          setItems(mapStockToItems(stockData));
        } else {
          // View all stock (aggregated from all warehouses and shelves)
          setViewMode('all');
          setLocationName(locale === 'ar' ? 'جميع المخزون' : 'All Stock');
          setCurrentWarehouseId(undefined);
          setCurrentShelfId(undefined);
          
          const allWarehouses = warehouses.length > 0 ? warehouses : await api.inventory.warehouses(user.branchId);
          const allShelves = shelves.length > 0 ? shelves : await api.inventory.shelves(user.branchId);
          
          // Aggregate stock from all warehouses
          const allStock: any[] = [];
          for (const wh of (allWarehouses || [])) {
            try {
              const stockResult = await api.inventory.stockManagement.getWarehouseStock(wh.id, { pageSize: 200 });
              const stockData = stockResult?.data || stockResult || [];
              allStock.push(...stockData);
            } catch (error) {
              console.warn(`Failed to load stock for warehouse ${wh.id}:`, error);
            }
          }
          
          // Aggregate stock from all shelves
          for (const sh of (allShelves || [])) {
            try {
              const stockResult = await api.inventory.stockManagement.getShelfStock(sh.id, { pageSize: 200 });
              const stockData = stockResult?.data || stockResult || [];
              allStock.push(...stockData);
            } catch (error) {
              console.warn(`Failed to load stock for shelf ${sh.id}:`, error);
            }
          }
          
          // Aggregate by item ID
          const itemMap = new Map();
          allStock.forEach((stockItem: any) => {
            const itemId = stockItem.item.id;
            const qty = Number(stockItem.totalQty) || 0;
            
            if (itemMap.has(itemId)) {
              itemMap.get(itemId).currentStock += qty;
            } else {
              itemMap.set(itemId, {
                id: stockItem.item.id,
                sku: stockItem.item.sku,
                nameEn: stockItem.item.nameEn || stockItem.item.name,
                nameAr: stockItem.item.nameAr || stockItem.item.name,
                category: stockItem.item.category,
                unit: stockItem.item.unit,
                currentStock: qty,
              });
            }
          });
          
          setItems(Array.from(itemMap.values()));
        }
      }
      // Fallback to all items
      else {
        const result = await api.inventory.items();
        setItems(result?.result?.data?.data || result?.data || []);
      }
    } catch (error) {
      console.error('Failed to load inventory:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const mapStockToItems = (stockData: any[]): Item[] => {
    return stockData.map((stockItem: any) => ({
      id: stockItem.item.id,
      sku: stockItem.item.sku,
      nameEn: stockItem.item.nameEn || stockItem.item.name,
      nameAr: stockItem.item.nameAr || stockItem.item.name,
      category: stockItem.item.category,
      unit: stockItem.item.unit,
      currentStock: Number(stockItem.totalQty) || 0,
    }));
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInventory();
    setRefreshing(false);
  };

  const filteredItems = items.filter(item => {
    if (!search) return true;
    const query = search.toLowerCase();
    return (
      item.nameEn?.toLowerCase().includes(query) ||
      item.nameAr?.toLowerCase().includes(query) ||
      item.sku?.toLowerCase().includes(query)
    );
  });

  const getStockColor = (stock?: number) => {
    if (!stock || stock === 0) return theme.error;
    if (stock < 10) return theme.warning;
    return theme.success;
  };

  const handleItemPress = (item: Item) => {
    router.push({
      pathname: '/product-stock-details',
      params: {
        itemId: item.id,
        ...(currentWarehouseId && { warehouseId: currentWarehouseId }),
        ...(currentShelfId && { shelfId: currentShelfId }),
      },
    });
  };

  const renderItem = ({ item }: { item: Item }) => {
    const displayName = isRtl ? item.nameAr : item.nameEn;
    const stockColor = getStockColor(item.currentStock);

    return (
      <TouchableOpacity 
        style={[styles.itemCard, { backgroundColor: theme.card }]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.itemIcon, { backgroundColor: theme.primaryBackground }]}>
          <Ionicons name="cube" size={24} color={theme.primary} />
        </View>
        
        <View style={styles.itemContent}>
          <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.itemSku, { color: theme.textSecondary }]}>
            {item.sku}
          </Text>
          {item.category && (
            <Text style={[styles.itemCategory, { color: theme.textMuted }]}>
              {isRtl ? item.category.nameAr : item.category.name}
            </Text>
          )}
        </View>

        <View style={[styles.stockBadge, { backgroundColor: `${stockColor}20` }]}>
          <Text style={[styles.stockValue, { color: stockColor }]}>
            {item.currentStock?.toLocaleString() || 0}
          </Text>
          {item.unit && (
            <Text style={[styles.stockUnit, { color: stockColor }]}>
              {item.unit.symbol}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} style={styles.chevron} />
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

  const isAdmin = ['ADMIN', 'MANAGER', 'PROCUREMENT'].includes(user?.role || '');

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Simplified Filter Header for Admin */}
      {isAdmin && (
        <View style={[styles.filterHeader, { backgroundColor: theme.card }]}>
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                viewMode === 'all' && { backgroundColor: theme.primary },
                isRtl && styles.segmentButtonRtl,
              ]}
              onPress={() => {
                setViewMode('all');
                setCurrentWarehouseId(undefined);
                setCurrentShelfId(undefined);
                setShowLocationPicker(false);
              }}
            >
              <Text style={[styles.segmentText, { color: viewMode === 'all' ? '#fff' : theme.textSecondary }]}>
                {locale === 'ar' ? 'الكل' : 'All'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                viewMode === 'warehouse' && { backgroundColor: theme.primary },
                isRtl && styles.segmentButtonRtl,
              ]}
              onPress={() => {
                setViewMode('warehouse');
                setCurrentShelfId(undefined);
                if (warehouses.length > 0 && !currentWarehouseId) {
                  setCurrentWarehouseId(warehouses[0].id);
                }
                setShowLocationPicker(true);
              }}
            >
              <Text style={[styles.segmentText, { color: viewMode === 'warehouse' ? '#fff' : theme.textSecondary }]}>
                {locale === 'ar' ? 'مخزن' : 'Warehouse'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                viewMode === 'shelf' && { backgroundColor: theme.primary },
                isRtl && styles.segmentButtonRtl,
              ]}
              onPress={() => {
                setViewMode('shelf');
                setCurrentWarehouseId(undefined);
                if (shelves.length > 0 && !currentShelfId) {
                  setCurrentShelfId(shelves[0].id);
                }
                setShowLocationPicker(true);
              }}
            >
              <Text style={[styles.segmentText, { color: viewMode === 'shelf' ? '#fff' : theme.textSecondary }]}>
                {locale === 'ar' ? 'رف' : 'Shelf'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Location Picker Dropdown */}
          {showLocationPicker && ((viewMode === 'warehouse' && warehouses.length > 0) || (viewMode === 'shelf' && shelves.length > 0)) && (
            <View style={[styles.locationPicker, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
              {viewMode === 'warehouse' && warehouses.length > 0 && (
                <FlatList
                  data={warehouses}
                  keyExtractor={(item) => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.locationChip,
                        { backgroundColor: currentWarehouseId === item.id ? theme.primary : theme.input, borderColor: currentWarehouseId === item.id ? theme.primary : theme.inputBorder },
                      ]}
                      onPress={() => setCurrentWarehouseId(item.id)}
                    >
                      <Text style={[styles.locationChipText, { color: currentWarehouseId === item.id ? '#fff' : theme.text }]}>
                        {locale === 'ar' ? item.nameAr || item.name : item.name}
                      </Text>
                    </TouchableOpacity>
                  )}
                  contentContainerStyle={styles.locationPickerContent}
                />
              )}
              {viewMode === 'shelf' && shelves.length > 0 && (
                <FlatList
                  data={shelves}
                  keyExtractor={(item) => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.locationChip,
                        { backgroundColor: currentShelfId === item.id ? theme.primary : theme.input, borderColor: currentShelfId === item.id ? theme.primary : theme.inputBorder },
                      ]}
                      onPress={() => setCurrentShelfId(item.id)}
                    >
                      <Text style={[styles.locationChipText, { color: currentShelfId === item.id ? '#fff' : theme.text }]}>
                        {locale === 'ar' ? item.nameAr || item.name : item.name}
                      </Text>
                    </TouchableOpacity>
                  )}
                  contentContainerStyle={styles.locationPickerContent}
                />
              )}
            </View>
          )}
        </View>
      )}

      {/* Location Header for Non-Admin */}
      {!isAdmin && (
        <View style={[styles.locationHeader, { backgroundColor: theme.primaryBackground }]}>
          <View style={styles.locationHeaderLeft}>
            <Ionicons name="location" size={16} color={theme.primary} />
            <Text style={[styles.locationText, { color: theme.primary }]}>
              {locationName || (locale === 'ar' ? 'المخزون' : 'Inventory')}
            </Text>
          </View>
        </View>
      )}

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
        <View style={[styles.searchBar, { backgroundColor: theme.input, borderColor: theme.inputBorder }]}>
          <Ionicons name="search" size={20} color={theme.inputPlaceholder} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder={locale === 'ar' ? 'بحث...' : 'Search...'}
            placeholderTextColor={theme.inputPlaceholder}
            value={search}
            onChangeText={setSearch}
            textAlign={isRtl ? 'right' : 'left'}
          />
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
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {search
                ? (locale === 'ar' ? 'لا توجد نتائج' : 'No results found')
                : (locale === 'ar' ? 'لا توجد أصناف' : 'No items')}
            </Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonRtl: {
    flexDirection: 'row-reverse',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  locationPicker: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    maxHeight: 60,
  },
  locationPickerContent: {
    paddingHorizontal: 8,
  },
  locationChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 4,
  },
  locationChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  locationHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  locationText: {
    fontSize: 13,
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
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    gap: 8,
  },
  chevron: {
    marginLeft: 8,
  },
  itemIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemSku: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  itemCategory: {
    fontSize: 11,
  },
  stockBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 60,
  },
  stockValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  stockUnit: {
    fontSize: 10,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
});
