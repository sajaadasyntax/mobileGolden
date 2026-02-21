import { Drawer } from 'expo-router/drawer';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { t } from '@/lib/i18n';
import CustomDrawer from '@/components/CustomDrawer';
import { useNavigation } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import { TouchableOpacity, StyleSheet, I18nManager, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';

function DrawerToggleButton({ position }: { position: 'left' | 'right' }) {
  const navigation = useNavigation();
  const { theme } = useThemeStore();

  return (
    <TouchableOpacity
      onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
      style={[
        styles.menuButton,
        position === 'left' ? { marginLeft: 16 } : { marginRight: 16 }
      ]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons name="menu" size={24} color={theme.headerText} />
    </TouchableOpacity>
  );
}

function DrawerLayout() {
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const isRtl = locale === 'ar';

  return (
    <Drawer
      drawerContent={(props) => <CustomDrawer {...props} />}
      screenOptions={({ navigation }) => ({
        headerStyle: {
          backgroundColor: theme.header,
        },
        headerTintColor: theme.headerText,
        headerTitleStyle: {
          fontWeight: '600',
          textAlign: isRtl ? 'right' : 'left',
        },
        headerTitleAlign: isRtl ? 'right' : 'left',
        // For RTL: drawer on right, menu button on right
        // For LTR: drawer on left, menu button on left
        headerLeft: isRtl ? () => <View /> : () => <DrawerToggleButton position="left" />,
        headerRight: isRtl ? () => <DrawerToggleButton position="right" /> : () => <View />,
        headerShown: true,
        drawerPosition: isRtl ? 'right' : 'left',
        drawerStyle: {
          backgroundColor: theme.drawer,
          width: 300,
        },
        drawerActiveBackgroundColor: theme.drawerActive,
        drawerActiveTintColor: theme.drawerActiveText,
        drawerInactiveTintColor: theme.drawerInactiveText,
        contentStyle: {
          backgroundColor: theme.background,
        },
      })}
    >
      {/* Main Screens */}
      <Drawer.Screen
        name="dashboard"
        options={({ route }) => ({ title: t('dashboard', locale) })}
      />
      <Drawer.Screen
        name="inventory"
        options={({ route }) => ({ title: t('inventory', locale) })}
      />
      <Drawer.Screen
        name="prices"
        options={({ route }) => ({ title: t('prices', locale) })}
      />
      <Drawer.Screen
        name="procurement"
        options={({ route }) => ({ title: t('procurementOrders', locale) })}
      />
      <Drawer.Screen
        name="sales"
        options={({ route }) => ({ title: t('salesOrders', locale) })}
      />
      <Drawer.Screen
        name="shelf-requests"
        options={({ route }) => ({ title: t('shelfRequests', locale) })}
      />
      <Drawer.Screen
        name="shelf-inventory"
        options={({ route }) => ({ title: locale === 'ar' ? 'مخزون الرف' : 'Shelf Inventory' })}
      />
      <Drawer.Screen
        name="exchange-rate"
        options={({ route }) => ({ title: t('exchangeRateSetting', locale) })}
      />
      <Drawer.Screen
        name="suppliers"
        options={({ route }) => ({ title: t('suppliers', locale) })}
      />
      <Drawer.Screen
        name="customers"
        options={({ route }) => ({ title: t('customers', locale) })}
      />
      <Drawer.Screen
        name="transactions"
        options={({ route }) => ({ title: t('transactions', locale) })}
      />
      <Drawer.Screen
        name="liquid-assets"
        options={({ route }) => ({ title: t('liquidAssets', locale) })}
      />
      <Drawer.Screen
        name="outstanding-invoices"
        options={({ route }) => ({ title: t('outstandingInvoices', locale) })}
      />
      <Drawer.Screen
        name="expenses"
        options={({ route }) => ({ title: t('expenses', locale) })}
      />
      <Drawer.Screen
        name="bank-transactions"
        options={({ route }) => ({ title: t('bankTransactions', locale) })}
      />
      <Drawer.Screen
        name="bank-payment"
        options={({ route }) => ({ title: t('bankPayment', locale) })}
      />
      <Drawer.Screen
        name="budget"
        options={({ route }) => ({ title: t('budget', locale) })}
      />
      <Drawer.Screen
        name="previous-budget"
        options={({ route }) => ({ title: t('previousBudget', locale) })}
      />
      <Drawer.Screen
        name="users"
        options={({ route }) => ({ title: locale === 'ar' ? 'المستخدمون' : 'Users' })}
      />
      <Drawer.Screen
        name="settings"
        options={({ route }) => ({ title: t('settings', locale) })}
      />
      
      {/* Procurement-specific Screens */}
      <Drawer.Screen
        name="raise-notification"
        options={({ route }) => ({ title: t('raiseNotification', locale) })}
      />
      <Drawer.Screen
        name="match-operation"
        options={({ route }) => ({ title: t('matchOperationNumber', locale) })}
      />
      <Drawer.Screen
        name="all-invoices"
        options={({ route }) => ({ title: t('allInvoices', locale) })}
      />
      <Drawer.Screen
        name="deferred-invoices"
        options={({ route }) => ({ title: t('deferredInvoices', locale) })}
      />
      <Drawer.Screen
        name="issued-invoices"
        options={({ route }) => ({ title: t('issuedInvoices', locale) })}
      />
      <Drawer.Screen
        name="consignment-invoices"
        options={({ route }) => ({ title: t('consignmentInvoice', locale) })}
      />
      <Drawer.Screen
        name="payment-schedule"
        options={({ route }) => ({ title: t('scheduledPayments', locale) })}
      />
      
      {/* Shelf Sales Screens */}
      <Drawer.Screen
        name="daily-invoice"
        options={({ route }) => ({ title: t('dailyAggregateInvoice', locale) })}
      />
      
      {/* Reports */}
      <Drawer.Screen
        name="reports"
        options={({ route }) => ({ title: t('reports', locale) })}
      />
      <Drawer.Screen
        name="user-sales-report"
        options={({ route }) => ({ title: locale === 'ar' ? 'تقرير مبيعات المستخدمين' : 'User Sales Report' })}
      />
      
      {/* Invoice Creation Screens */}
      <Drawer.Screen
        name="create-sales-invoice"
        options={({ route }) => ({ 
          title: locale === 'ar' ? 'إنشاء فاتورة مبيعات' : 'Create Sales Invoice',
          drawerItemStyle: { display: 'none' },
        })}
      />
      <Drawer.Screen
        name="create-procurement-invoice"
        options={({ route }) => ({ 
          title: locale === 'ar' ? 'إنشاء فاتورة مشتريات' : 'Create Purchase Invoice',
          drawerItemStyle: { display: 'none' },
        })}
      />
      <Drawer.Screen
        name="supplier-invoice-detail"
        options={({ route }) => ({ 
          title: locale === 'ar' ? 'تفاصيل فاتورة المورد' : 'Supplier Invoice Detail',
          drawerItemStyle: { display: 'none' },
        })}
      />
      <Drawer.Screen
        name="po-detail"
        options={({ route }) => ({ 
          title: locale === 'ar' ? 'تفاصيل أمر الشراء' : 'Purchase Order Details',
          drawerItemStyle: { display: 'none' },
        })}
      />
      <Drawer.Screen
        name="sales-order-detail"
        options={({ route }) => ({ 
          title: locale === 'ar' ? 'تفاصيل أمر البيع' : 'Sales Order Details',
          drawerItemStyle: { display: 'none' },
        })}
      />
      <Drawer.Screen
        name="shelf-request-detail"
        options={({ route }) => ({ 
          title: locale === 'ar' ? 'تفاصيل طلب الرف' : 'Shelf Request Details',
          drawerItemStyle: { display: 'none' },
        })}
      />
      <Drawer.Screen
        name="warehouse-sales-orders"
        options={({ route }) => ({ 
          title: locale === 'ar' ? 'طلبات مبيعات المخزن' : 'Warehouse Sales Orders',
          drawerItemStyle: { display: 'none' },
        })}
      />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default DrawerLayout;
