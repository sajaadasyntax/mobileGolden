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
import { useRouter } from 'expo-router';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/lib/i18n';
import { api } from '@/lib/api';

interface ShelfRequest {
  id: string;
  requestNumber: string;
  createdAt: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ISSUED' | 'RECEIVED' | 'CANCELLED';
  requestedBy?: { name: string };
  notes?: string;
  lines: {
    id: string;
    item: { nameEn: string; nameAr: string; sku: string };
    qtyRequested: number;
    qtyApproved?: number;
    qtyIssued?: number;
    qtyReceived?: number;
  }[];
}

interface AvailableItem {
  id: string;
  name: string;
  nameAr: string;
  sku: string;
  unit: string;
}

interface RequestLine {
  itemId: string;
  name: string;
  nameAr: string;
  sku: string;
  qty: number;
}

export default function ShelfRequestsScreen() {
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';

  const [requests, setRequests] = useState<ShelfRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // New request modal state
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [requestLines, setRequestLines] = useState<RequestLine[]>([]);
  const [notes, setNotes] = useState('');
  const [availableItems, setAvailableItems] = useState<AvailableItem[]>([]);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [shelfId, setShelfId] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, [user?.branchId]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      if (!user?.branchId) return;
      
      // Use the user's assigned shelf directly
      const assignedShelf = (user as any)?.shelf;
      
      if (assignedShelf) {
        setShelfId(assignedShelf.id);
        
        // Load requests for this shelf
        await loadRequests(assignedShelf.id);
      }
      
      // Load available items
      await loadAvailableItems();
    } catch (error) {
      console.error('Failed to load initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async (shelfIdParam?: string) => {
    try {
      const result = await api.sales.goodsRequests.list({
        shelfId: shelfIdParam || shelfId || undefined,
        branchId: user?.branchId,
        pageSize: 100,
      });
      const data = result?.data || result || [];
      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load requests:', error);
      setRequests([]);
    }
  };

  const loadAvailableItems = async () => {
    try {
      const result = await api.inventory.items();
      const items = result?.data || result || [];
      setAvailableItems(
        items.map((item: any) => ({
          id: item.id,
          name: item.nameEn || item.name,
          nameAr: item.nameAr || item.name,
          sku: item.sku || 'N/A',
          unit: item.unit?.symbol || item.unit?.name || 'unit',
        }))
      );
    } catch (error) {
      console.error('Failed to load items:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RECEIVED':
        return theme.success;
      case 'ISSUED':
        return '#9C27B0'; // Purple
      case 'APPROVED':
        return theme.info;
      case 'SUBMITTED':
        return theme.warning;
      case 'DRAFT':
        return theme.textSecondary;
      case 'REJECTED':
      case 'CANCELLED':
        return theme.error;
      default:
        return theme.textSecondary;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      DRAFT: { en: 'Draft', ar: 'مسودة' },
      SUBMITTED: { en: 'Submitted', ar: 'مقدم' },
      APPROVED: { en: 'Approved', ar: 'موافق عليه' },
      REJECTED: { en: 'Rejected', ar: 'مرفوض' },
      ISSUED: { en: 'Issued', ar: 'صرف' },
      RECEIVED: { en: 'Received', ar: 'مستلم' },
      CANCELLED: { en: 'Cancelled', ar: 'ملغي' },
    };
    return labels[status] || { en: status, ar: status };
  };

  const handleApprove = async (request: ShelfRequest, event: any) => {
    event?.stopPropagation?.();
    
    Alert.alert(
      locale === 'ar' ? 'الموافقة على الطلب' : 'Approve Request',
      locale === 'ar' 
        ? `هل تريد الموافقة على الطلب ${request.requestNumber}؟`
        : `Do you want to approve request ${request.requestNumber}?`,
      [
        {
          text: locale === 'ar' ? 'إلغاء' : 'Cancel',
          style: 'cancel',
        },
        {
          text: locale === 'ar' ? 'موافق' : 'Approve',
          style: 'default',
          onPress: async () => {
            try {
              setApprovingId(request.id);
              
              // Fetch full request details to get lines
              const fullRequestResult = await api.sales.goodsRequests.getById(request.id);
              
              // Handle different response structures
              const fullRequest = fullRequestResult?.result?.data?.json || 
                                 fullRequestResult?.result?.data || 
                                 fullRequestResult?.data || 
                                 fullRequestResult;
              
              if (!fullRequest) {
                throw new Error(locale === 'ar' ? 'فشل في تحميل تفاصيل الطلب' : 'Failed to load request details');
              }
              
              const lines = fullRequest.lines || [];
              
              if (!Array.isArray(lines) || lines.length === 0) {
                throw new Error(locale === 'ar' ? 'الطلب لا يحتوي على أصناف' : 'Request has no items');
              }
              
              // Approve all lines with their requested quantities
              await api.sales.goodsRequests.approve({
                requestId: request.id,
                lines: lines.map((line: any) => ({
                  lineId: line.id,
                  qtyApproved: Number(line.qtyRequested) || 0,
                })),
              });

              Alert.alert(
                locale === 'ar' ? 'نجاح' : 'Success',
                locale === 'ar' ? 'تمت الموافقة على الطلب بنجاح' : 'Request approved successfully'
              );

              await loadRequests();
            } catch (error: any) {
              console.error('Failed to approve request:', error);
              Alert.alert(
                locale === 'ar' ? 'خطأ' : 'Error',
                error?.message || (locale === 'ar' ? 'فشل في الموافقة على الطلب' : 'Failed to approve request')
              );
            } finally {
              setApprovingId(null);
            }
          },
        },
      ]
    );
  };

  const getStatusText = (status: string) => {
    const label = getStatusLabel(status);
    return isRtl ? label.ar : label.en;
  };


  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleAddItem = (item: AvailableItem) => {
    // Check if item already in list
    if (requestLines.find(l => l.itemId === item.id)) {
      Alert.alert(
        locale === 'ar' ? 'تنبيه' : 'Warning',
        locale === 'ar' ? 'هذا الصنف موجود بالفعل' : 'This item is already in the list'
      );
      return;
    }
    
    setRequestLines([
      ...requestLines,
      {
        itemId: item.id,
        name: item.name,
        nameAr: item.nameAr,
        sku: item.sku,
        qty: 1,
      },
    ]);
    setShowItemPicker(false);
    setSearchQuery('');
  };

  const handleUpdateQty = (itemId: string, newQty: number) => {
    if (newQty < 1) {
      setRequestLines(requestLines.filter(l => l.itemId !== itemId));
      return;
    }
    setRequestLines(requestLines.map(l => 
      l.itemId === itemId ? { ...l, qty: newQty } : l
    ));
  };

  const handleRemoveItem = (itemId: string) => {
    setRequestLines(requestLines.filter(l => l.itemId !== itemId));
  };

  const handleSubmitRequest = async () => {
    if (requestLines.length === 0) {
      Alert.alert(
        locale === 'ar' ? 'تنبيه' : 'Warning',
        locale === 'ar' ? 'يرجى إضافة أصناف للطلب' : 'Please add items to the request'
      );
      return;
    }

    if (!shelfId) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'لم يتم تحديد الرف' : 'Shelf not selected'
      );
      return;
    }

    setSaving(true);
    try {
      // Create the goods request (DRAFT status)
      const createdRequest = await api.sales.goodsRequests.create({
        shelfId,
        lines: requestLines.map(l => ({
          itemId: l.itemId,
          qtyRequested: l.qty, // Use qtyRequested as expected by backend
        })),
        notes: notes || undefined,
      });

      // Automatically submit the request after creation
      if (createdRequest?.id) {
        await api.sales.goodsRequests.submit(createdRequest.id);
      }

      Alert.alert(
        locale === 'ar' ? 'نجاح' : 'Success',
        locale === 'ar' ? 'تم إرسال الطلب بنجاح' : 'Request submitted successfully'
      );
      
      setShowNewRequest(false);
      setRequestLines([]);
      setNotes('');
      await loadRequests();
    } catch (error: any) {
      console.error('Failed to create goods request:', error);
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        error?.message || (locale === 'ar' ? 'فشل في إرسال الطلب' : 'Failed to submit request')
      );
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = availableItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.nameAr.includes(searchQuery) ||
    item.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isWarehouse = user?.role === 'WAREHOUSE_SALES';
  const canIssue = ['ADMIN', 'MANAGER', 'WAREHOUSE_SALES'].includes(user?.role || '');
  const canApprove = ['ADMIN', 'MANAGER'].includes(user?.role || '');
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const renderRequest = ({ item }: { item: ShelfRequest }) => {
    const statusColor = getStatusColor(item.status);
    const itemCount = item.lines?.reduce((sum, l) => sum + l.qtyRequested, 0) || 0;
    const canIssueRequest = item.status === 'APPROVED' && canIssue;
    const canApproveRequest = item.status === 'SUBMITTED' && canApprove;
    const isApproving = approvingId === item.id;
    
    return (
      <View style={[styles.requestCard, { backgroundColor: theme.card }, isRtl && styles.requestCardRtl]}>
        <TouchableOpacity 
          style={styles.requestCardTouchable}
          onPress={() => router.push({ pathname: '/shelf-request-detail', params: { id: item.id } })}
          activeOpacity={0.7}
        >
          <View style={[styles.requestIcon, { backgroundColor: canIssueRequest ? theme.primaryBackground : canApproveRequest ? theme.success + '20' : '#8b5cf620' }]}>
            <Ionicons 
              name={canIssueRequest ? "arrow-up-circle" : canApproveRequest ? "checkmark-circle" : "layers"} 
              size={24} 
              color={canIssueRequest ? theme.primary : canApproveRequest ? theme.success : "#8b5cf6"} 
            />
          </View>
          <View style={[styles.requestContent, isRtl && styles.requestContentRtl]}>
            <View style={[styles.requestHeader, isRtl && styles.requestHeaderRtl]}>
              <Text style={[styles.requestNumber, { color: theme.text }]}>{item.requestNumber}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {getStatusText(item.status)}
                </Text>
              </View>
            </View>
            {item.requestedBy && (
              <Text style={[styles.requestBy, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                {t('requestedBy', locale)}: {item.requestedBy.name}
              </Text>
            )}
            <View style={[styles.requestMeta, isRtl && styles.requestMetaRtl]}>
              <Text style={[styles.requestDate, { color: theme.textMuted }]}>{formatDate(item.createdAt)}</Text>
              <Text style={[styles.itemCount, { color: '#8b5cf6' }]}>
                {itemCount} {t('items', locale)}
              </Text>
            </View>
            {canIssueRequest && (
              <View style={[styles.issueActionRow, { marginTop: 8 }]}>
                <Text style={[styles.issueActionText, { color: theme.primary }]}>
                  {locale === 'ar' ? 'اضغط لصرف البضائع' : 'Tap to issue goods'}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.actionIcon}>
            <Ionicons name={isRtl ? 'chevron-back' : 'chevron-forward'} size={20} color={theme.textSecondary} />
          </View>
        </TouchableOpacity>
        
        {/* Approve Button for Admins */}
        {canApproveRequest && (
          <TouchableOpacity
            style={[styles.approveButton, { backgroundColor: theme.success }]}
            onPress={(e) => handleApprove(item, e)}
            disabled={isApproving}
            activeOpacity={0.8}
          >
            {isApproving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.approveButtonText}>
                  {locale === 'ar' ? 'موافق' : 'Approve'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  // Filter requests for warehouse users to show only approved ones
  const displayRequests = isWarehouse 
    ? requests.filter(r => r.status === 'APPROVED')
    : requests;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Warehouse User Header */}
      {isWarehouse && (
        <View style={[styles.warehouseHeader, { backgroundColor: theme.primaryBackground }]}>
          <Ionicons name="arrow-up-circle" size={24} color={theme.primary} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={[styles.warehouseHeaderTitle, { color: theme.primary }]}>
              {locale === 'ar' ? 'طلبات في انتظار الصرف' : 'Requests Pending Issue'}
            </Text>
            <Text style={[styles.warehouseHeaderSubtitle, { color: theme.textSecondary }]}>
              {displayRequests.length} {locale === 'ar' ? 'طلب' : 'requests'}
            </Text>
          </View>
        </View>
      )}

      {/* New Request Button (hidden for warehouse users and admin) */}
      {!isWarehouse && user?.role !== 'ADMIN' && (
        <TouchableOpacity 
          style={[styles.newButton, isRtl && styles.newButtonRtl]}
          onPress={() => setShowNewRequest(true)}
        >
          <Ionicons name="add" size={24} color="#fff" />
          <Text style={styles.newButtonText}>{t('newShelfRequest', locale)}</Text>
        </TouchableOpacity>
      )}

      {/* Requests List */}
      <FlatList
        data={displayRequests}
        keyExtractor={(item) => item.id}
        renderItem={renderRequest}
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
            <Ionicons name="layers-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noData', locale)}</Text>
            <Text style={[styles.emptySubtext, { color: theme.textMuted }]}>
              {locale === 'ar' ? 'قم بإنشاء طلب جديد للبضاعة' : 'Create a new shelf request'}
            </Text>
          </View>
        }
      />

      {/* New Request Modal */}
      <Modal visible={showNewRequest} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {locale === 'ar' ? 'طلب بضاعة جديد' : 'New Stock Request'}
              </Text>
              <TouchableOpacity onPress={() => setShowNewRequest(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Request Items */}
              <View style={[styles.sectionHeader, isRtl && styles.rowReverse]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  {locale === 'ar' ? 'الأصناف المطلوبة' : 'Requested Items'}
                </Text>
                <TouchableOpacity
                  style={[styles.addItemBtn, { backgroundColor: theme.primary }]}
                  onPress={() => setShowItemPicker(true)}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.addItemBtnText}>{t('addItem', locale)}</Text>
                </TouchableOpacity>
              </View>

              {requestLines.length === 0 ? (
                <View style={[styles.emptyLines, { backgroundColor: theme.backgroundSecondary }]}>
                  <Ionicons name="cube-outline" size={40} color={theme.textMuted} />
                  <Text style={[styles.emptyLinesText, { color: theme.textMuted }]}>
                    {locale === 'ar' ? 'لم يتم إضافة أصناف' : 'No items added'}
                  </Text>
                </View>
              ) : (
                requestLines.map((line) => (
                  <View 
                    key={line.itemId} 
                    style={[styles.lineItem, { backgroundColor: theme.card, borderColor: theme.border }]}
                  >
                    <View style={[styles.lineInfo, isRtl && { alignItems: 'flex-end' }]}>
                      <Text style={[styles.lineName, { color: theme.text }]}>
                        {isRtl ? line.nameAr : line.name}
                      </Text>
                      <Text style={[styles.lineSku, { color: theme.textMuted }]}>{line.sku}</Text>
                    </View>
                    <View style={styles.lineActions}>
                      <View style={styles.qtyControls}>
                        <TouchableOpacity
                          style={[styles.qtyBtn, { backgroundColor: theme.backgroundTertiary }]}
                          onPress={() => handleUpdateQty(line.itemId, line.qty - 1)}
                        >
                          <Ionicons name="remove" size={16} color={theme.text} />
                        </TouchableOpacity>
                        <Text style={[styles.qtyText, { color: theme.text }]}>{line.qty}</Text>
                        <TouchableOpacity
                          style={[styles.qtyBtn, { backgroundColor: theme.backgroundTertiary }]}
                          onPress={() => handleUpdateQty(line.itemId, line.qty + 1)}
                        >
                          <Ionicons name="add" size={16} color={theme.text} />
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity onPress={() => handleRemoveItem(line.itemId)}>
                        <Ionicons name="trash-outline" size={20} color={theme.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}

              {/* Notes */}
              <Text style={[styles.notesLabel, { color: theme.text }, isRtl && styles.textRtl]}>
                {locale === 'ar' ? 'ملاحظات (اختياري)' : 'Notes (optional)'}
              </Text>
              <TextInput
                style={[styles.notesInput, { backgroundColor: theme.input, borderColor: theme.inputBorder, color: theme.text }]}
                value={notes}
                onChangeText={setNotes}
                placeholder={locale === 'ar' ? 'أضف ملاحظات...' : 'Add notes...'}
                placeholderTextColor={theme.inputPlaceholder}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                textAlign={isRtl ? 'right' : 'left'}
              />
            </ScrollView>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: '#8b5cf6' }]}
              onPress={handleSubmitRequest}
              disabled={saving || requestLines.length === 0}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={20} color="#fff" />
                  <Text style={styles.submitBtnText}>
                    {locale === 'ar' ? 'إرسال الطلب' : 'Submit Request'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Item Picker Modal */}
      <Modal visible={showItemPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.pickerModal, { backgroundColor: theme.surface }]}>
            <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{t('selectItem', locale)}</Text>
              <TouchableOpacity onPress={() => setShowItemPicker(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.searchContainer, { backgroundColor: theme.input, borderColor: theme.inputBorder }]}>
              <Ionicons name="search" size={20} color={theme.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder={t('search', locale)}
                placeholderTextColor={theme.inputPlaceholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                textAlign={isRtl ? 'right' : 'left'}
              />
            </View>

            <FlatList
              data={filteredItems}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickableItem, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={() => handleAddItem(item)}
                >
                  <View style={isRtl ? { alignItems: 'flex-end' } : {}}>
                    <Text style={[styles.pickableItemName, { color: theme.text }]}>
                      {isRtl ? item.nameAr : item.name}
                    </Text>
                    <Text style={[styles.pickableItemSku, { color: theme.textMuted }]}>
                      {item.sku} • {item.unit}
                    </Text>
                  </View>
                  <Ionicons name="add-circle" size={24} color={theme.primary} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyPicker}>
                  <Text style={[styles.emptyPickerText, { color: theme.textMuted }]}>
                    {locale === 'ar' ? 'لا توجد أصناف' : 'No items found'}
                  </Text>
                </View>
              }
            />
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
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8b5cf6',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  newButtonRtl: {
    flexDirection: 'row-reverse',
  },
  newButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  warehouseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
  },
  warehouseHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  warehouseHeaderSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  issueActionRow: {},
  issueActionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  requestCard: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  requestCardRtl: {
    // RTL handled in content
  },
  requestCardTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  requestIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestContent: {
    flex: 1,
    marginLeft: 12,
  },
  requestContentRtl: {
    marginLeft: 0,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestHeaderRtl: {
    flexDirection: 'row-reverse',
  },
  requestNumber: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  requestBy: {
    fontSize: 13,
    marginTop: 4,
  },
  requestMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  requestMetaRtl: {
    flexDirection: 'row-reverse',
  },
  requestDate: {
    fontSize: 11,
  },
  itemCount: {
    fontSize: 11,
    fontWeight: '500',
  },
  actionIcon: {
    padding: 4,
  },
  approveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  approveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
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
  emptySubtext: {
    fontSize: 13,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalBody: {
    padding: 16,
    maxHeight: 400,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addItemBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyLines: {
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyLinesText: {
    marginTop: 8,
    fontSize: 14,
  },
  lineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  lineInfo: {
    flex: 1,
  },
  lineName: {
    fontSize: 14,
    fontWeight: '500',
  },
  lineSku: {
    fontSize: 11,
    marginTop: 2,
  },
  lineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 24,
    textAlign: 'center',
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 16,
    marginBottom: 8,
  },
  notesInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pickerModal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    height: 44,
    marginLeft: 8,
    fontSize: 16,
  },
  pickableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  pickableItemName: {
    fontSize: 15,
    fontWeight: '500',
  },
  pickableItemSku: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyPicker: {
    padding: 40,
    alignItems: 'center',
  },
  emptyPickerText: {
    fontSize: 14,
  },
});
