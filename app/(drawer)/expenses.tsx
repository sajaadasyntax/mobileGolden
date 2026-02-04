import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface ExpenseCategory {
  id: string;
  name: string;
  nameAr?: string;
  icon?: string;
  color?: string;
}

interface Expense {
  id: string;
  description: string;
  amountSdg: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  category?: ExpenseCategory;
}

const categoryIcons: Record<string, { icon: string; color: string }> = {
  utilities: { icon: 'flash', color: '#f59e0b' },
  rent: { icon: 'home', color: '#8b5cf6' },
  transportation: { icon: 'car', color: '#3b82f6' },
  salaries: { icon: 'people', color: '#10b981' },
  supplies: { icon: 'cube', color: '#ec4899' },
  maintenance: { icon: 'build', color: '#6366f1' },
  default: { icon: 'card', color: '#ef4444' },
};

export default function ExpensesScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    loadData();
  }, [user?.branchId]);

  const loadData = async () => {
    try {
      if (!user?.branchId) return;
      
      // Load expenses and categories in parallel
      const [expensesResult, categoriesResult] = await Promise.all([
        api.accounting.expenses.list(user.branchId, { pageSize: 50 }),
        api.accounting.expenses.categories.list().catch(() => []),
      ]);
      
      setExpenses(expensesResult?.data || expensesResult || []);
      setCategories(categoriesResult || []);
    } catch (error) {
      console.error('Failed to load expenses:', error);
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAddExpense = async () => {
    if (!selectedCategory) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'يرجى اختيار الفئة' : 'Please select a category');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'يرجى إدخال المبلغ' : 'Please enter a valid amount');
      return;
    }
    if (!description.trim()) {
      Alert.alert(t('error', locale), locale === 'ar' ? 'يرجى إدخال الوصف' : 'Please enter a description');
      return;
    }

    setSaving(true);
    try {
      await api.accounting.expenses.create({
        categoryId: selectedCategory.id,
        amountSdg: parseFloat(amount),
        description: description.trim(),
      });
      
      Alert.alert(
        locale === 'ar' ? 'نجاح' : 'Success',
        locale === 'ar' ? 'تم إضافة المصروف بنجاح' : 'Expense added successfully'
      );
      
      setShowAddModal(false);
      resetForm();
      await loadData();
    } catch (error: any) {
      Alert.alert(t('error', locale), error.message || 'Failed to add expense');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedCategory(null);
    setAmount('');
    setDescription('');
  };

  const getCategoryStyle = (category?: ExpenseCategory) => {
    const name = category?.name?.toLowerCase() || 'default';
    return categoryIcons[name] || categoryIcons.default;
  };

  const totalSDG = expenses.reduce((sum, e) => sum + Number(e.amountSdg), 0);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US').format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return { color: theme.success, label: locale === 'ar' ? 'موافق عليه' : 'Approved' };
      case 'REJECTED':
        return { color: theme.error, label: locale === 'ar' ? 'مرفوض' : 'Rejected' };
      default:
        return { color: theme.warning, label: locale === 'ar' ? 'قيد المراجعة' : 'Pending' };
    }
  };

  const renderExpense = ({ item }: { item: Expense }) => {
    const categoryStyle = getCategoryStyle(item.category);
    const statusBadge = getStatusBadge(item.status);
    
    return (
      <TouchableOpacity 
        style={[styles.expenseCard, { backgroundColor: theme.card }, isRtl && styles.expenseCardRtl]}
      >
        <View style={[styles.expenseIcon, { backgroundColor: categoryStyle.color + '15' }]}>
          <Ionicons name={categoryStyle.icon as any} size={24} color={categoryStyle.color} />
        </View>
        <View style={[styles.expenseContent, isRtl && styles.expenseContentRtl]}>
          <View style={[styles.expenseHeader, isRtl && styles.rowReverse]}>
            <Text style={[styles.expenseCategory, { color: theme.text }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? item.category?.nameAr || item.category?.name : item.category?.name || 'Uncategorized'}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusBadge.color + '20' }]}>
              <Text style={[styles.statusText, { color: statusBadge.color }]}>{statusBadge.label}</Text>
            </View>
          </View>
          <Text style={[styles.expenseDesc, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {item.description}
          </Text>
          <Text style={[styles.expenseDate, { color: theme.textMuted }, isRtl && styles.textRtl]}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
        <View style={[styles.amountContainer, isRtl && styles.amountContainerRtl]}>
          <Text style={[styles.amountValue, { color: theme.error }]}>
            -{formatAmount(Number(item.amountSdg))}
          </Text>
          <Text style={[styles.currencyText, { color: theme.textSecondary }]}>
            {locale === 'ar' ? 'ج.س' : 'SDG'}
          </Text>
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
      {/* Total Expenses */}
      <View style={[styles.summaryCard, { backgroundColor: theme.error + '15', borderColor: theme.error + '30' }]}>
        <Text style={[styles.summaryTitle, { color: theme.error }, isRtl && styles.textRtl]}>
          {locale === 'ar' ? 'إجمالي المصروفات' : 'Total Expenses'}
        </Text>
        <View style={styles.totalRow}>
          <View style={styles.totalItem}>
            <Text style={[styles.totalCurrency, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'ج.س' : 'SDG'}
            </Text>
            <Text style={[styles.totalValue, { color: theme.text }]}>{formatAmount(totalSDG)}</Text>
          </View>
        </View>
      </View>

      {/* Add Expense Button */}
      <TouchableOpacity 
        style={[styles.addButton, { backgroundColor: theme.primary }, isRtl && styles.addButtonRtl]}
        onPress={() => setShowAddModal(true)}
      >
        <Ionicons name="add" size={24} color="#fff" />
        <Text style={styles.addButtonText}>
          {locale === 'ar' ? 'إضافة مصروف' : 'Add Expense'}
        </Text>
      </TouchableOpacity>

      {/* Expenses List */}
      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        renderItem={renderExpense}
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
            <Ionicons name="card-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noData', locale)}</Text>
          </View>
        }
      />

      {/* Add Expense Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {locale === 'ar' ? 'إضافة مصروف جديد' : 'Add New Expense'}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Category Selection */}
              <Text style={[styles.inputLabel, { color: theme.text }, isRtl && styles.textRtl]}>
                {locale === 'ar' ? 'الفئة' : 'Category'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
                {categories.map((cat) => {
                  const style = getCategoryStyle(cat);
                  const isSelected = selectedCategory?.id === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryChip,
                        { backgroundColor: isSelected ? theme.primary : theme.backgroundSecondary },
                      ]}
                      onPress={() => setSelectedCategory(cat)}
                    >
                      <Ionicons 
                        name={style.icon as any} 
                        size={16} 
                        color={isSelected ? '#fff' : style.color} 
                      />
                      <Text style={[
                        styles.categoryChipText,
                        { color: isSelected ? '#fff' : theme.text }
                      ]}>
                        {locale === 'ar' ? cat.nameAr || cat.name : cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Amount Input */}
              <Text style={[styles.inputLabel, { color: theme.text, marginTop: 16 }, isRtl && styles.textRtl]}>
                {locale === 'ar' ? 'المبلغ (ج.س)' : 'Amount (SDG)'}
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border },
                  isRtl && styles.textInputRtl
                ]}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder={locale === 'ar' ? 'أدخل المبلغ' : 'Enter amount'}
                placeholderTextColor={theme.inputPlaceholder}
                textAlign={isRtl ? 'right' : 'left'}
              />

              {/* Description Input */}
              <Text style={[styles.inputLabel, { color: theme.text, marginTop: 16 }, isRtl && styles.textRtl]}>
                {locale === 'ar' ? 'الوصف' : 'Description'}
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  styles.textArea,
                  { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border },
                  isRtl && styles.textInputRtl
                ]}
                value={description}
                onChangeText={setDescription}
                placeholder={locale === 'ar' ? 'أدخل وصف المصروف' : 'Enter expense description'}
                placeholderTextColor={theme.inputPlaceholder}
                multiline
                numberOfLines={3}
                textAlign={isRtl ? 'right' : 'left'}
              />
            </ScrollView>

            {/* Actions */}
            <View style={[styles.modalActions, isRtl && styles.rowReverse]}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.border }]}
                onPress={() => { setShowAddModal(false); resetForm(); }}
              >
                <Text style={[styles.cancelButtonText, { color: theme.text }]}>
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: theme.primary }]}
                onPress={handleAddExpense}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {locale === 'ar' ? 'حفظ' : 'Save'}
                  </Text>
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryCard: {
    borderRadius: 20,
    padding: 20,
    margin: 16,
    borderWidth: 1,
  },
  summaryTitle: {
    fontSize: 14,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalItem: {
    alignItems: 'center',
  },
  totalCurrency: {
    fontSize: 14,
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 28,
    fontWeight: '700',
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
  addButtonRtl: {
    flexDirection: 'row-reverse',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  expenseCardRtl: {
    flexDirection: 'row-reverse',
  },
  expenseIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expenseContent: {
    flex: 1,
    marginLeft: 12,
  },
  expenseContentRtl: {
    marginLeft: 0,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  expenseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  expenseCategory: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '600',
  },
  expenseDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  expenseDate: {
    fontSize: 11,
    marginTop: 4,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amountContainerRtl: {
    alignItems: 'flex-start',
  },
  amountValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  currencyText: {
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalBody: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  categoriesScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    gap: 6,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  textInputRtl: {
    textAlign: 'right',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
