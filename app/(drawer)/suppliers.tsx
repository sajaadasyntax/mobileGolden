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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface Supplier {
  id: string;
  name: string;
  nameAr?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
}

export default function SuppliersScreen() {
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    nameAr: '',
    phone: '',
    email: '',
  });
  const [saving, setSaving] = useState(false);
  const isRtl = locale === 'ar';

  const loadSuppliers = async () => {
    try {
      const result = await api.procurement.suppliers.list();
      setSuppliers(result?.result?.data?.data || result?.data || []);
    } catch (error) {
      console.error('Failed to load suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSuppliers();
    setRefreshing(false);
  };

  const handleAddSupplier = async () => {
    if (!newSupplier.name.trim()) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'يرجى إدخال اسم المورد' : 'Please enter supplier name');
      return;
    }
    setSaving(true);
    try {
      await api.procurement.suppliers.create({
        name: newSupplier.name,
        nameAr: newSupplier.nameAr || undefined,
        phone: newSupplier.phone || undefined,
        email: newSupplier.email || undefined,
      });
      setShowAddModal(false);
      setNewSupplier({ name: '', nameAr: '', phone: '', email: '' });
      loadSuppliers();
      Alert.alert(t('success', locale), locale === 'ar' ? 'تم إضافة المورد بنجاح' : 'Supplier added successfully');
    } catch (error) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'فشل في إضافة المورد' : 'Failed to add supplier');
    } finally {
      setSaving(false);
    }
  };

  const filteredSuppliers = suppliers.filter((supplier) => {
    const searchLower = search.toLowerCase();
    return (
      supplier.name.toLowerCase().includes(searchLower) ||
      (supplier.nameAr && supplier.nameAr.includes(search)) ||
      (supplier.phone && supplier.phone.includes(search))
    );
  });

  const renderSupplier = ({ item }: { item: Supplier }) => (
    <TouchableOpacity 
      style={[styles.supplierCard, { backgroundColor: theme.card }, isRtl && styles.supplierCardRtl]}
      onPress={() => router.push({ pathname: '/supplier-detail', params: { id: item.id } })}
    >
        <View style={[styles.supplierIcon, { backgroundColor: '#3b82f620' }]}>
          <Ionicons name="business" size={24} color="#3b82f6" />
        </View>
        <View style={[styles.supplierContent, isRtl && styles.supplierContentRtl]}>
          <View style={[styles.supplierHeader, isRtl && styles.supplierHeaderRtl]}>
            <Text style={[styles.supplierName, { color: theme.text }, isRtl && styles.textRtl]}>
              {locale === 'ar' && item.nameAr ? item.nameAr : item.name}
            </Text>
            <View style={[styles.statusBadge, item.isActive ? styles.activeBadge : styles.inactiveBadge]}>
              <Text style={[styles.statusText, { color: item.isActive ? theme.success : theme.error }]}>
                {item.isActive ? t('active', locale) : t('inactive', locale)}
              </Text>
            </View>
          </View>
          {item.phone && (
            <View style={[styles.contactRow, isRtl && styles.contactRowRtl]}>
              <Ionicons name="call-outline" size={14} color={theme.textSecondary} />
              <Text style={[styles.contactText, { color: theme.textSecondary }]}>{item.phone}</Text>
            </View>
          )}
          {item.email && (
            <View style={[styles.contactRow, isRtl && styles.contactRowRtl]}>
              <Ionicons name="mail-outline" size={14} color={theme.textSecondary} />
              <Text style={[styles.contactText, { color: theme.textSecondary }]}>{item.email}</Text>
            </View>
          )}
        </View>
        <View style={[styles.statusContainer, isRtl && styles.statusContainerRtl]}>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </View>
      </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Add Button */}
      <TouchableOpacity 
        style={[styles.addButton, isRtl && styles.addButtonRtl]}
        onPress={() => setShowAddModal(true)}
      >
        <Ionicons name="add" size={24} color="#fff" />
        <Text style={styles.addButtonText}>{t('addSupplier', locale)}</Text>
      </TouchableOpacity>

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

      {/* Suppliers List */}
      <FlatList
        data={filteredSuppliers}
        keyExtractor={(item) => item.id}
        renderItem={renderSupplier}
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
            <Ionicons name="business-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noData', locale)}</Text>
          </View>
        }
      />

      {/* Add Supplier Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }, isRtl && styles.textRtl]}>{t('addSupplier', locale)}</Text>
            
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                {locale === 'ar' ? 'الاسم بالإنجليزية' : 'Name (English)'}
              </Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
                placeholder={locale === 'ar' ? 'اسم المورد' : 'Supplier name'}
                placeholderTextColor={theme.inputPlaceholder}
                value={newSupplier.name}
                onChangeText={(text) => setNewSupplier({ ...newSupplier, name: text })}
                textAlign={isRtl ? 'right' : 'left'}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                {locale === 'ar' ? 'الاسم بالعربية' : 'Name (Arabic)'}
              </Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
                placeholder={locale === 'ar' ? 'الاسم بالعربية' : 'Arabic name'}
                placeholderTextColor={theme.inputPlaceholder}
                value={newSupplier.nameAr}
                onChangeText={(text) => setNewSupplier({ ...newSupplier, nameAr: text })}
                textAlign="right"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                {locale === 'ar' ? 'رقم الهاتف' : 'Phone'}
              </Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
                placeholder="+249..."
                placeholderTextColor={theme.inputPlaceholder}
                value={newSupplier.phone}
                onChangeText={(text) => setNewSupplier({ ...newSupplier, phone: text })}
                keyboardType="phone-pad"
                textAlign={isRtl ? 'right' : 'left'}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                {locale === 'ar' ? 'البريد الإلكتروني' : 'Email'}
              </Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
                placeholder="email@example.com"
                placeholderTextColor={theme.inputPlaceholder}
                value={newSupplier.email}
                onChangeText={(text) => setNewSupplier({ ...newSupplier, email: text })}
                keyboardType="email-address"
                autoCapitalize="none"
                textAlign={isRtl ? 'right' : 'left'}
              />
            </View>

            <View style={[styles.modalButtons, isRtl && styles.modalButtonsRtl]}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.backgroundTertiary }]}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>{t('cancel', locale)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmModalButton]}
                onPress={handleAddSupplier}
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
        </View>
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  addButtonRtl: {
    flexDirection: 'row-reverse',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
  supplierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  supplierCardRtl: {
    flexDirection: 'row-reverse',
  },
  supplierIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  supplierContent: {
    flex: 1,
    marginLeft: 12,
  },
  supplierContentRtl: {
    marginLeft: 0,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  supplierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  supplierHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  supplierName: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeBadge: {
    backgroundColor: '#10b98120',
  },
  inactiveBadge: {
    backgroundColor: '#ef444420',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  contactRowRtl: {
    flexDirection: 'row-reverse',
  },
  contactText: {
    fontSize: 12,
  },
  statusContainer: {
    alignItems: 'center',
    gap: 4,
  },
  statusContainerRtl: {
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 20,
    padding: 24,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  modalInput: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButtonsRtl: {
    flexDirection: 'row-reverse',
  },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmModalButton: {
    backgroundColor: '#3b82f6',
  },
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
