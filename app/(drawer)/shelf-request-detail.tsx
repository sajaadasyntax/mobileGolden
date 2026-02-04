import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

interface RequestLine {
  id: string;
  qtyRequested: number;
  qtyApproved: number;
  qtyIssued: number;
  item: {
    id: string;
    nameEn: string;
    nameAr?: string;
    sku: string;
    unit?: { name: string; nameAr?: string };
  };
}

interface GoodsRequest {
  id: string;
  requestNumber: string;
  requestDate: string;
  status: string;
  notes?: string;
  shelf?: {
    id: string;
    name: string;
    nameAr?: string;
    branch?: { name: string; nameAr?: string };
  };
  requestedBy?: { name: string };
  lines: RequestLine[];
  approvals?: { approvedBy?: { name: string }; notes?: string }[];
}

interface Warehouse {
  id: string;
  name: string;
  nameAr?: string;
}

interface IssueLineInput {
  lineId: string;
  qtyToIssue: string;
  remaining: number;
}

export default function ShelfRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const isRtl = locale === 'ar';
  
  const canIssue = ['ADMIN', 'MANAGER', 'WAREHOUSE_SALES'].includes(user?.role || '');

  const [request, setRequest] = useState<GoodsRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Issue mode state
  const [issueMode, setIssueMode] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [showWarehousePicker, setShowWarehousePicker] = useState(false);
  const [issueLines, setIssueLines] = useState<IssueLineInput[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (id) {
      loadRequest();
    }
  }, [id]);

  const loadRequest = async () => {
    try {
      setLoading(true);
      const [requestData, warehousesData] = await Promise.all([
        api.sales.goodsRequests.getById(id!),
        api.inventory.warehouses(),
      ]);
      
      const mappedRequest = {
        ...requestData,
        lines: requestData.lines.map((l: any) => ({
          ...l,
          qtyRequested: Number(l.qtyRequested),
          qtyApproved: Number(l.qtyApproved || 0),
          qtyIssued: Number(l.qtyIssued || 0),
        })),
      };
      
      setRequest(mappedRequest);
      
      const whList = warehousesData?.data || warehousesData || [];
      setWarehouses(whList);
      if (whList.length > 0) {
        setSelectedWarehouse(whList[0].id);
      }
      
      initIssueLines(mappedRequest.lines);
    } catch (error: any) {
      console.error('Failed to load request:', error);
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'فشل في تحميل الطلب' : 'Failed to load request'
      );
    } finally {
      setLoading(false);
    }
  };

  const initIssueLines = (lines: RequestLine[]) => {
    const inputs: IssueLineInput[] = lines
      .filter(l => l.qtyApproved > l.qtyIssued)
      .map(l => ({
        lineId: l.id,
        qtyToIssue: '',
        remaining: l.qtyApproved - l.qtyIssued,
      }));
    setIssueLines(inputs);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRequest();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return theme.textMuted;
      case 'SUBMITTED': return theme.info;
      case 'APPROVED': return theme.primary;
      case 'REJECTED': return theme.error;
      case 'ISSUED': return theme.warning;
      case 'RECEIVED': return theme.success;
      default: return theme.textMuted;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { en: string; ar: string }> = {
      DRAFT: { en: 'Draft', ar: 'مسودة' },
      SUBMITTED: { en: 'Submitted', ar: 'مقدم' },
      APPROVED: { en: 'Approved', ar: 'موافق عليه' },
      REJECTED: { en: 'Rejected', ar: 'مرفوض' },
      ISSUED: { en: 'Issued', ar: 'تم الصرف' },
      RECEIVED: { en: 'Received', ar: 'مستلم' },
    };
    return locale === 'ar' ? labels[status]?.ar : labels[status]?.en || status;
  };

  const canIssueRequest = request && request.status === 'APPROVED';
  const hasItemsToIssue = issueLines.some(l => l.remaining > 0);

  const updateIssueQty = (lineId: string, value: string) => {
    setIssueLines(lines =>
      lines.map(l => l.lineId === lineId ? { ...l, qtyToIssue: value } : l)
    );
  };

  const setMaxQty = (lineId: string) => {
    setIssueLines(lines =>
      lines.map(l => l.lineId === lineId ? { ...l, qtyToIssue: String(l.remaining) } : l)
    );
  };

  const handleIssueGoods = async () => {
    if (!selectedWarehouse) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'يرجى اختيار المستودع' : 'Please select a warehouse'
      );
      return;
    }

    const validLines = issueLines.filter(l => {
      const qty = parseFloat(l.qtyToIssue);
      return !isNaN(qty) && qty > 0;
    });

    if (validLines.length === 0) {
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        locale === 'ar' ? 'يرجى إدخال كمية واحدة على الأقل' : 'Please enter at least one quantity'
      );
      return;
    }

    // Validate quantities
    for (const line of validLines) {
      const qty = parseFloat(line.qtyToIssue);
      if (qty > line.remaining) {
        Alert.alert(
          locale === 'ar' ? 'خطأ' : 'Error',
          locale === 'ar' ? 'الكمية المدخلة أكبر من المتبقي' : 'Quantity exceeds remaining'
        );
        return;
      }
    }

    try {
      setSubmitting(true);

      await api.sales.goodsRequests.issue({
        requestId: id!,
        warehouseId: selectedWarehouse,
        lines: validLines.map(l => ({
          lineId: l.lineId,
          qtyIssued: parseFloat(l.qtyToIssue),
        })),
      });

      Alert.alert(
        locale === 'ar' ? 'نجاح' : 'Success',
        locale === 'ar' ? 'تم صرف البضائع بنجاح' : 'Goods issued successfully'
      );
      
      setIssueMode(false);
      await loadRequest();
    } catch (error: any) {
      console.error('Failed to issue goods:', error);
      Alert.alert(
        locale === 'ar' ? 'خطأ' : 'Error',
        error.message || (locale === 'ar' ? 'فشل في صرف البضائع' : 'Failed to issue goods')
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!request) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, styles.centered]}>
        <Ionicons name="layers-outline" size={48} color={theme.textMuted} />
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          {locale === 'ar' ? 'الطلب غير موجود' : 'Request not found'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* Header Card */}
        <View style={[styles.headerCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={[styles.headerRow, isRtl && styles.rowReverse]}>
            <View>
              <Text style={[styles.requestNumber, { color: theme.text }, isRtl && styles.textRtl]}>
                {request.requestNumber}
              </Text>
              <Text style={[styles.shelfName, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
                {isRtl ? (request.shelf?.nameAr || request.shelf?.name) : request.shelf?.name || '-'}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(request.status) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(request.status) }]}>
                {getStatusLabel(request.status)}
              </Text>
            </View>
          </View>

          <View style={[styles.infoGrid, { borderTopColor: theme.border }]}>
            <View style={styles.infoItem}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                {locale === 'ar' ? 'تاريخ الطلب' : 'Request Date'}
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {request.requestDate?.split('T')[0]}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                {locale === 'ar' ? 'بواسطة' : 'Requested By'}
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {request.requestedBy?.name || '-'}
              </Text>
            </View>
          </View>
        </View>

        {/* Warehouse Selection (Issue Mode) */}
        {issueMode && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'المستودع المصدر *' : 'Source Warehouse *'}
            </Text>
            <TouchableOpacity
              style={[styles.pickerButton, { borderColor: theme.border, backgroundColor: theme.background }]}
              onPress={() => setShowWarehousePicker(true)}
            >
              <Text style={[styles.pickerButtonText, { color: selectedWarehouse ? theme.text : theme.textMuted }]}>
                {selectedWarehouse 
                  ? (isRtl ? (warehouses.find(w => w.id === selectedWarehouse)?.nameAr || warehouses.find(w => w.id === selectedWarehouse)?.name) : warehouses.find(w => w.id === selectedWarehouse)?.name)
                  : (locale === 'ar' ? '-- اختر المستودع --' : '-- Select Warehouse --')
                }
              </Text>
              <Ionicons name="chevron-down" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Request Lines */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
            {locale === 'ar' ? 'الأصناف' : 'Items'} ({request.lines.length})
          </Text>
          
          {request.lines.map((line) => {
            const remaining = line.qtyApproved - line.qtyIssued;
            const isFullyIssued = remaining <= 0;
            const issueInput = issueLines.find(i => i.lineId === line.id);
            
            return (
              <View 
                key={line.id} 
                style={[styles.lineItem, { borderBottomColor: theme.border }]}
              >
                <View style={[styles.lineHeader, isRtl && styles.rowReverse]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemName, { color: theme.text }, isRtl && styles.textRtl]}>
                      {isRtl ? (line.item.nameAr || line.item.nameEn) : line.item.nameEn}
                    </Text>
                    <Text style={[styles.itemSku, { color: theme.textMuted }]}>
                      {line.item.sku}
                    </Text>
                  </View>
                  {isFullyIssued && (
                    <View style={[styles.issuedBadge, { backgroundColor: theme.successBackground }]}>
                      <Ionicons name="checkmark-circle" size={14} color={theme.success} />
                      <Text style={[styles.issuedBadgeText, { color: theme.success }]}>
                        {locale === 'ar' ? 'تم الصرف' : 'Issued'}
                      </Text>
                    </View>
                  )}
                </View>
                
                <View style={[styles.lineDetails, isRtl && styles.rowReverse]}>
                  <View style={styles.qtyInfo}>
                    <Text style={[styles.qtyLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'مطلوب' : 'Requested'}
                    </Text>
                    <Text style={[styles.qtyValue, { color: theme.text }]}>
                      {line.qtyRequested}
                    </Text>
                  </View>
                  
                  <View style={styles.qtyInfo}>
                    <Text style={[styles.qtyLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'موافق عليه' : 'Approved'}
                    </Text>
                    <Text style={[styles.qtyValue, { color: theme.primary }]}>
                      {line.qtyApproved}
                    </Text>
                  </View>
                  
                  <View style={styles.qtyInfo}>
                    <Text style={[styles.qtyLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'صُرف' : 'Issued'}
                    </Text>
                    <Text style={[styles.qtyValue, { color: isFullyIssued ? theme.success : theme.warning }]}>
                      {line.qtyIssued}
                    </Text>
                  </View>
                  
                  <View style={styles.qtyInfo}>
                    <Text style={[styles.qtyLabel, { color: theme.textSecondary }]}>
                      {locale === 'ar' ? 'متبقي' : 'Remaining'}
                    </Text>
                    <Text style={[styles.qtyValue, { color: remaining > 0 ? theme.warning : theme.success }]}>
                      {remaining}
                    </Text>
                  </View>
                </View>

                {/* Issue Input (only in issue mode and if not fully issued) */}
                {issueMode && !isFullyIssued && issueInput && (
                  <View style={[styles.issueInputs, { borderTopColor: theme.border }]}>
                    <View style={styles.inputRow}>
                      <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                        {locale === 'ar' ? 'كمية الصرف' : 'Qty to Issue'}
                      </Text>
                      <View style={styles.qtyInputRow}>
                        <TextInput
                          style={[styles.qtyInput, { 
                            backgroundColor: theme.background, 
                            borderColor: theme.border,
                            color: theme.text,
                          }]}
                          value={issueInput.qtyToIssue}
                          onChangeText={(v) => updateIssueQty(line.id, v)}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={theme.textMuted}
                        />
                        <TouchableOpacity
                          style={[styles.maxButton, { backgroundColor: theme.primaryBackground }]}
                          onPress={() => setMaxQty(line.id)}
                        >
                          <Text style={[styles.maxButtonText, { color: theme.primary }]}>
                            {locale === 'ar' ? 'الكل' : 'All'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Notes */}
        {request.notes && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }, isRtl && styles.textRtl]}>
              {locale === 'ar' ? 'ملاحظات' : 'Notes'}
            </Text>
            <Text style={[styles.notesText, { color: theme.textSecondary }, isRtl && styles.textRtl]}>
              {request.notes}
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Action Bar */}
      {canIssue && canIssueRequest && hasItemsToIssue && (
        <View style={[styles.actionBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          {issueMode ? (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.border }]}
                onPress={() => {
                  setIssueMode(false);
                  initIssueLines(request.lines);
                }}
              >
                <Text style={[styles.cancelButtonText, { color: theme.text }]}>
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.success }]}
                onPress={handleIssueGoods}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
                    <Text style={styles.submitButtonText}>
                      {locale === 'ar' ? 'تأكيد الصرف' : 'Confirm Issue'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.issueButton, { backgroundColor: theme.primary }]}
              onPress={() => setIssueMode(true)}
            >
              <Ionicons name="arrow-up-circle-outline" size={20} color="#fff" />
              <Text style={styles.issueButtonText}>
                {locale === 'ar' ? 'صرف البضائع' : 'Issue Goods'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Warehouse Picker Modal */}
      <Modal
        visible={showWarehousePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWarehousePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }, isRtl && styles.rowReverse]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {locale === 'ar' ? 'اختر المستودع' : 'Select Warehouse'}
              </Text>
              <TouchableOpacity onPress={() => setShowWarehousePicker(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={warehouses}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.warehouseItem,
                    { 
                      backgroundColor: selectedWarehouse === item.id ? theme.primaryBackground : 'transparent',
                      borderBottomColor: theme.border,
                    }
                  ]}
                  onPress={() => {
                    setSelectedWarehouse(item.id);
                    setShowWarehousePicker(false);
                  }}
                >
                  <Text style={[styles.warehouseItemText, { color: theme.text }, isRtl && styles.textRtl]}>
                    {isRtl ? (item.nameAr || item.name) : item.name}
                  </Text>
                  {selectedWarehouse === item.id && (
                    <Ionicons name="checkmark" size={20} color={theme.primary} />
                  )}
                </TouchableOpacity>
              )}
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
  scrollView: {
    flex: 1,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
  headerCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  requestNumber: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  shelfName: {
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoGrid: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  lineItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
  },
  itemSku: {
    fontSize: 12,
    marginTop: 2,
  },
  issuedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  issuedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  lineDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  qtyInfo: {
    alignItems: 'center',
  },
  qtyLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  qtyValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  issueInputs: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputLabel: {
    fontSize: 12,
  },
  qtyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyInput: {
    width: 80,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  maxButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  maxButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    borderTopWidth: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  issueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  issueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  textRtl: {
    textAlign: 'right',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  pickerButtonText: {
    fontSize: 16,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  warehouseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  warehouseItemText: {
    fontSize: 16,
    flex: 1,
  },
});
