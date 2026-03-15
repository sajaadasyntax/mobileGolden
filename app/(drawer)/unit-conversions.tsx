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

interface UnitConversion {
  id: string;
  fromUnitId: string;
  toUnitId: string;
  factor: number;
  fromUnit?: { name: string; nameAr: string; symbol: string };
  toUnit?: { name: string; nameAr: string; symbol: string };
}

export default function UnitConversionsScreen() {
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';

  useEffect(() => {
    if (user && user.role !== 'ADMIN' && user.role !== 'MANAGER') {
      router.replace('/(drawer)/dashboard');
    }
  }, [user]);

  const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string; symbol: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newConversion, setNewConversion] = useState({ fromUnitId: '', toUnitId: '', factor: '' });

  useEffect(() => {
    if (user?.role === 'ADMIN' || user?.role === 'MANAGER') {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const [convData, unitsData] = await Promise.all([
        api.inventory.unitConversions.list(),
        api.inventory.units.list(),
      ]);
      setConversions(Array.isArray(convData) ? convData : []);
      setUnits(Array.isArray(unitsData) ? unitsData : []);
      if (Array.isArray(unitsData) && unitsData.length >= 2) {
        if (!newConversion.fromUnitId) setNewConversion((p) => ({ ...p, fromUnitId: unitsData[0].id }));
        if (!newConversion.toUnitId) setNewConversion((p) => ({ ...p, toUnitId: unitsData[1].id }));
      }
    } catch (error) {
      console.error('Failed to load unit conversions:', error);
      setConversions([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAdd = async () => {
    if (!newConversion.fromUnitId || !newConversion.toUnitId || !newConversion.factor.trim()) {
      Alert.alert(locale === 'ar' ? 'خطأ' : 'Error', locale === 'ar' ? 'يرجى ملء جميع الحقول' : 'Please fill all fields');
      return;
    }
    const factor = parseFloat(newConversion.factor);
    if (isNaN(factor) || factor <= 0) {
      Alert.alert(locale === 'ar' ? 'خطأ' : 'Error', locale === 'ar' ? 'العامل يجب أن يكون رقماً موجباً' : 'Factor must be a positive number');
      return;
    }
    if (newConversion.fromUnitId === newConversion.toUnitId) {
      Alert.alert(locale === 'ar' ? 'خطأ' : 'Error', locale === 'ar' ? 'الوحدة المصدر والهدف يجب أن تكونا مختلفتين' : 'From and to unit must differ');
      return;
    }
    setSaving(true);
    try {
      await api.inventory.unitConversions.create({
        fromUnitId: newConversion.fromUnitId,
        toUnitId: newConversion.toUnitId,
        factor,
      });
      setShowAddModal(false);
      setNewConversion({ fromUnitId: '', toUnitId: '', factor: '' });
      loadData();
      Alert.alert(locale === 'ar' ? 'نجح' : 'Success', locale === 'ar' ? 'تم إضافة قاعدة التحويل' : 'Conversion rule added');
    } catch (error: any) {
      Alert.alert(locale === 'ar' ? 'خطأ' : 'Error', error?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  if (user?.role !== 'ADMIN' && user?.role !== 'MANAGER') {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <Ionicons name="lock-closed" size={48} color={theme.textSecondary} />
        <Text style={{ color: theme.textSecondary, marginTop: 12 }}>{locale === 'ar' ? 'غير مصرح' : 'Access Denied'}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.surface }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{locale === 'ar' ? 'قواعد تحويل الوحدات' : 'Unit Conversion Rules'}</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.primary }]} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={conversions}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        renderItem={({ item }) => {
          const from = item.fromUnit ? (isRtl ? item.fromUnit.nameAr : item.fromUnit.name) : '?';
          const to = item.toUnit ? (isRtl ? item.toUnit.nameAr : item.toUnit.name) : '?';
          return (
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardText, { color: theme.text }]}>1 {from} = {Number(item.factor)} {to}</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="swap-horizontal-outline" size={48} color={theme.textSecondary} />
            <Text style={{ color: theme.textSecondary, marginTop: 12 }}>{locale === 'ar' ? 'لا توجد قواعد' : 'No conversion rules'}</Text>
          </View>
        }
      />
      <Modal visible={showAddModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{locale === 'ar' ? 'إضافة قاعدة تحويل' : 'Add Conversion'}</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: theme.textSecondary }]}>{locale === 'ar' ? 'من وحدة' : 'From Unit'}</Text>
              {units.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  onPress={() => setNewConversion((p) => ({ ...p, fromUnitId: u.id }))}
                  style={[styles.option, { backgroundColor: newConversion.fromUnitId === u.id ? theme.primary + '30' : theme.input }]}
                >
                  <Text style={{ color: newConversion.fromUnitId === u.id ? theme.primary : theme.text }}>{u.name} ({u.symbol})</Text>
                  {newConversion.fromUnitId === u.id && <Ionicons name="checkmark-circle" size={20} color={theme.primary} />}
                </TouchableOpacity>
              ))}
              <Text style={[styles.label, { color: theme.textSecondary, marginTop: 16 }]}>{locale === 'ar' ? 'إلى وحدة' : 'To Unit'}</Text>
              {units.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  onPress={() => setNewConversion((p) => ({ ...p, toUnitId: u.id }))}
                  style={[styles.option, { backgroundColor: newConversion.toUnitId === u.id ? theme.primary + '30' : theme.input }]}
                >
                  <Text style={{ color: newConversion.toUnitId === u.id ? theme.primary : theme.text }}>{u.name} ({u.symbol})</Text>
                  {newConversion.toUnitId === u.id && <Ionicons name="checkmark-circle" size={20} color={theme.primary} />}
                </TouchableOpacity>
              ))}
              <Text style={[styles.label, { color: theme.textSecondary, marginTop: 16 }]}>{locale === 'ar' ? 'العامل (1 من = عامل × إلى)' : 'Factor (1 from = factor × to)'}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={newConversion.factor}
                onChangeText={(t) => setNewConversion((p) => ({ ...p, factor: t }))}
                placeholder="2"
                placeholderTextColor={theme.inputPlaceholder}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity style={[styles.submit, { backgroundColor: theme.primary }, saving && { opacity: 0.6 }]} onPress={handleAdd} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{locale === 'ar' ? 'إضافة' : 'Add'}</Text>}
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 24, fontWeight: '700' },
  addBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 100 },
  card: { padding: 16, borderRadius: 12, marginBottom: 12 },
  cardText: { fontSize: 16 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 400, borderRadius: 20, overflow: 'hidden', maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalBody: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16 },
  submit: { marginTop: 24, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
