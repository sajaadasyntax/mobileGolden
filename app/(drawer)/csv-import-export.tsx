import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useThemeStore } from '@/stores/theme';
import { useLocaleStore } from '@/stores/locale';
import { useAuthStore } from '@/stores/auth';
import { API_URL, getToken } from '@/lib/api';

type CsvType = 'items' | 'prices';

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

export default function CsvImportExportScreen() {
  const { theme } = useThemeStore();
  const { locale } = useLocaleStore();
  const { user } = useAuthStore();
  const isAr = locale === 'ar';

  const [loading, setLoading] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  const exportCsv = async (type: CsvType) => {
    setLoading(`export-${type}`);
    setLastResult(null);
    try {
      const token = await getToken();
      const queryParams = type === 'prices' && user?.branchId
        ? `?branchId=${user.branchId}`
        : '';
      const url = `${API_URL}/api/csv/${type}/export${queryParams}`;

      const filename = `${type}-${Date.now()}.csv`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;

      const downloadResult = await FileSystem.downloadAsync(url, fileUri, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (downloadResult.status !== 200) {
        throw new Error(`Server returned status ${downloadResult.status}`);
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: 'text/csv',
          dialogTitle: isAr ? `تصدير ${type === 'items' ? 'المنتجات' : 'الأسعار'}` : `Export ${type}`,
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert(
          isAr ? 'تم التصدير' : 'Exported',
          isAr ? `تم حفظ الملف: ${filename}` : `File saved: ${filename}`
        );
      }
    } catch (error: any) {
      console.error(`CSV export ${type} error:`, error);
      Alert.alert(
        isAr ? 'خطأ' : 'Error',
        isAr ? `فشل تصدير ${type === 'items' ? 'المنتجات' : 'الأسعار'}` : `Failed to export ${type}: ${error.message}`
      );
    } finally {
      setLoading(null);
    }
  };

  const importCsv = async (type: CsvType) => {
    setLoading(`import-${type}`);
    setLastResult(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setLoading(null);
        return;
      }

      const file = result.assets[0];
      if (!file.name.toLowerCase().endsWith('.csv')) {
        Alert.alert(
          isAr ? 'خطأ' : 'Error',
          isAr ? 'يرجى اختيار ملف CSV' : 'Please select a CSV file'
        );
        setLoading(null);
        return;
      }

      const token = await getToken();
      const url = `${API_URL}/api/csv/${type}/import${type === 'prices' && user?.branchId ? `?branchId=${user.branchId}` : ''}`;

      const uploadResult = await FileSystem.uploadAsync(url, file.uri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (uploadResult.status !== 200) {
        const errorBody = JSON.parse(uploadResult.body || '{}');
        throw new Error(errorBody.error || `Server returned ${uploadResult.status}`);
      }

      const importResult: ImportResult = JSON.parse(uploadResult.body);
      setLastResult(importResult);

      const summary = isAr
        ? `تم إنشاء ${importResult.created} وتحديث ${importResult.updated}${importResult.errors.length > 0 ? ` مع ${importResult.errors.length} خطأ` : ''}`
        : `Created ${importResult.created}, updated ${importResult.updated}${importResult.errors.length > 0 ? ` with ${importResult.errors.length} error(s)` : ''}`;

      Alert.alert(isAr ? 'تم الاستيراد' : 'Import Complete', summary);
    } catch (error: any) {
      console.error(`CSV import ${type} error:`, error);
      Alert.alert(
        isAr ? 'خطأ' : 'Error',
        isAr ? `فشل استيراد ${type === 'items' ? 'المنتجات' : 'الأسعار'}` : `Failed to import ${type}: ${error.message}`
      );
    } finally {
      setLoading(null);
    }
  };

  const renderCard = (
    type: CsvType,
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    description: string
  ) => (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={28} color={theme.primary} />
        <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
      </View>
      <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>{description}</Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.exportButton, { backgroundColor: theme.primary }]}
          onPress={() => exportCsv(type)}
          disabled={loading !== null}
        >
          {loading === `export-${type}` ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>
                {isAr ? 'تصدير CSV' : 'Export CSV'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.importButton, { backgroundColor: '#10b981' }]}
          onPress={() => importCsv(type)}
          disabled={loading !== null}
        >
          {loading === `import-${type}` ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="push-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>
                {isAr ? 'استيراد CSV' : 'Import CSV'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFormatGuide = (type: CsvType) => {
    const itemColumns = ['SKU', 'Name (EN)', 'Name (AR)', 'Description', 'Category', 'Unit', 'Is Consignment', 'Is Active', 'Min Stock Level', 'Max Stock Level'];
    const priceColumns = ['Item SKU', 'Item Name (EN)', 'Item Name (AR)', 'Branch', 'Warehouse', 'Shelf', 'Wholesale Price (USD)', 'Retail Price (USD)', 'Price Range Min (USD)', 'Price Range Max (USD)', 'Effective From', 'Effective To'];
    const columns = type === 'items' ? itemColumns : priceColumns;
    const required = type === 'items'
      ? ['SKU', 'Name (EN)', 'Name (AR)', 'Category', 'Unit']
      : ['Item SKU', 'Wholesale Price (USD)', 'Retail Price (USD)', 'Price Range Min (USD)', 'Price Range Max (USD)', 'Effective From'];

    return (
      <View style={[styles.formatGuide, { backgroundColor: theme.surface || theme.card, borderColor: theme.border }]}>
        <Text style={[styles.formatTitle, { color: theme.text }]}>
          {isAr ? 'أعمدة CSV المطلوبة' : 'CSV Column Format'}
        </Text>
        {columns.map((col) => (
          <View key={col} style={styles.columnRow}>
            <Ionicons
              name={required.includes(col) ? 'checkmark-circle' : 'ellipse-outline'}
              size={14}
              color={required.includes(col) ? '#10b981' : theme.textSecondary}
            />
            <Text style={[styles.columnName, { color: theme.text }]}>{col}</Text>
            {required.includes(col) && (
              <Text style={[styles.requiredBadge, { color: '#ef4444' }]}>
                {isAr ? 'مطلوب' : 'required'}
              </Text>
            )}
          </View>
        ))}
      </View>
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Text style={[styles.pageTitle, { color: theme.text }]}>
          {isAr ? 'استيراد وتصدير البيانات' : 'Data Import & Export'}
        </Text>
        <Text style={[styles.pageSubtitle, { color: theme.textSecondary }]}>
          {isAr
            ? 'قم بتصدير واستيراد المنتجات والأسعار عبر ملفات CSV'
            : 'Export and import items and prices via CSV files'}
        </Text>

        {renderCard(
          'items',
          'cube-outline',
          isAr ? 'المنتجات' : 'Items',
          isAr
            ? 'تصدير أو استيراد قائمة المنتجات. عند الاستيراد، يتم تحديث المنتجات الموجودة بنفس SKU.'
            : 'Export or import items list. When importing, existing items with the same SKU will be updated.'
        )}
        {renderFormatGuide('items')}

        {renderCard(
          'prices',
          'pricetag-outline',
          isAr ? 'سياسات الأسعار' : 'Price Policies',
          isAr
            ? 'تصدير أو استيراد سياسات الأسعار للفرع الحالي. يمكن تحديد أسعار الجملة والتجزئة لكل منتج.'
            : 'Export or import price policies for the current branch. Set wholesale and retail prices per item.'
        )}
        {renderFormatGuide('prices')}

        {lastResult && lastResult.errors.length > 0 && (
          <View style={[styles.errorList, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
            <Text style={[styles.errorListTitle, { color: '#dc2626' }]}>
              {isAr ? `${lastResult.errors.length} أخطاء:` : `${lastResult.errors.length} Error(s):`}
            </Text>
            {lastResult.errors.slice(0, 20).map((err, idx) => (
              <Text key={idx} style={[styles.errorItem, { color: '#991b1b' }]}>
                • {err}
              </Text>
            ))}
            {lastResult.errors.length > 20 && (
              <Text style={{ color: '#991b1b', fontSize: 12, marginTop: 4 }}>
                {isAr
                  ? `... و ${lastResult.errors.length - 20} خطأ آخر`
                  : `... and ${lastResult.errors.length - 20} more errors`}
              </Text>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  exportButton: {},
  importButton: {},
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  formatGuide: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  formatTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  columnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  columnName: {
    fontSize: 12,
    flex: 1,
  },
  requiredBadge: {
    fontSize: 10,
    fontWeight: '600',
  },
  errorList: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginTop: 8,
  },
  errorListTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  errorItem: {
    fontSize: 12,
    lineHeight: 18,
  },
});
