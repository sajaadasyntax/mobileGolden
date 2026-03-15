import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  wholesalePriceUsd?: number;
  retailPriceUsd?: number;
  costPriceUsd?: number;
}

export default function PricesScreen() {
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';

  useEffect(() => {
    if (user && !['ADMIN', 'MANAGER', 'PROCUREMENT'].includes(user.role)) {
      router.replace('/(drawer)/dashboard');
    }
  }, [user]);
  
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(600);
  const [locationMode, setLocationMode] = useState<'branch' | 'warehouse' | 'shelf'>('branch');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [selectedShelfId, setSelectedShelfId] = useState<string>('');
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; nameAr: string }[]>([]);
  const [shelves, setShelves] = useState<{ id: string; name: string; nameAr: string }[]>([]);
  const [editPrices, setEditPrices] = useState({
    wholesalePriceUsd: '',
    retailPriceUsd: '',
    costPriceUsd: '',
  });

  // Add Item modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string; nameAr: string }[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string; symbol: string }[]>([]);
  const [addingItem, setAddingItem] = useState(false);
  const [newItem, setNewItem] = useState({
    nameEn: '',
    nameAr: '',
    sku: '',
    categoryId: '',
    unitId: '',
    wholesalePriceUsd: '',
    retailPriceUsd: '',
  });

  const loadItems = async () => {
    try {
      if (!user?.branchId) return;

      // Get exchange rate from day cycle
      try {
        const dayCycle = await api.dayCycle.getCurrent(user.branchId);
        if (dayCycle?.exchangeRateUsdSdg) {
          setExchangeRate(Number(dayCycle.exchangeRateUsdSdg));
        }
      } catch (error) {
        console.warn('Failed to load exchange rate, using default:', error);
      }

      const locationOpts = locationMode === 'warehouse' && selectedWarehouseId
        ? { warehouseId: selectedWarehouseId }
        : locationMode === 'shelf' && selectedShelfId
        ? { shelfId: selectedShelfId }
        : undefined;

      const itemsWithPrices = await api.inventory.itemsWithPrices(user.branchId, 1, 50, locationOpts);
      setItems(itemsWithPrices.map((item: any) => ({
        id: item.id,
        sku: item.sku || 'N/A',
        nameEn: item.name,
        nameAr: item.nameAr || item.name,
        wholesalePriceUsd: item.wholesalePrice || 0,
        retailPriceUsd: item.retailPrice || 0,
        costPriceUsd: 0,
      })));
    } catch (error) {
      console.error('Failed to load items:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadWarehousesAndShelves = async () => {
      try {
        const [wh, sh] = await Promise.all([
          api.inventory.warehouses(),
          api.inventory.shelves(),
        ]);
        setWarehouses(Array.isArray(wh) ? wh : []);
        setShelves(Array.isArray(sh) ? sh : []);
        if (Array.isArray(wh) && wh.length > 0 && !selectedWarehouseId) setSelectedWarehouseId(wh[0].id);
        if (Array.isArray(sh) && sh.length > 0 && !selectedShelfId) setSelectedShelfId(sh[0].id);
      } catch (e) {
        console.warn('Failed to load warehouses/shelves:', e);
      }
    };
    loadWarehousesAndShelves();
  }, []);

  useEffect(() => {
    loadItems();
  }, [user?.branchId, locationMode, selectedWarehouseId, selectedShelfId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadItems();
    setRefreshing(false);
  };

  const filteredItems = items.filter((item) => {
    const searchLower = search.toLowerCase();
    return (
      item.sku.toLowerCase().includes(searchLower) ||
      item.nameEn.toLowerCase().includes(searchLower) ||
      item.nameAr.includes(search)
    );
  });

  const handleEditPrice = (item: Item) => {
    setSelectedItem(item);
    setEditPrices({
      wholesalePriceUsd: item.wholesalePriceUsd?.toString() || '',
      retailPriceUsd: item.retailPriceUsd?.toString() || '',
      costPriceUsd: item.costPriceUsd?.toString() || '',
    });
    setShowEditModal(true);
  };

  const handleSavePrices = async () => {
    if (!selectedItem || !user?.branchId) return;
    
    const wholesale = parseFloat(editPrices.wholesalePriceUsd);
    const retail = parseFloat(editPrices.retailPriceUsd);
    
    if (isNaN(wholesale) || isNaN(retail)) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'يرجى إدخال أسعار صحيحة' : 'Please enter valid prices');
      return;
    }

    setSaving(true);
    try {
      const whId = locationMode === 'warehouse' && selectedWarehouseId ? selectedWarehouseId : undefined;
      const shId = locationMode === 'shelf' && selectedShelfId ? selectedShelfId : undefined;

      // Try to find existing policy to update instead of creating a duplicate
      let existingPolicy: any = null;
      try {
        existingPolicy = await api.inventory.pricePolicies.getForItem(
          selectedItem.id, user.branchId, whId, shId
        );
      } catch { /* no existing policy */ }

      if (existingPolicy?.id) {
        await api.inventory.pricePolicies.update({
          id: existingPolicy.id,
          wholesalePriceUsd: wholesale,
          retailPriceUsd: retail,
          priceRangeMinUsd: Math.min(wholesale, retail) * 0.9,
          priceRangeMaxUsd: Math.max(wholesale, retail) * 1.1,
        });
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        await api.inventory.pricePolicies.create({
          itemId: selectedItem.id,
          branchId: user.branchId,
          ...(whId ? { warehouseId: whId } : {}),
          ...(shId ? { shelfId: shId } : {}),
          wholesalePriceUsd: wholesale,
          retailPriceUsd: retail,
          priceRangeMinUsd: Math.min(wholesale, retail) * 0.9,
          priceRangeMaxUsd: Math.max(wholesale, retail) * 1.1,
          effectiveFrom: today.toISOString(),
        });
      }
      
      setItems(items.map(item => 
        item.id === selectedItem.id 
          ? { ...item, wholesalePriceUsd: wholesale, retailPriceUsd: retail }
          : item
      ));
      
      setShowEditModal(false);
      Alert.alert(t('success', locale), t('updatedSuccessfully', locale));
    } catch (error: any) {
      Alert.alert(t('error', locale), error.message || t('operationFailed', locale));
    } finally {
      setSaving(false);
    }
  };

  const loadCategoriesAndUnits = async () => {
    try {
      const [cats, unitList] = await Promise.all([
        api.inventory.categories.list(),
        api.inventory.units.list(),
      ]);
      setCategories(cats || []);
      setUnits(unitList || []);
    } catch (error) {
      console.warn('Failed to load categories/units:', error);
    }
  };

  const handleOpenAddModal = async () => {
    await loadCategoriesAndUnits();
    setNewItem({ nameEn: '', nameAr: '', sku: '', categoryId: '', unitId: '', wholesalePriceUsd: '', retailPriceUsd: '' });
    setShowAddModal(true);
  };

  const handleCreateItem = async () => {
    if (!user?.branchId) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'يجب تعيين فرع للمستخدم' : 'User must be assigned to a branch');
      return;
    }
    if (!newItem.nameEn.trim() || !newItem.sku.trim() || !newItem.categoryId || !newItem.unitId) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }
    const nameAr = newItem.nameAr.trim() || newItem.nameEn.trim();
    if (nameAr.length < 2) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'الاسم يجب أن يكون حرفين على الأقل' : 'Name must be at least 2 characters');
      return;
    }
    const wholesale = parseFloat(newItem.wholesalePriceUsd);
    const retail = parseFloat(newItem.retailPriceUsd);
    if (isNaN(wholesale) || wholesale <= 0 || isNaN(retail) || retail <= 0) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'يرجى إدخال أسعار صحيحة' : 'Please enter valid prices');
      return;
    }
    setAddingItem(true);
    try {
      let itemId: string;

      // Try to create item; if SKU already exists, find and reuse it
      try {
        const created = await api.inventory.items.create({
          nameEn: newItem.nameEn.trim(),
          nameAr,
          sku: newItem.sku.trim(),
          categoryId: newItem.categoryId,
          unitId: newItem.unitId,
        });
        itemId = created?.id;
      } catch (createErr: any) {
        if (createErr.message?.includes('SKU already exists')) {
          const allItems = await api.inventory.items.list();
          const existing = (allItems?.data || allItems || []).find(
            (it: any) => it.sku === newItem.sku.trim()
          );
          if (!existing?.id) throw createErr;
          itemId = existing.id;
        } else {
          throw createErr;
        }
      }

      if (!itemId) {
        throw new Error(locale === 'ar' ? 'فشل في إنشاء الصنف' : 'Failed to create item');
      }

      // Use start of today for effectiveFrom to avoid client/server clock skew
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await api.inventory.pricePolicies.create({
        itemId,
        branchId: user.branchId,
        ...(locationMode === 'warehouse' && selectedWarehouseId ? { warehouseId: selectedWarehouseId } : {}),
        ...(locationMode === 'shelf' && selectedShelfId ? { shelfId: selectedShelfId } : {}),
        wholesalePriceUsd: wholesale,
        retailPriceUsd: retail,
        priceRangeMinUsd: Math.min(wholesale, retail) * 0.9,
        priceRangeMaxUsd: Math.max(wholesale, retail) * 1.1,
        effectiveFrom: today.toISOString(),
      });
      setShowAddModal(false);
      Alert.alert(t('success', locale), locale === 'ar' ? 'تم إضافة الصنف بنجاح' : 'Item added successfully');
      await loadItems();
    } catch (error: any) {
      Alert.alert(t('error', locale), error.message || t('operationFailed', locale));
    } finally {
      setAddingItem(false);
    }
  };

  const formatCurrency = (amount?: number) => {
    if (amount === undefined || amount === null) return '-';
    return `$${amount.toFixed(2)}`;
  };

  const formatSdg = (amount?: number) => {
    if (amount === undefined || amount === null) return '-';
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US').format(Math.round(amount));
  };

  const renderItem = ({ item }: { item: Item }) => {
    return (
      <TouchableOpacity 
        style={[styles.itemCard, { backgroundColor: theme.card }, isRtl && styles.itemCardRtl]}
        onPress={() => handleEditPrice(item)}
      >
        <View style={[styles.itemIcon, { backgroundColor: theme.success + '10' }]}>
          <Ionicons name="pricetag" size={24} color={theme.success} />
        </View>
        <View style={[styles.itemContent, isRtl && styles.itemContentRtl]}>
          <Text style={[styles.itemName, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? item.nameAr : item.nameEn}
          </Text>
          <Text style={[styles.itemSku, { color: theme.textSecondary }, isRtl && styles.textRtl]}>{item.sku}</Text>
          <View style={[styles.priceRow, isRtl && styles.priceRowRtl]}>
            <View style={[styles.priceItem, { backgroundColor: theme.backgroundTertiary }]}>
              <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>{t('wholesale', locale)}</Text>
              {item.wholesalePriceUsd && item.wholesalePriceUsd > 0 && (
                <Text style={[styles.priceValueSdg, { color: theme.success }]}>
                  {formatSdg(item.wholesalePriceUsd * exchangeRate)} {locale === 'ar' ? 'ج.س' : 'SDG'}
                </Text>
              )}
              <Text style={[styles.priceValue, { color: theme.textSecondary }]}>{formatCurrency(item.wholesalePriceUsd)}</Text>
            </View>
            <View style={[styles.priceItem, { backgroundColor: theme.backgroundTertiary }]}>
              <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>{t('retail', locale)}</Text>
              {item.retailPriceUsd && item.retailPriceUsd > 0 && (
                <Text style={[styles.priceValueSdg, { color: theme.success }]}>
                  {formatSdg(item.retailPriceUsd * exchangeRate)} {locale === 'ar' ? 'ج.س' : 'SDG'}
                </Text>
              )}
              <Text style={[styles.priceValue, { color: theme.textSecondary }]}>{formatCurrency(item.retailPriceUsd)}</Text>
            </View>
          </View>
        </View>
        <View style={[styles.editIcon, { backgroundColor: theme.primaryBackground }]}>
          <Ionicons name="create-outline" size={20} color={theme.primary} />
        </View>
      </TouchableOpacity>
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
      {/* Location selector for per-location pricing */}
      <View style={[styles.locationSection, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.locationLabel, { color: theme.textSecondary }]}>
          {locale === 'ar' ? 'الموقع' : 'Location'}
        </Text>
        <View style={styles.locationRow}>
          {(['branch', 'warehouse', 'shelf'] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.locationChip,
                { backgroundColor: locationMode === mode ? theme.primary : theme.input, borderColor: theme.inputBorder },
              ]}
              onPress={() => setLocationMode(mode)}
            >
              <Text style={{ color: locationMode === mode ? '#fff' : theme.text, fontWeight: '600', fontSize: 13 }}>
                {mode === 'branch' ? (locale === 'ar' ? 'الفرع' : 'Branch') : mode === 'warehouse' ? (locale === 'ar' ? 'مخزن' : 'Warehouse') : (locale === 'ar' ? 'رف' : 'Shelf')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {locationMode === 'warehouse' && warehouses.length > 0 && (
          <View style={styles.locationPicker}>
            {warehouses.map((w) => (
              <TouchableOpacity
                key={w.id}
                style={[styles.pickerChip, { backgroundColor: selectedWarehouseId === w.id ? theme.primary + '30' : theme.input }]}
                onPress={() => setSelectedWarehouseId(w.id)}
              >
                <Text style={{ color: selectedWarehouseId === w.id ? theme.primary : theme.text }}>{isRtl ? w.nameAr : w.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {locationMode === 'shelf' && shelves.length > 0 && (
          <View style={styles.locationPicker}>
            {shelves.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[styles.pickerChip, { backgroundColor: selectedShelfId === s.id ? theme.primary + '30' : theme.input }]}
                onPress={() => setSelectedShelfId(s.id)}
              >
                <Text style={{ color: selectedShelfId === s.id ? theme.primary : theme.text }}>{isRtl ? s.nameAr : s.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Header Info */}
      <View style={[styles.infoCard, { backgroundColor: theme.primaryBackground }]}>
        <Ionicons name="information-circle" size={20} color={theme.primary} />
        <Text style={[styles.infoText, { color: theme.primary }, isRtl && styles.textRtl]}>
          {locale === 'ar' 
            ? `الأسعار بالدولار الأمريكي (USD) والسوداني (SDG) - سعر الصرف: ${exchangeRate.toLocaleString()}`
            : `Prices in US Dollars (USD) and Sudanese Pounds (SDG) - Exchange Rate: ${exchangeRate.toLocaleString()}`}
        </Text>
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
            <Ionicons name="pricetag-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noData', locale)}</Text>
          </View>
        }
      />

      {/* Add Item FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={handleOpenAddModal}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add Item Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, isRtl && styles.modalHeaderRtl]}>
              <Text style={[styles.modalTitle, { color: theme.text }, isRtl && styles.textRtl]}>
                {locale === 'ar' ? 'إضافة صنف جديد' : 'Add New Item'}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }}>
              {/* Name EN */}
              <View style={styles.priceInputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                  {locale === 'ar' ? 'الاسم (إنجليزي) *' : 'Name (English) *'}
                </Text>
                <TextInput
                  style={[styles.addInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
                  placeholder="Item name"
                  placeholderTextColor={theme.inputPlaceholder}
                  value={newItem.nameEn}
                  onChangeText={(v) => setNewItem({ ...newItem, nameEn: v })}
                />
              </View>
              {/* Name AR */}
              <View style={styles.priceInputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                  {locale === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}
                </Text>
                <TextInput
                  style={[styles.addInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border, textAlign: 'right' }]}
                  placeholder="اسم الصنف"
                  placeholderTextColor={theme.inputPlaceholder}
                  value={newItem.nameAr}
                  onChangeText={(v) => setNewItem({ ...newItem, nameAr: v })}
                />
              </View>
              {/* SKU */}
              <View style={styles.priceInputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                  {locale === 'ar' ? 'رمز الصنف (SKU) *' : 'SKU *'}
                </Text>
                <TextInput
                  style={[styles.addInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
                  placeholder="SKU-001"
                  placeholderTextColor={theme.inputPlaceholder}
                  value={newItem.sku}
                  onChangeText={(v) => setNewItem({ ...newItem, sku: v })}
                  autoCapitalize="characters"
                />
              </View>
              {/* Category */}
              <View style={styles.priceInputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                  {locale === 'ar' ? 'الفئة *' : 'Category *'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {categories.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[styles.chipButton, { backgroundColor: newItem.categoryId === cat.id ? theme.primary : theme.backgroundTertiary }]}
                        onPress={() => setNewItem({ ...newItem, categoryId: cat.id })}
                      >
                        <Text style={{ color: newItem.categoryId === cat.id ? '#fff' : theme.text, fontSize: 13 }}>
                          {locale === 'ar' ? cat.nameAr || cat.name : cat.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
              {/* Unit */}
              <View style={styles.priceInputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                  {locale === 'ar' ? 'الوحدة *' : 'Unit *'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {units.map((unit) => (
                      <TouchableOpacity
                        key={unit.id}
                        style={[styles.chipButton, { backgroundColor: newItem.unitId === unit.id ? theme.primary : theme.backgroundTertiary }]}
                        onPress={() => setNewItem({ ...newItem, unitId: unit.id })}
                      >
                        <Text style={{ color: newItem.unitId === unit.id ? '#fff' : theme.text, fontSize: 13 }}>
                          {unit.symbol || unit.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
              {/* Prices */}
              <View style={styles.priceInputsContainer}>
                <View style={styles.priceInputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                    {t('wholesalePrice', locale)} (USD) *
                  </Text>
                  <View style={[styles.priceInputWrapper, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
                    <Text style={[styles.currencySymbol, { color: theme.success }]}>$</Text>
                    <TextInput
                      style={[styles.priceInput, { color: theme.text }]}
                      placeholder="0.00"
                      placeholderTextColor={theme.inputPlaceholder}
                      value={newItem.wholesalePriceUsd}
                      onChangeText={(v) => setNewItem({ ...newItem, wholesalePriceUsd: v })}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <View style={styles.priceInputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                    {t('retailPrice', locale)} (USD) *
                  </Text>
                  <View style={[styles.priceInputWrapper, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
                    <Text style={[styles.currencySymbol, { color: theme.success }]}>$</Text>
                    <TextInput
                      style={[styles.priceInput, { color: theme.text }]}
                      placeholder="0.00"
                      placeholderTextColor={theme.inputPlaceholder}
                      value={newItem.retailPriceUsd}
                      onChangeText={(v) => setNewItem({ ...newItem, retailPriceUsd: v })}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              </View>
            </ScrollView>
            <View style={[styles.modalButtons, isRtl && styles.modalButtonsRtl, { marginTop: 16 }]}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton, { backgroundColor: theme.backgroundTertiary }]}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>{t('cancel', locale)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmModalButton, { backgroundColor: theme.primary }]}
                onPress={handleCreateItem}
                disabled={addingItem}
              >
                {addingItem ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmButtonText}>{locale === 'ar' ? 'إضافة' : 'Add Item'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Price Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, isRtl && styles.modalHeaderRtl]}>
              <Text style={[styles.modalTitle, { color: theme.text }, isRtl && styles.textRtl]}>
                {t('updatePrices', locale)}
              </Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <View style={[styles.selectedItemInfo, { backgroundColor: theme.backgroundSecondary }]}>
                <Text style={[styles.selectedItemName, { color: theme.text }, isRtl && styles.textRtl]}>
                  {locale === 'ar' ? selectedItem.nameAr : selectedItem.nameEn}
                </Text>
                <Text style={[styles.selectedItemSku, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                  {selectedItem.sku}
                </Text>
              </View>
            )}

            <View style={styles.priceInputsContainer}>
              {/* Wholesale Price */}
              <View style={styles.priceInputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                  {t('wholesalePrice', locale)} (USD)
                </Text>
                <View style={[styles.priceInputWrapper, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }, isRtl && styles.priceInputWrapperRtl]}>
                  <Text style={[styles.currencySymbol, { color: theme.success }]}>$</Text>
                  <TextInput
                    style={[styles.priceInput, { color: theme.text }, isRtl && styles.priceInputRtl]}
                    placeholder="0.00"
                    placeholderTextColor={theme.inputPlaceholder}
                    value={editPrices.wholesalePriceUsd}
                    onChangeText={(text) => setEditPrices({ ...editPrices, wholesalePriceUsd: text })}
                    keyboardType="decimal-pad"
                    textAlign={isRtl ? 'right' : 'left'}
                  />
                </View>
              </View>

              {/* Retail Price */}
              <View style={styles.priceInputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                  {t('retailPrice', locale)} (USD)
                </Text>
                <View style={[styles.priceInputWrapper, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }, isRtl && styles.priceInputWrapperRtl]}>
                  <Text style={[styles.currencySymbol, { color: theme.success }]}>$</Text>
                  <TextInput
                    style={[styles.priceInput, { color: theme.text }, isRtl && styles.priceInputRtl]}
                    placeholder="0.00"
                    placeholderTextColor={theme.inputPlaceholder}
                    value={editPrices.retailPriceUsd}
                    onChangeText={(text) => setEditPrices({ ...editPrices, retailPriceUsd: text })}
                    keyboardType="decimal-pad"
                    textAlign={isRtl ? 'right' : 'left'}
                  />
                </View>
              </View>
            </View>

            <View style={[styles.modalButtons, isRtl && styles.modalButtonsRtl]}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton, { backgroundColor: theme.backgroundTertiary }]}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>{t('cancel', locale)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmModalButton, { backgroundColor: theme.primary }]}
                onPress={handleSavePrices}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmButtonText}>{t('save', locale)}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    marginBottom: 0,
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
  },
  locationSection: {
    margin: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  locationLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  locationChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  locationPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  pickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
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
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  itemCardRtl: {
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
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  itemSku: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    gap: 16,
  },
  priceRowRtl: {
    flexDirection: 'row-reverse',
  },
  priceItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  priceLabel: {
    fontSize: 10,
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 11,
    marginTop: 2,
  },
  priceValueSdg: {
    fontSize: 14,
    fontWeight: '600',
  },
  editIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  selectedItemInfo: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  selectedItemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  selectedItemSku: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  priceInputsContainer: {
    gap: 16,
    marginBottom: 24,
  },
  priceInputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  priceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  priceInputWrapperRtl: {
    flexDirection: 'row-reverse',
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '600',
    marginRight: 8,
  },
  priceInput: {
    flex: 1,
    height: 52,
    fontSize: 18,
    fontWeight: '600',
  },
  priceInputRtl: {
    textAlign: 'right',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButtonsRtl: {
    flexDirection: 'row-reverse',
  },
  modalButton: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelModalButton: {},
  confirmModalButton: {},
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  addInput: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  chipButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
});
