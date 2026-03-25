import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

interface Batch {
  id: string;
  batchNumber?: string;
  qtyRemaining: number;
  qtyReceived: number;
  expiryDate?: string;
  receivedDate: string;
  unitCostUsd: number;
  warehouse?: { name: string; nameAr: string };
  shelf?: { name: string; nameAr: string };
}

interface StockMovement {
  id: string;
  qty: number;
  movementType: string;
  createdAt: string;
  referenceType?: string;
}

export default function ProductStockDetailsScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';

  const itemId = params.itemId as string;
  const warehouseId = params.warehouseId as string | undefined;
  const shelfId = params.shelfId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [itemInfo, setItemInfo] = useState<any>(null);
  const [totalStock, setTotalStock] = useState(0);
  const [showDivideModal, setShowDivideModal] = useState(false);
  const [divideBatch, setDivideBatch] = useState<Batch | null>(null);
  const [divideTargetUnitId, setDivideTargetUnitId] = useState('');
  const [divideQty, setDivideQty] = useState('');
  const [dividing, setDividing] = useState(false);
  const [units, setUnits] = useState<{ id: string; name: string; symbol: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; nameAr?: string }[]>([]);

  // Edit product state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editItem, setEditItem] = useState({ nameEn: '', nameAr: '', sku: '', categoryId: '', unitId: '' });
  const [saving, setSaving] = useState(false);

  const canEdit = ['ADMIN', 'MANAGER', 'PROCUREMENT'].includes(user?.role || '');

  useEffect(() => {
    if (itemId) {
      loadStockDetails();
    }
  }, [itemId, warehouseId, shelfId]);

  const loadStockDetails = async () => {
    try {
      setLoading(true);

      // Load item info by ID (real data from backend)
      const item = await api.inventory.items.getById(itemId);
      setItemInfo(item);

      // Load batches (real stock data from backend)
      const batchesResult = await api.inventory.stockManagement.getBatches(itemId, {
        warehouseId,
        shelfId,
        includeEmpty: false,
      });
      // Handle both array and { data: [...] } response shapes
      const batchesRaw = Array.isArray(batchesResult) ? batchesResult : (batchesResult as any)?.data;
      const batchesData = (Array.isArray(batchesRaw) ? batchesRaw : []) as Batch[];

      // Sort by expiry date (FIFO)
      const sortedBatches = [...batchesData].sort((a, b) => {
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
      });

      setBatches(sortedBatches);

      // Calculate total stock from real batch data
      const total = sortedBatches.reduce((sum, b) => sum + Number(b.qtyRemaining || 0), 0);
      setTotalStock(total);

      // Load recent movements (real movement data from backend)
      try {
        const movementsResult = await api.inventory.stockManagement.getMovements({
          itemId,
          pageSize: 20,
        });
        const movementsRaw = (movementsResult as any)?.data ?? movementsResult;
        const movementsData = Array.isArray(movementsRaw) ? movementsRaw : [];
        setMovements(movementsData.slice(0, 10));
      } catch (error) {
        console.warn('Failed to load movements:', error);
        setMovements([]);
      }
    } catch (error) {
      console.error('Failed to load stock details:', error);
      setItemInfo(null);
      setBatches([]);
      setMovements([]);
      setTotalStock(0);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStockDetails();
    setRefreshing(false);
  };

  const openEditModal = async () => {
    if (!itemInfo) return;
    setEditItem({
      nameEn: itemInfo.nameEn || '',
      nameAr: itemInfo.nameAr || '',
      sku: itemInfo.sku || '',
      categoryId: itemInfo.category?.id || itemInfo.categoryId || '',
      unitId: itemInfo.unit?.id || itemInfo.unitId || '',
    });
    try {
      const [unitList, categoryList] = await Promise.all([
        api.inventory.units.list(),
        api.inventory.categories.list(),
      ]);
      setUnits(unitList || []);
      setCategories(categoryList || []);
    } catch {}
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editItem.nameEn.trim() || !editItem.nameAr.trim() || !editItem.sku.trim()) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'يرجى ملء الحقول المطلوبة' : 'Please fill all required fields'
      );
      return;
    }
    setSaving(true);
    try {
      await api.inventory.items.update({
        id: itemId,
        nameEn: editItem.nameEn.trim(),
        nameAr: editItem.nameAr.trim(),
        sku: editItem.sku.trim(),
        ...(editItem.categoryId && { categoryId: editItem.categoryId }),
        ...(editItem.unitId && { unitId: editItem.unitId }),
      });
      setShowEditModal(false);
      await loadStockDetails();
      Alert.alert(
        locale === 'ar' ? 'تم' : 'Success',
        locale === 'ar' ? 'تم تحديث بيانات المنتج' : 'Product updated successfully'
      );
    } catch (e: any) {
      Alert.alert(locale === 'ar' ? 'خطأ' : 'Error', e?.message || (locale === 'ar' ? 'فشل التحديث' : 'Update failed'));
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const getDaysUntilExpiry = (expiryDate?: string) => {
    if (!expiryDate) return null;
    try {
      const expiry = new Date(expiryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = expiry.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch {
      return null;
    }
  };

  const getExpiryColor = (daysUntilExpiry: number | null) => {
    if (daysUntilExpiry === null) return theme.textSecondary;
    if (daysUntilExpiry < 0) return theme.error;
    if (daysUntilExpiry <= 7) return theme.warning;
    if (daysUntilExpiry <= 30) return '#FFA500';
    return theme.success;
  };

  const getMovementTypeLabel = (type: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      RECEIPT: { en: 'Receipt', ar: 'استلام' },
      ISSUE: { en: 'Issue', ar: 'صرف' },
      TRANSFER_IN: { en: 'Transfer In', ar: 'تحويل وارد' },
      TRANSFER_OUT: { en: 'Transfer Out', ar: 'تحويل صادر' },
      ADJUSTMENT: { en: 'Adjustment', ar: 'تعديل' },
    };
    return labels[type] || { en: type, ar: type };
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!itemInfo) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.textSecondary} />
        <Text style={{ marginTop: 12, fontSize: 16, color: theme.textSecondary }}>
          {locale === 'ar' ? 'المنتج غير موجود' : 'Item not found'}
        </Text>
      </View>
    );
  }

  const displayName = isRtl ? itemInfo?.nameAr : itemInfo?.nameEn || itemInfo?.name;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
    <ScrollView
      style={{ flex: 1 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
      }
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name={isRtl ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={2}>
            {displayName}
          </Text>
          {itemInfo?.sku && (
            <Text style={[styles.itemSku, { color: theme.textSecondary }]}>
              SKU: {itemInfo.sku}
            </Text>
          )}
        </View>
        {canEdit && (
          <TouchableOpacity style={{ padding: 8 }} onPress={openEditModal}>
            <Ionicons name="create-outline" size={22} color={theme.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Total Stock Card */}
      <View style={[styles.totalStockCard, { backgroundColor: theme.primaryBackground }]}>
        <View style={styles.totalStockContent}>
          <Ionicons name="cube" size={32} color={theme.primary} />
          <View style={styles.totalStockInfo}>
            <Text style={[styles.totalStockLabel, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'إجمالي المخزون' : 'Total Stock'}
            </Text>
            <Text style={[styles.totalStockValue, { color: theme.primary }]}>
              {totalStock.toLocaleString()} {itemInfo?.unit?.symbol || ''}
            </Text>
          </View>
        </View>
      </View>

      {/* Batches Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {locale === 'ar' ? 'الدفعات' : 'Batches'}
        </Text>
        {batches.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card }]}>
            <Ionicons name="cube-outline" size={32} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'لا توجد دفعات متاحة' : 'No batches available'}
            </Text>
          </View>
        ) : (
          batches.map((batch) => {
            const daysUntilExpiry = getDaysUntilExpiry(batch.expiryDate);
            const expiryColor = getExpiryColor(daysUntilExpiry);

            return (
              <View key={batch.id} style={[styles.batchCard, { backgroundColor: theme.card }]}>
                <View style={styles.batchHeader}>
                  <View style={styles.batchNumberContainer}>
                    <Ionicons name="layers" size={20} color={theme.primary} />
                    <Text style={[styles.batchNumber, { color: theme.text }]}>
                      {batch.batchNumber || `B-${batch.id.substring(0, 8).toUpperCase()}`}
                    </Text>
                  </View>
                  <View style={[styles.stockBadge, { backgroundColor: `${theme.primary}15` }]}>
                    <Text style={[styles.stockValue, { color: theme.primary }]}>
                      {Number(batch.qtyRemaining).toLocaleString()}
                    </Text>
                    <Text style={[styles.stockUnit, { color: theme.primary }]}>
                      {itemInfo?.unit?.symbol || ''}
                    </Text>
                  </View>
                </View>

                <View style={styles.batchDetails}>
                  <View style={styles.batchDetailRow}>
                    <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
                    <Text style={[styles.batchDetailLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'تاريخ الاستلام' : 'Received'}:{' '}
                    </Text>
                    <Text style={[styles.batchDetailValue, { color: theme.text }]}>
                      {formatDate(batch.receivedDate)}
                    </Text>
                  </View>

                  {batch.expiryDate && (
                    <View style={styles.batchDetailRow}>
                      <Ionicons name="time-outline" size={16} color={expiryColor} />
                      <Text style={[styles.batchDetailLabel, { color: theme.textSecondary }]}>
                        {locale === 'ar' ? 'تاريخ الانتهاء' : 'Expiry'}:{' '}
                      </Text>
                      <Text style={[styles.batchDetailValue, { color: expiryColor }]}>
                        {formatDate(batch.expiryDate)}
                        {daysUntilExpiry !== null && (
                          <Text style={{ fontSize: 12 }}>
                            {' '}({daysUntilExpiry > 0 ? '+' : ''}{daysUntilExpiry}{' '}
                            {locale === 'ar' ? 'يوم' : 'days'})
                          </Text>
                        )}
                      </Text>
                    </View>
                  )}

                  {(batch.warehouse || batch.shelf) && (
                    <View style={styles.batchDetailRow}>
                      <Ionicons name="location-outline" size={16} color={theme.textSecondary} />
                      <Text style={[styles.batchDetailValue, { color: theme.text }]}>
                        {batch.warehouse
                          ? isRtl
                            ? batch.warehouse.nameAr
                            : batch.warehouse.name
                          : batch.shelf
                          ? isRtl
                            ? batch.shelf.nameAr
                            : batch.shelf.name
                          : ''}
                      </Text>
                    </View>
                  )}
                </View>
                {itemInfo?.unit?.id && (
                  <TouchableOpacity
                    style={[styles.divideBtn, { backgroundColor: theme.primary + '20' }]}
                    onPress={async () => {
                      const unitList = await api.inventory.units.list();
                      setUnits(unitList || []);
                      setDivideBatch(batch);
                      setDivideTargetUnitId('');
                      setDivideQty('');
                      setShowDivideModal(true);
                    }}
                  >
                    <Ionicons name="git-branch-outline" size={18} color={theme.primary} />
                    <Text style={[styles.divideBtnText, { color: theme.primary }]}>{locale === 'ar' ? 'تقسيم' : 'Divide'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Divide Batch Modal */}
      <Modal visible={showDivideModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.divideModal, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{locale === 'ar' ? 'تقسيم الدفعة' : 'Divide Batch'}</Text>
              <TouchableOpacity onPress={() => setShowDivideModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>{locale === 'ar' ? 'إلى وحدة' : 'Target Unit'}</Text>
              {units.filter((u) => u.id !== itemInfo?.unit?.id).map((u) => (
                <TouchableOpacity
                  key={u.id}
                  onPress={() => setDivideTargetUnitId(u.id)}
                  style={[styles.optionRow, { backgroundColor: divideTargetUnitId === u.id ? theme.primary + '30' : theme.input }]}
                >
                  <Text style={{ color: divideTargetUnitId === u.id ? theme.primary : theme.text }}>{u.name} ({u.symbol})</Text>
                  {divideTargetUnitId === u.id && <Ionicons name="checkmark-circle" size={20} color={theme.primary} />}
                </TouchableOpacity>
              ))}
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>{locale === 'ar' ? 'الكمية بالوحدة المستهدفة' : 'Quantity in target unit'}</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={divideQty}
                onChangeText={setDivideQty}
                placeholder="0"
                keyboardType="decimal-pad"
                placeholderTextColor={theme.inputPlaceholder}
              />
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: theme.primary }, dividing && { opacity: 0.6 }]}
                onPress={async () => {
                  if (!divideBatch || !divideTargetUnitId || !divideQty.trim()) {
                    Alert.alert(locale === 'ar' ? 'خطأ' : 'Error', locale === 'ar' ? 'يرجى اختيار الوحدة وإدخال الكمية' : 'Please select unit and enter quantity');
                    return;
                  }
                  const qty = parseFloat(divideQty);
                  if (isNaN(qty) || qty <= 0) {
                    Alert.alert(locale === 'ar' ? 'خطأ' : 'Error', locale === 'ar' ? 'كمية غير صحيحة' : 'Invalid quantity');
                    return;
                  }
                  setDividing(true);
                  try {
                    await api.inventory.stockManagement.divideBatch({
                      batchId: divideBatch.id,
                      targetUnitId: divideTargetUnitId,
                      quantityInTargetUnit: qty,
                    });
                    setShowDivideModal(false);
                    loadStockDetails();
                    Alert.alert(locale === 'ar' ? 'نجح' : 'Success', locale === 'ar' ? 'تم التقسيم بنجاح' : 'Batch divided successfully');
                  } catch (e: any) {
                    Alert.alert(locale === 'ar' ? 'خطأ' : 'Error', e?.message || 'Failed');
                  } finally {
                    setDividing(false);
                  }
                }}
                disabled={dividing}
              >
                {dividing ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>{locale === 'ar' ? 'تقسيم' : 'Divide'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Recent Movements Section */}
      {movements.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {locale === 'ar' ? 'الحركات الأخيرة' : 'Recent Movements'}
          </Text>
          {movements.map((movement) => {
            const movementLabel = getMovementTypeLabel(movement.movementType);
            const isPositive = Number(movement.qty) > 0;

            return (
              <View key={movement.id} style={[styles.movementCard, { backgroundColor: theme.card }]}>
                <View style={styles.movementHeader}>
                  <View style={styles.movementTypeContainer}>
                    <Ionicons
                      name={isPositive ? 'arrow-down-circle' : 'arrow-up-circle'}
                      size={20}
                      color={isPositive ? theme.success : theme.error}
                    />
                    <Text style={[styles.movementType, { color: theme.text }]}>
                      {isRtl ? movementLabel.ar : movementLabel.en}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.movementQty,
                      { color: isPositive ? theme.success : theme.error },
                    ]}
                  >
                    {isPositive ? '+' : ''}
                    {Number(movement.qty).toLocaleString()} {itemInfo?.unit?.symbol || ''}
                  </Text>
                </View>
                <Text style={[styles.movementDate, { color: theme.textSecondary }]}>
                  {formatDate(movement.createdAt)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>

      {/* Edit Product Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View style={[styles.divideModal, { backgroundColor: theme.card }]}>
              <View style={[styles.modalHeader, isRtl && { flexDirection: 'row-reverse' }]}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {locale === 'ar' ? 'تعديل المنتج' : 'Edit Product'}
                </Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)}>
                  <Ionicons name="close" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Name EN */}
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                  {locale === 'ar' ? 'الاسم (إنجليزي) *' : 'Name (English) *'}
                </Text>
                <TextInput
                  style={[styles.textInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border, marginBottom: 12 }]}
                  value={editItem.nameEn}
                  onChangeText={(v) => setEditItem({ ...editItem, nameEn: v })}
                  placeholder="Item name"
                  placeholderTextColor={theme.inputPlaceholder}
                  returnKeyType="next"
                />
                {/* Name AR */}
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                  {locale === 'ar' ? 'الاسم (عربي) *' : 'Name (Arabic) *'}
                </Text>
                <TextInput
                  style={[styles.textInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border, textAlign: 'right', marginBottom: 12 }]}
                  value={editItem.nameAr}
                  onChangeText={(v) => setEditItem({ ...editItem, nameAr: v })}
                  placeholder="اسم الصنف"
                  placeholderTextColor={theme.inputPlaceholder}
                  returnKeyType="next"
                />
                {/* SKU */}
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                  {locale === 'ar' ? 'رمز الصنف (SKU) *' : 'SKU *'}
                </Text>
                <TextInput
                  style={[styles.textInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border, marginBottom: 12 }]}
                  value={editItem.sku}
                  onChangeText={(v) => setEditItem({ ...editItem, sku: v })}
                  placeholder="SKU-001"
                  placeholderTextColor={theme.inputPlaceholder}
                  autoCapitalize="characters"
                  returnKeyType="done"
                />
                {/* Category */}
                {categories.length > 0 && (
                  <>
                    <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'الفئة' : 'Category'}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {categories.map((cat) => (
                          <TouchableOpacity
                            key={cat.id}
                            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: editItem.categoryId === cat.id ? theme.primary : theme.backgroundTertiary }}
                            onPress={() => setEditItem({ ...editItem, categoryId: cat.id })}
                          >
                            <Text style={{ color: editItem.categoryId === cat.id ? '#fff' : theme.text, fontSize: 13 }}>
                              {locale === 'ar' ? (cat as any).nameAr || cat.name : cat.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </>
                )}
                {/* Unit */}
                {units.length > 0 && (
                  <>
                    <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'الوحدة' : 'Unit'}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {units.map((u) => (
                          <TouchableOpacity
                            key={u.id}
                            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: editItem.unitId === u.id ? theme.primary : theme.backgroundTertiary }}
                            onPress={() => setEditItem({ ...editItem, unitId: u.id })}
                          >
                            <Text style={{ color: editItem.unitId === u.id ? '#fff' : theme.text, fontSize: 13 }}>
                              {u.name} ({u.symbol})
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </>
                )}
                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: theme.primary, marginTop: 8 }, saving && { opacity: 0.6 }]}
                  onPress={handleSaveEdit}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#fff" /> : (
                    <Text style={styles.submitBtnText}>{locale === 'ar' ? 'حفظ' : 'Save'}</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  itemName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  itemSku: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
  totalStockCard: {
    margin: 16,
    borderRadius: 16,
    padding: 20,
  },
  totalStockContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  totalStockInfo: {
    flex: 1,
  },
  totalStockLabel: {
    fontSize: 13,
    marginBottom: 4,
  },
  totalStockValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  emptyCard: {
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
  },
  batchCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  batchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  batchNumberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  batchNumber: {
    fontSize: 15,
    fontWeight: '600',
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  stockValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  stockUnit: {
    fontSize: 12,
  },
  batchDetails: {
    gap: 8,
  },
  batchDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  batchDetailLabel: {
    fontSize: 13,
  },
  batchDetailValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  movementCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  movementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  movementTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  movementType: {
    fontSize: 15,
    fontWeight: '600',
  },
  movementQty: {
    fontSize: 16,
    fontWeight: '700',
  },
  movementDate: {
    fontSize: 12,
  },
  divideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  divideBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  divideModal: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  submitBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
