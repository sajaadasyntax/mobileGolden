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
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface Customer {
  id: string;
  name: string;
  nameAr?: string;
  phone?: string;
  email?: string;
  customerType: 'WHOLESALE' | 'RETAIL';
  creditLimitSdg: number;
  isActive: boolean;
}

export default function CustomersScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    nameAr: '',
    phone: '',
    customerType: 'RETAIL' as 'WHOLESALE' | 'RETAIL',
    creditLimitSdg: '0',
  });
  const [saving, setSaving] = useState(false);
  const isRtl = locale === 'ar';

  const loadCustomers = async () => {
    try {
      const result = await api.sales.customers.list();
      setCustomers(result?.result?.data?.data || result?.data || []);
    } catch (error) {
      console.error('Failed to load customers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCustomers();
    setRefreshing(false);
  };

  const handleAddCustomer = async () => {
    if (!newCustomer.name.trim()) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'يرجى إدخال اسم العميل' : 'Please enter customer name');
      return;
    }
    setSaving(true);
    try {
      await api.sales.customers.create({
        name: newCustomer.name,
        nameAr: newCustomer.nameAr || undefined,
        phone: newCustomer.phone || undefined,
        customerType: newCustomer.customerType,
        creditLimitSdg: parseFloat(newCustomer.creditLimitSdg) || 0,
      });
      setShowAddModal(false);
      setNewCustomer({
        name: '',
        nameAr: '',
        phone: '',
        customerType: 'RETAIL',
        creditLimitSdg: '0',
      });
      loadCustomers();
      Alert.alert(t('success', locale), locale === 'ar' ? 'تم إضافة العميل بنجاح' : 'Customer added successfully');
    } catch (error) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'فشل في إضافة العميل' : 'Failed to add customer');
    } finally {
      setSaving(false);
    }
  };

  const filteredCustomers = customers.filter((customer) => {
    const searchLower = search.toLowerCase();
    return (
      customer.name.toLowerCase().includes(searchLower) ||
      (customer.nameAr && customer.nameAr.includes(search)) ||
      (customer.phone && customer.phone.includes(search))
    );
  });

  const renderCustomer = ({ item }: { item: Customer }) => (
    <TouchableOpacity style={[styles.customerCard, { backgroundColor: theme.card }, isRtl && styles.customerCardRtl]}>
      <View style={[styles.customerIcon, { backgroundColor: '#8b5cf620' }]}>
        <Ionicons name="person" size={24} color="#8b5cf6" />
      </View>
      <View style={[styles.customerContent, isRtl && styles.customerContentRtl]}>
        <View style={[styles.customerHeader, isRtl && styles.customerHeaderRtl]}>
          <Text style={[styles.customerName, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' && item.nameAr ? item.nameAr : item.name}
          </Text>
          <View style={[
            styles.typeBadge, 
            item.customerType === 'WHOLESALE' ? styles.wholesaleBadge : styles.retailBadge
          ]}>
            <Text style={[
              styles.typeText,
              item.customerType === 'WHOLESALE' ? styles.wholesaleText : styles.retailText
            ]}>
              {item.customerType === 'WHOLESALE' ? t('wholesale', locale) : t('retail', locale)}
            </Text>
          </View>
        </View>
        {item.phone && (
          <View style={[styles.contactRow, isRtl && styles.contactRowRtl]}>
            <Ionicons name="call-outline" size={14} color={theme.textSecondary} />
            <Text style={[styles.contactText, { color: theme.textSecondary }]}>{item.phone}</Text>
          </View>
        )}
        <View style={[styles.creditRow, isRtl && styles.creditRowRtl]}>
          <Text style={[styles.creditLabel, { color: theme.textMuted }]}>{t('creditLimit', locale)}:</Text>
          <Text style={[styles.creditValue, { color: theme.textSecondary }]}>{Number(item.creditLimitSdg).toLocaleString()} {t('sdg', locale)}</Text>
        </View>
      </View>
      <View style={[styles.statusContainer, isRtl && styles.statusContainerRtl]}>
        <View style={[styles.statusDot, { backgroundColor: item.isActive ? theme.success : theme.error }]} />
        <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>
          {item.isActive ? (locale === 'ar' ? 'نشط' : 'Active') : (locale === 'ar' ? 'غير نشط' : 'Inactive')}
        </Text>
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
        <Text style={styles.addButtonText}>{t('addCustomer', locale)}</Text>
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

      {/* Customers List */}
      <FlatList
        data={filteredCustomers}
        keyExtractor={(item) => item.id}
        renderItem={renderCustomer}
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
            <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noData', locale)}</Text>
          </View>
        }
      />

      {/* Add Customer Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }, isRtl && styles.textRtl]}>{t('addCustomer', locale)}</Text>
            
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                {locale === 'ar' ? 'الاسم بالإنجليزية' : 'Name (English)'}
              </Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
                placeholder={locale === 'ar' ? 'الاسم بالإنجليزية' : 'Customer name'}
                placeholderTextColor={theme.inputPlaceholder}
                value={newCustomer.name}
                onChangeText={(text) => setNewCustomer({ ...newCustomer, name: text })}
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
                value={newCustomer.nameAr}
                onChangeText={(text) => setNewCustomer({ ...newCustomer, nameAr: text })}
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
                value={newCustomer.phone}
                onChangeText={(text) => setNewCustomer({ ...newCustomer, phone: text })}
                keyboardType="phone-pad"
                textAlign={isRtl ? 'right' : 'left'}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                {locale === 'ar' ? 'نوع العميل' : 'Customer Type'}
              </Text>
              <View style={[styles.typeSelector, isRtl && styles.typeSelectorRtl]}>
                <TouchableOpacity
                  style={[
                    styles.typeOption,
                    { borderColor: theme.border },
                    newCustomer.customerType === 'RETAIL' && { backgroundColor: theme.primary, borderColor: theme.primary }
                  ]}
                  onPress={() => setNewCustomer({ ...newCustomer, customerType: 'RETAIL' })}
                >
                  <Text style={[styles.typeOptionText, { color: newCustomer.customerType === 'RETAIL' ? '#fff' : theme.text }]}>
                    {t('retail', locale)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeOption,
                    { borderColor: theme.border },
                    newCustomer.customerType === 'WHOLESALE' && { backgroundColor: theme.primary, borderColor: theme.primary }
                  ]}
                  onPress={() => setNewCustomer({ ...newCustomer, customerType: 'WHOLESALE' })}
                >
                  <Text style={[styles.typeOptionText, { color: newCustomer.customerType === 'WHOLESALE' ? '#fff' : theme.text }]}>
                    {t('wholesale', locale)}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                {t('creditLimit', locale)} ({t('sdg', locale)})
              </Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
                placeholder="0"
                placeholderTextColor={theme.inputPlaceholder}
                value={newCustomer.creditLimitSdg}
                onChangeText={(text) => setNewCustomer({ ...newCustomer, creditLimitSdg: text })}
                keyboardType="numeric"
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
                onPress={handleAddCustomer}
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
    backgroundColor: '#8b5cf6',
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
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  customerCardRtl: {
    flexDirection: 'row-reverse',
  },
  customerIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerContent: {
    flex: 1,
    marginLeft: 12,
  },
  customerContentRtl: {
    marginLeft: 0,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customerHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  wholesaleBadge: {
    backgroundColor: '#3b82f620',
  },
  retailBadge: {
    backgroundColor: '#f59e0b20',
  },
  typeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  wholesaleText: {
    color: '#3b82f6',
  },
  retailText: {
    color: '#f59e0b',
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
  creditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  creditRowRtl: {
    flexDirection: 'row-reverse',
  },
  creditLabel: {
    fontSize: 11,
  },
  creditValue: {
    fontSize: 11,
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
  statusLabel: {
    fontSize: 10,
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
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  typeSelectorRtl: {
    flexDirection: 'row-reverse',
  },
  typeOption: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeOptionText: {
    fontSize: 14,
    fontWeight: '600',
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
    backgroundColor: '#8b5cf6',
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
