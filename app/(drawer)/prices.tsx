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
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(600); // Default fallback rate
  const [editPrices, setEditPrices] = useState({
    wholesalePriceUsd: '',
    retailPriceUsd: '',
    costPriceUsd: '',
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
      
      // Get items with their prices
      const itemsWithPrices = await api.inventory.itemsWithPrices(user.branchId);
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
    loadItems();
  }, [user?.branchId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadItems();
    setRefreshing(false);
  };

  useEffect(() => {
    loadItems();
  }, [user?.branchId]);

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
      // Create or update price policy
      await api.inventory.pricePolicies.create({
        itemId: selectedItem.id,
        branchId: user.branchId,
        wholesalePriceUsd: wholesale,
        retailPriceUsd: retail,
        priceRangeMinUsd: Math.min(wholesale, retail) * 0.9,
        priceRangeMaxUsd: Math.max(wholesale, retail) * 1.1,
        effectiveFrom: new Date().toISOString(),
      });
      
      // Update local state
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
              <Text style={[styles.priceValue, { color: theme.success }]}>{formatCurrency(item.wholesalePriceUsd)}</Text>
              {item.wholesalePriceUsd && item.wholesalePriceUsd > 0 && (
                <Text style={[styles.priceValueSdg, { color: theme.textSecondary }]}>
                  {formatSdg(item.wholesalePriceUsd * exchangeRate)} {locale === 'ar' ? 'ج.س' : 'SDG'}
                </Text>
              )}
            </View>
            <View style={[styles.priceItem, { backgroundColor: theme.backgroundTertiary }]}>
              <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>{t('retail', locale)}</Text>
              <Text style={[styles.priceValue, { color: theme.success }]}>{formatCurrency(item.retailPriceUsd)}</Text>
              {item.retailPriceUsd && item.retailPriceUsd > 0 && (
                <Text style={[styles.priceValueSdg, { color: theme.textSecondary }]}>
                  {formatSdg(item.retailPriceUsd * exchangeRate)} {locale === 'ar' ? 'ج.س' : 'SDG'}
                </Text>
              )}
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
    fontSize: 14,
    fontWeight: '600',
  },
  priceValueSdg: {
    fontSize: 11,
    marginTop: 2,
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
});
