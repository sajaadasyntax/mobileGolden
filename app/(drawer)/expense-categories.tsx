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
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

interface ExpenseCategory {
  id: string;
  name: string;
  nameAr: string;
  isActive: boolean;
}

export default function ExpenseCategoriesScreen() {
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user: currentUser } = useAuthStore();
  const isRtl = locale === 'ar';

  useEffect(() => {
    if (currentUser && currentUser.role !== 'ADMIN' && currentUser.role !== 'MANAGER') {
      router.replace('/(drawer)/dashboard');
    }
  }, [currentUser]);

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(true);

  const [newCategory, setNewCategory] = useState({ name: '', nameAr: '' });
  const [editCategory, setEditCategory] = useState({ name: '', nameAr: '', isActive: true });

  useEffect(() => {
    if (currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER') {
      loadCategories();
    }
  }, [currentUser, includeInactive]);

  const loadCategories = async () => {
    try {
      const data = await api.accounting.expenses.categories.list({ includeInactive });
      setCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load expense categories:', error);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCategories();
    setRefreshing(false);
  };

  const handleAddCategory = async () => {
    if (!newCategory.name.trim() || !newCategory.nameAr.trim()) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'يرجى ملء جميع الحقول' : 'Please fill all fields'
      );
      return;
    }
    setSaving(true);
    try {
      await api.accounting.expenses.categories.create(newCategory);
      setShowAddModal(false);
      setNewCategory({ name: '', nameAr: '' });
      loadCategories();
      Alert.alert(
        locale === 'ar' ? 'نجح' : 'Success',
        locale === 'ar' ? 'تم إضافة تصنيف المصروف بنجاح' : 'Expense category added successfully'
      );
    } catch (error: any) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        error?.message || (locale === 'ar' ? 'فشل في الإضافة' : 'Failed to add')
      );
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (cat: ExpenseCategory) => {
    setSelectedCategory(cat);
    setEditCategory({
      name: cat.name,
      nameAr: cat.nameAr,
      isActive: cat.isActive,
    });
    setShowEditModal(true);
  };

  const handleEditCategory = async () => {
    if (!selectedCategory) return;
    if (!editCategory.name.trim() || !editCategory.nameAr.trim()) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'يرجى ملء جميع الحقول' : 'Please fill all fields'
      );
      return;
    }
    setSaving(true);
    try {
      await api.accounting.expenses.categories.update({
        id: selectedCategory.id,
        name: editCategory.name.trim(),
        nameAr: editCategory.nameAr.trim(),
        isActive: editCategory.isActive,
      });
      setShowEditModal(false);
      loadCategories();
      Alert.alert(
        locale === 'ar' ? 'نجح' : 'Success',
        locale === 'ar' ? 'تم تحديث تصنيف المصروف بنجاح' : 'Expense category updated successfully'
      );
    } catch (error: any) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        error?.message || (locale === 'ar' ? 'فشل في التحديث' : 'Failed to update')
      );
    } finally {
      setSaving(false);
    }
  };

  if (currentUser?.role !== 'ADMIN' && currentUser?.role !== 'MANAGER') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <Ionicons name="lock-closed" size={48} color={theme.textSecondary} />
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          {locale === 'ar' ? 'غير مصرح لك بالوصول' : 'Access Denied'}
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const renderItem = ({ item }: { item: ExpenseCategory }) => (
    <View style={[styles.card, { backgroundColor: theme.card }, !item.isActive && styles.cardDisabled]}>
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: theme.text }, isRtl && styles.textRtl]}>
          {locale === 'ar' ? item.nameAr : item.name}
        </Text>
        {!item.isActive && (
          <View style={[styles.inactiveBadge, { backgroundColor: theme.error + '20' }]}>
            <Text style={[styles.inactiveText, { color: theme.error }]}>
              {locale === 'ar' ? 'معطل' : 'Inactive'}
            </Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: theme.primary + '15' }]}
        onPress={() => openEditModal(item)}
      >
        <Ionicons name="create-outline" size={20} color={theme.primary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.surface }]}>
        <Text style={[styles.headerTitle, { color: theme.text }, isRtl && styles.textRtl]}>
          {locale === 'ar' ? 'تصنيفات المصروفات' : 'Expense Categories'}
        </Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.toggleButton, { backgroundColor: includeInactive ? theme.primary + '30' : theme.input }]}
            onPress={() => setIncludeInactive(!includeInactive)}
          >
            <Text style={[styles.toggleText, { color: includeInactive ? theme.primary : theme.textSecondary }]}>
              {locale === 'ar' ? 'كل' : 'All'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: theme.primary }]}
            onPress={() => setShowAddModal(true)}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="pricetag-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'لا توجد تصنيفات مصروفات' : 'No expense categories'}
            </Text>
          </View>
        }
      />

      {/* Add Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={40}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {locale === 'ar' ? 'إضافة تصنيف مصروف' : 'Add Expense Category'}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'} *
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={newCategory.name}
                onChangeText={(text) => setNewCategory({ ...newCategory, name: text })}
                placeholder="Office Supplies"
                placeholderTextColor={theme.inputPlaceholder}
              />
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'} *
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={newCategory.nameAr}
                onChangeText={(text) => setNewCategory({ ...newCategory, nameAr: text })}
                placeholder="مستلزمات مكتبية"
                placeholderTextColor={theme.inputPlaceholder}
                textAlign={isRtl ? 'right' : 'left'}
              />
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }, saving && styles.submitButtonDisabled]}
                onPress={handleAddCategory}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>{locale === 'ar' ? 'إضافة' : 'Add'}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={40}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {locale === 'ar' ? 'تعديل تصنيف المصروف' : 'Edit Expense Category'}
              </Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'} *
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={editCategory.name}
                onChangeText={(text) => setEditCategory({ ...editCategory, name: text })}
                placeholder="Office Supplies"
                placeholderTextColor={theme.inputPlaceholder}
              />
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'} *
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={editCategory.nameAr}
                onChangeText={(text) => setEditCategory({ ...editCategory, nameAr: text })}
                placeholder="مستلزمات مكتبية"
                placeholderTextColor={theme.inputPlaceholder}
                textAlign={isRtl ? 'right' : 'left'}
              />
              <TouchableOpacity
                style={[
                  styles.toggleRow,
                  { backgroundColor: theme.input, borderColor: theme.inputBorder },
                ]}
                onPress={() => setEditCategory({ ...editCategory, isActive: !editCategory.isActive })}
              >
                <Text style={[styles.toggleRowText, { color: theme.text }]}>
                  {locale === 'ar' ? 'نشط' : 'Active'}
                </Text>
                <Ionicons
                  name={editCategory.isActive ? 'checkmark-circle' : 'close-circle'}
                  size={24}
                  color={editCategory.isActive ? theme.success : theme.error}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }, saving && styles.submitButtonDisabled]}
                onPress={handleEditCategory}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>{locale === 'ar' ? 'حفظ' : 'Save'}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 24, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleText: { fontSize: 14, fontWeight: '600' },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: { padding: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardDisabled: { opacity: 0.7 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  inactiveBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  inactiveText: { fontSize: 10, fontWeight: '600' },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, marginTop: 12 },
  textRtl: { textAlign: 'right' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
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
  rowReverse: { flexDirection: 'row-reverse' },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalBody: { padding: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
  },
  toggleRowText: { fontSize: 15, fontWeight: '500' },
  submitButton: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
