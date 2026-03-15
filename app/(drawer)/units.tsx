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

interface Unit {
  id: string;
  name: string;
  nameAr: string;
  symbol: string;
}

export default function UnitsScreen() {
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user: currentUser } = useAuthStore();
  const isRtl = locale === 'ar';

  useEffect(() => {
    if (currentUser && !['ADMIN', 'MANAGER', 'PROCUREMENT'].includes(currentUser.role)) {
      router.replace('/(drawer)/dashboard');
    }
  }, [currentUser]);

  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [saving, setSaving] = useState(false);

  const [newUnit, setNewUnit] = useState({ name: '', nameAr: '', symbol: '' });
  const [editUnit, setEditUnit] = useState({ name: '', nameAr: '', symbol: '' });

  useEffect(() => {
    if (['ADMIN', 'MANAGER', 'PROCUREMENT'].includes(currentUser?.role || '')) {
      loadUnits();
    }
  }, [currentUser]);

  const loadUnits = async () => {
    try {
      const data = await api.inventory.units.list();
      setUnits(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load units:', error);
      setUnits([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUnits();
    setRefreshing(false);
  };

  const handleAddUnit = async () => {
    if (!newUnit.name.trim() || !newUnit.nameAr.trim() || !newUnit.symbol.trim()) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'يرجى ملء جميع الحقول' : 'Please fill all fields'
      );
      return;
    }
    setSaving(true);
    try {
      await api.inventory.units.create(newUnit);
      setShowAddModal(false);
      setNewUnit({ name: '', nameAr: '', symbol: '' });
      loadUnits();
      Alert.alert(
        locale === 'ar' ? 'نجح' : 'Success',
        locale === 'ar' ? 'تم إضافة الوحدة بنجاح' : 'Unit added successfully'
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

  const openEditModal = (unit: Unit) => {
    setSelectedUnit(unit);
    setEditUnit({ name: unit.name, nameAr: unit.nameAr, symbol: unit.symbol });
    setShowEditModal(true);
  };

  const handleEditUnit = async () => {
    if (!selectedUnit) return;
    if (!editUnit.name.trim() || !editUnit.nameAr.trim() || !editUnit.symbol.trim()) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'يرجى ملء جميع الحقول' : 'Please fill all fields'
      );
      return;
    }
    setSaving(true);
    try {
      await api.inventory.units.update({
        id: selectedUnit.id,
        name: editUnit.name.trim(),
        nameAr: editUnit.nameAr.trim(),
        symbol: editUnit.symbol.trim(),
      });
      setShowEditModal(false);
      loadUnits();
      Alert.alert(
        locale === 'ar' ? 'نجح' : 'Success',
        locale === 'ar' ? 'تم تحديث الوحدة بنجاح' : 'Unit updated successfully'
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

  if (currentUser?.role !== 'ADMIN' && currentUser?.role !== 'MANAGER' && currentUser?.role !== 'PROCUREMENT') {
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

  const renderItem = ({ item }: { item: Unit }) => (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: theme.text }, isRtl && styles.textRtl]}>
          {locale === 'ar' ? item.nameAr : item.name}
        </Text>
        <Text style={[styles.cardSubtitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
          {item.symbol}
        </Text>
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
          {locale === 'ar' ? 'الوحدات' : 'Units'}
        </Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={() => setShowAddModal(true)}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={units}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="scale-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {locale === 'ar' ? 'لا توجد وحدات' : 'No units'}
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
                {locale === 'ar' ? 'إضافة وحدة' : 'Add Unit'}
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
                value={newUnit.name}
                onChangeText={(text) => setNewUnit({ ...newUnit, name: text })}
                placeholder="Kilogram"
                placeholderTextColor={theme.inputPlaceholder}
              />
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'} *
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={newUnit.nameAr}
                onChangeText={(text) => setNewUnit({ ...newUnit, nameAr: text })}
                placeholder="كيلوغرام"
                placeholderTextColor={theme.inputPlaceholder}
                textAlign={isRtl ? 'right' : 'left'}
              />
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'الرمز' : 'Symbol'} *
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={newUnit.symbol}
                onChangeText={(text) => setNewUnit({ ...newUnit, symbol: text })}
                placeholder="kg"
                placeholderTextColor={theme.inputPlaceholder}
              />
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }, saving && styles.submitButtonDisabled]}
                onPress={handleAddUnit}
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
                {locale === 'ar' ? 'تعديل الوحدة' : 'Edit Unit'}
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
                value={editUnit.name}
                onChangeText={(text) => setEditUnit({ ...editUnit, name: text })}
                placeholder="Kilogram"
                placeholderTextColor={theme.inputPlaceholder}
              />
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'} *
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={editUnit.nameAr}
                onChangeText={(text) => setEditUnit({ ...editUnit, nameAr: text })}
                placeholder="كيلوغرام"
                placeholderTextColor={theme.inputPlaceholder}
                textAlign={isRtl ? 'right' : 'left'}
              />
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'الرمز' : 'Symbol'} *
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={editUnit.symbol}
                onChangeText={(text) => setEditUnit({ ...editUnit, symbol: text })}
                placeholder="kg"
                placeholderTextColor={theme.inputPlaceholder}
              />
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }, saving && styles.submitButtonDisabled]}
                onPress={handleEditUnit}
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
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSubtitle: { fontSize: 13, marginTop: 2 },
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
