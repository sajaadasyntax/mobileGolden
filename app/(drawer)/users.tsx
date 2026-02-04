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
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  nameAr?: string;
  role: 'ADMIN' | 'MANAGER' | 'WAREHOUSE_SALES' | 'SHELF_SALES' | 'PROCUREMENT' | 'ACCOUNTANT';
  branchId: string;
  branch?: {
    id: string;
    name: string;
    nameAr: string;
  };
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

const roleLabels: Record<string, { en: string; ar: string; color: string }> = {
  ADMIN: { en: 'Admin', ar: 'مدير', color: '#ef4444' },
  MANAGER: { en: 'Manager', ar: 'مدير', color: '#f59e0b' },
  WAREHOUSE_SALES: { en: 'Warehouse Sales', ar: 'مبيعات مخزن', color: '#3b82f6' },
  SHELF_SALES: { en: 'Shelf Sales', ar: 'مبيعات رف', color: '#10b981' },
  PROCUREMENT: { en: 'Procurement', ar: 'مشتريات', color: '#8b5cf6' },
  ACCOUNTANT: { en: 'Accountant', ar: 'محاسب', color: '#ec4899' },
};

export default function UsersScreen() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user: currentUser } = useAuthStore();
  const isRtl = locale === 'ar';
  
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    name: '',
    nameAr: '',
    role: 'SHELF_SALES' as 'MANAGER' | 'WAREHOUSE_SALES' | 'SHELF_SALES' | 'PROCUREMENT' | 'ACCOUNTANT',
  });

  useEffect(() => {
    if (currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER') {
      loadUsers();
    }
  }, [currentUser]);

  const loadUsers = async () => {
    try {
      const result = await api.users.list({ 
        pageSize: 100,
      });
      setUsers(result?.data || result || []);
    } catch (error) {
      console.error('Failed to load users:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  };

  const handleAddUser = async () => {
    if (!newUser.email.trim() || !newUser.password.trim() || !newUser.name.trim()) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields'
      );
      return;
    }

    if (newUser.password.length < 6) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters'
      );
      return;
    }

    setSaving(true);
    try {
      await api.users.create(newUser);
      setShowAddModal(false);
      setNewUser({
        email: '',
        password: '',
        name: '',
        nameAr: '',
        role: 'SHELF_SALES',
      });
      loadUsers();
      Alert.alert(
        locale === 'ar' ? 'نجح' : 'Success',
        locale === 'ar' ? 'تم إضافة المستخدم بنجاح' : 'User created successfully'
      );
    } catch (error: any) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        error?.message || (locale === 'ar' ? 'فشل في إضافة المستخدم' : 'Failed to create user')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    const action = user.isActive 
      ? (locale === 'ar' ? 'تعطيل' : 'disable')
      : (locale === 'ar' ? 'تفعيل' : 'enable');
    
    Alert.alert(
      locale === 'ar' ? 'تأكيد' : 'Confirm',
      locale === 'ar' 
        ? `هل أنت متأكد من ${action} هذا المستخدم؟`
        : `Are you sure you want to ${action} this user?`,
      [
        { text: locale === 'ar' ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: locale === 'ar' ? 'تأكيد' : 'Confirm',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.users.update({
                id: user.id,
                isActive: !user.isActive,
              });
              loadUsers();
              Alert.alert(
                locale === 'ar' ? 'نجح' : 'Success',
                locale === 'ar' 
                  ? `تم ${action} المستخدم بنجاح`
                  : `User ${action}d successfully`
              );
            } catch (error: any) {
              Alert.alert(
                locale === 'ar' ? 'خطأ' : 'Error',
                error?.message || (locale === 'ar' ? 'فشلت العملية' : 'Operation failed')
              );
            }
          },
        },
      ]
    );
  };

  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const query = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query) ||
      (u.nameAr && u.nameAr.toLowerCase().includes(query))
    );
  });

  const getRoleLabel = (role: string) => {
    const label = roleLabels[role] || { en: role, ar: role, color: theme.textSecondary };
    return locale === 'ar' ? label.ar : label.en;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderUser = ({ item }: { item: User }) => {
    const roleLabel = roleLabels[item.role] || { color: theme.textSecondary };
    
    return (
      <View style={[styles.userCard, { backgroundColor: theme.card }, !item.isActive && styles.userCardDisabled]}>
        <View style={[styles.userIcon, { backgroundColor: roleLabel.color + '15' }]}>
          <Ionicons name="person" size={24} color={roleLabel.color} />
        </View>
        
        <View style={[styles.userContent, isRtl && styles.userContentRtl]}>
          <View style={styles.userHeader}>
            <Text style={[styles.userName, { color: theme.text }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? item.nameAr || item.name : item.name}
            </Text>
            {!item.isActive && (
              <View style={[styles.inactiveBadge, { backgroundColor: theme.error + '20' }]}>
                <Text style={[styles.inactiveText, { color: theme.error }]}>
                  {locale === 'ar' ? 'معطل' : 'Inactive'}
                </Text>
              </View>
            )}
          </View>
          
          <Text style={[styles.userEmail, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {item.email}
          </Text>
          
          <View style={[styles.userMeta, isRtl && styles.userMetaRtl]}>
            <View style={[styles.roleBadge, { backgroundColor: roleLabel.color + '20' }]}>
              <Text style={[styles.roleText, { color: roleLabel.color }]}>
                {getRoleLabel(item.role)}
              </Text>
            </View>
            {item.branch && (
              <Text style={[styles.branchText, { color: theme.textMuted }, isRtl && styles.textRtl]}>
                {locale === 'ar' ? item.branch.nameAr : item.branch.name}
              </Text>
            )}
          </View>
          
          {item.lastLoginAt && (
            <Text style={[styles.lastLogin, { color: theme.textMuted }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'آخر تسجيل دخول: ' : 'Last login: '}
              {formatDate(item.lastLoginAt)}
            </Text>
          )}
        </View>
        
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: item.isActive ? theme.error + '15' : theme.success + '15' }]}
          onPress={() => handleToggleActive(item)}
        >
          <Ionicons 
            name={item.isActive ? 'ban' : 'checkmark-circle'} 
            size={20} 
            color={item.isActive ? theme.error : theme.success} 
          />
        </TouchableOpacity>
      </View>
    );
  };

  // Only show for admin/manager
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header with Add Button */}
      <View style={[styles.header, { backgroundColor: theme.surface }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'المستخدمون' : 'Users'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
            {users.length} {locale === 'ar' ? 'مستخدم' : 'users'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={() => setShowAddModal(true)}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

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

      {/* Users List */}
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        renderItem={renderUser}
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
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {search
                ? (locale === 'ar' ? 'لا توجد نتائج' : 'No results found')
                : (locale === 'ar' ? 'لا يوجد مستخدمون' : 'No users')}
            </Text>
          </View>
        }
      />

      {/* Add User Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {locale === 'ar' ? 'إضافة مستخدم جديد' : 'Add New User'}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Email */}
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                {locale === 'ar' ? 'البريد الإلكتروني' : 'Email'} *
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={newUser.email}
                onChangeText={(text) => setNewUser({ ...newUser, email: text })}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="user@example.com"
                placeholderTextColor={theme.inputPlaceholder}
              />

              {/* Password */}
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'كلمة المرور' : 'Password'} *
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={newUser.password}
                onChangeText={(text) => setNewUser({ ...newUser, password: text })}
                secureTextEntry
                placeholder={locale === 'ar' ? '6 أحرف على الأقل' : 'At least 6 characters'}
                placeholderTextColor={theme.inputPlaceholder}
              />

              {/* Name */}
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'} *
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={newUser.name}
                onChangeText={(text) => setNewUser({ ...newUser, name: text })}
                placeholder="John Doe"
                placeholderTextColor={theme.inputPlaceholder}
              />

              {/* Name Arabic */}
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={newUser.nameAr}
                onChangeText={(text) => setNewUser({ ...newUser, nameAr: text })}
                placeholder="جون دو"
                placeholderTextColor={theme.inputPlaceholder}
                textAlign={isRtl ? 'right' : 'left'}
              />

              {/* Role */}
              <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                {locale === 'ar' ? 'الدور' : 'Role'} *
              </Text>
              <View style={styles.roleButtons}>
                {(['MANAGER', 'WAREHOUSE_SALES', 'SHELF_SALES', 'PROCUREMENT', 'ACCOUNTANT'] as const).map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[
                      styles.roleButton,
                      { 
                        backgroundColor: newUser.role === role ? theme.primary + '20' : theme.input,
                        borderColor: newUser.role === role ? theme.primary : theme.inputBorder,
                      },
                    ]}
                    onPress={() => setNewUser({ ...newUser, role })}
                  >
                    <Text style={[
                      styles.roleButtonText,
                      { color: newUser.role === role ? theme.primary : theme.text },
                    ]}>
                      {getRoleLabel(role)}
                    </Text>
                    {newUser.role === role && (
                      <Ionicons name="checkmark-circle" size={18} color={theme.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }, saving && styles.submitButtonDisabled]}
                onPress={handleAddUser}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {locale === 'ar' ? 'إضافة' : 'Add User'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
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
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  userCardDisabled: {
    opacity: 0.6,
  },
  userIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userContent: {
    flex: 1,
  },
  userContentRtl: {
    alignItems: 'flex-end',
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  inactiveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  inactiveText: {
    fontSize: 10,
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 13,
    marginBottom: 8,
  },
  userMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  userMetaRtl: {
    flexDirection: 'row-reverse',
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  branchText: {
    fontSize: 12,
  },
  lastLogin: {
    fontSize: 11,
    marginTop: 4,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
  textRtl: {
    textAlign: 'right',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 0,
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
  rowReverse: {
    flexDirection: 'row-reverse',
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
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  roleButtons: {
    gap: 8,
  },
  roleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  roleButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  branchSelector: {
    gap: 8,
  },
  branchOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  branchOptionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  submitButton: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
