import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useLocaleStore } from '@/stores/locale';
import { useThemeStore } from '@/stores/theme';
import { t } from '@/lib/i18n';

const logo = require('@/assets/logo.jpeg');

interface MenuSection {
  title: string;
  items: MenuItem[];
  roles?: string[]; // If specified, only these roles can see this section
}

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  roles?: string[]; // If specified, only these roles can see this item
}

// Define which roles can access which features
const ADMIN_ROLES = ['ADMIN', 'MANAGER'];
const PROCUREMENT_ROLES = ['PROCUREMENT'];
const ACCOUNTANT_ROLES = ['ACCOUNTANT'];
const WAREHOUSE_ROLES = ['WAREHOUSE_SALES'];
const SHELF_ROLES = ['SHELF_SALES'];
const ALL_ROLES = [...ADMIN_ROLES, ...PROCUREMENT_ROLES, ...ACCOUNTANT_ROLES, ...WAREHOUSE_ROLES, ...SHELF_ROLES];

export default function CustomDrawer(props: DrawerContentComponentProps) {
  const { user, logout } = useAuthStore();
  const { locale } = useLocaleStore();
  const { theme } = useThemeStore();
  const userRole = user?.role || '';

  // Build menu sections based on user role
  const getMenuSections = (): MenuSection[] => {
    // Admin/Manager gets full access
    if (ADMIN_ROLES.includes(userRole)) {
      return [
        {
          title: t('operationsSection', locale),
          items: [
            { icon: 'grid-outline', label: t('dashboard', locale), route: '/(drawer)/dashboard' },
            { icon: 'cube-outline', label: t('inventory', locale), route: '/(drawer)/inventory' },
            { icon: 'pricetag-outline', label: t('prices', locale), route: '/(drawer)/prices' },
            { icon: 'document-text-outline', label: t('procurementOrders', locale), route: '/(drawer)/procurement' },
            { icon: 'cart-outline', label: t('salesOrders', locale), route: '/(drawer)/sales' },
            { icon: 'layers-outline', label: t('shelfRequests', locale), route: '/(drawer)/shelf-requests' },
            { icon: 'cash-outline', label: t('exchangeRateSetting', locale), route: '/(drawer)/exchange-rate' },
            { icon: 'business-outline', label: t('suppliers', locale), route: '/(drawer)/suppliers' },
            { icon: 'people-outline', label: t('customers', locale), route: '/(drawer)/customers' },
            { icon: 'swap-horizontal-outline', label: t('transactions', locale), route: '/(drawer)/transactions' },
          ],
        },
        {
          title: locale === 'ar' ? 'فواتير الموردين' : 'Supplier Invoices',
          items: [
            { icon: 'documents-outline', label: t('allInvoices', locale), route: '/(drawer)/all-invoices' },
            { icon: 'time-outline', label: t('deferredInvoices', locale), route: '/(drawer)/deferred-invoices' },
            { icon: 'calendar-outline', label: t('scheduledPayments', locale), route: '/(drawer)/payment-schedule' },
            { icon: 'briefcase-outline', label: t('consignmentInvoice', locale), route: '/(drawer)/consignment-invoices' },
          ],
        },
        {
          title: t('accountingSection', locale),
          items: [
            { icon: 'wallet-outline', label: t('liquidAssets', locale), route: '/(drawer)/liquid-assets' },
            { icon: 'receipt-outline', label: t('outstandingInvoices', locale), route: '/(drawer)/outstanding-invoices' },
            { icon: 'card-outline', label: t('expenses', locale), route: '/(drawer)/expenses' },
            { icon: 'business-outline', label: t('bankTransactions', locale), route: '/(drawer)/bank-transactions' },
            { icon: 'card-outline', label: t('bankPayment', locale), route: '/(drawer)/bank-payment' },
          ],
        },
        {
          title: t('payablesReceivables', locale),
          items: [
            { icon: 'calculator-outline', label: t('budget', locale), route: '/(drawer)/budget' },
            { icon: 'time-outline', label: t('previousBudget', locale), route: '/(drawer)/previous-budget' },
          ],
        },
        {
          title: t('reports', locale),
          items: [
            { icon: 'bar-chart-outline', label: t('monthlyReports', locale), route: '/(drawer)/reports' },
            { icon: 'stats-chart-outline', label: locale === 'ar' ? 'تقرير مبيعات المستخدمين' : 'User Sales Report', route: '/(drawer)/user-sales-report' },
          ],
        },
        {
          title: t('generalSection', locale),
          items: [
            { icon: 'people-outline', label: locale === 'ar' ? 'المستخدمون' : 'Users', route: '/(drawer)/users' },
            { icon: 'settings-outline', label: t('settings', locale), route: '/(drawer)/settings' },
          ],
        },
      ];
    }

    // Procurement user gets limited access - only create orders, view inventory, no payment screens
    if (PROCUREMENT_ROLES.includes(userRole)) {
      return [
        {
          title: t('procurementSection', locale),
          items: [
            { icon: 'grid-outline', label: t('dashboard', locale), route: '/(drawer)/dashboard' },
            { icon: 'document-text-outline', label: t('procurementOrders', locale), route: '/(drawer)/procurement' },
            { icon: 'cube-outline', label: t('inventory', locale), route: '/(drawer)/inventory' },
            { icon: 'briefcase-outline', label: t('consignmentInvoice', locale), route: '/(drawer)/consignment-invoices' },
          ],
        },
        {
          title: t('generalSection', locale),
          items: [
            { icon: 'card-outline', label: t('bankPayment', locale), route: '/(drawer)/bank-payment' },
            { icon: 'settings-outline', label: t('settings', locale), route: '/(drawer)/settings' },
          ],
        },
      ];
    }

    // Accountant gets accounting access
    if (ACCOUNTANT_ROLES.includes(userRole)) {
      return [
        {
          title: t('operationsSection', locale),
          items: [
            { icon: 'grid-outline', label: t('dashboard', locale), route: '/(drawer)/dashboard' },
            { icon: 'swap-horizontal-outline', label: t('transactions', locale), route: '/(drawer)/transactions' },
          ],
        },
        {
          title: t('accountingSection', locale),
          items: [
            { icon: 'wallet-outline', label: t('liquidAssets', locale), route: '/(drawer)/liquid-assets' },
            { icon: 'receipt-outline', label: t('outstandingInvoices', locale), route: '/(drawer)/outstanding-invoices' },
            { icon: 'card-outline', label: t('expenses', locale), route: '/(drawer)/expenses' },
            { icon: 'business-outline', label: t('bankTransactions', locale), route: '/(drawer)/bank-transactions' },
            { icon: 'card-outline', label: t('bankPayment', locale), route: '/(drawer)/bank-payment' },
          ],
        },
        {
          title: t('payablesReceivables', locale),
          items: [
            { icon: 'calculator-outline', label: t('budget', locale), route: '/(drawer)/budget' },
            { icon: 'time-outline', label: t('previousBudget', locale), route: '/(drawer)/previous-budget' },
          ],
        },
        {
          title: t('generalSection', locale),
          items: [
            { icon: 'settings-outline', label: t('settings', locale), route: '/(drawer)/settings' },
          ],
        },
      ];
    }

    // Warehouse sales staff
    if (WAREHOUSE_ROLES.includes(userRole)) {
      return [
        {
          title: t('operationsSection', locale),
          items: [
            { icon: 'grid-outline', label: t('dashboard', locale), route: '/(drawer)/dashboard' },
            { icon: 'cube-outline', label: t('inventory', locale), route: '/(drawer)/inventory' },
          ],
        },
        {
          title: locale === 'ar' ? 'استلام البضائع' : 'Receiving',
          items: [
            { icon: 'download-outline', label: locale === 'ar' ? 'أوامر الشراء' : 'Purchase Orders', route: '/(drawer)/procurement' },
          ],
        },
        {
          title: locale === 'ar' ? 'التسليم' : 'Delivery',
          items: [
            { icon: 'send-outline', label: locale === 'ar' ? 'طلبات البيع' : 'Sales Orders', route: '/(drawer)/warehouse-sales-orders' },
            { icon: 'layers-outline', label: locale === 'ar' ? 'طلبات الرفوف' : 'Shelf Requests', route: '/(drawer)/shelf-requests' },
          ],
        },
        {
          title: t('generalSection', locale),
          items: [
            { icon: 'card-outline', label: t('bankPayment', locale), route: '/(drawer)/bank-payment' },
            { icon: 'settings-outline', label: t('settings', locale), route: '/(drawer)/settings' },
          ],
        },
      ];
    }

    // Shelf sales staff
    if (SHELF_ROLES.includes(userRole)) {
      return [
        {
          title: t('operationsSection', locale),
          items: [
            { icon: 'grid-outline', label: t('dashboard', locale), route: '/(drawer)/dashboard' },
            { icon: 'flash-outline', label: t('dailyAggregateInvoice', locale), route: '/(drawer)/daily-invoice' },
            { icon: 'cart-outline', label: t('salesOrders', locale), route: '/(drawer)/sales' },
            { icon: 'cube-outline', label: locale === 'ar' ? 'مخزون الرف' : 'Shelf Inventory', route: '/(drawer)/shelf-inventory' },
            { icon: 'people-outline', label: t('customers', locale), route: '/(drawer)/customers' },
            { icon: 'layers-outline', label: t('shelfRequests', locale), route: '/(drawer)/shelf-requests' },
          ],
        },
        {
          title: t('generalSection', locale),
          items: [
            { icon: 'card-outline', label: t('bankPayment', locale), route: '/(drawer)/bank-payment' },
            { icon: 'settings-outline', label: t('settings', locale), route: '/(drawer)/settings' },
          ],
        },
      ];
    }

    // Default fallback - minimal access
    return [
      {
        title: t('generalSection', locale),
        items: [
          { icon: 'grid-outline', label: t('dashboard', locale), route: '/(drawer)/dashboard' },
          { icon: 'card-outline', label: t('bankPayment', locale), route: '/(drawer)/bank-payment' },
          { icon: 'settings-outline', label: t('settings', locale), route: '/(drawer)/settings' },
        ],
      },
    ];
  };

  const menuSections = getMenuSections();

  const handleNavigation = (route: string) => {
    router.push(route as any);
    props.navigation.closeDrawer();
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const isRtl = locale === 'ar';

  // Dynamic styles based on theme
  const dynamicStyles = {
    container: {
      backgroundColor: theme.drawer,
    },
    header: {
      backgroundColor: theme.drawerHeader,
      borderBottomColor: theme.drawerBorder,
    },
    userName: {
      color: theme.text,
    },
    userEmail: {
      color: theme.textSecondary,
    },
    sectionTitle: {
      color: theme.primary,
    },
    menuIconContainer: {
      backgroundColor: theme.backgroundTertiary,
    },
    menuIconActive: {
      backgroundColor: theme.primaryBackground,
    },
    menuLabel: {
      color: theme.textSecondary,
    },
    menuLabelActive: {
      color: theme.text,
    },
    menuItemActive: {
      backgroundColor: theme.drawerActive,
    },
    logoutButton: {
      backgroundColor: theme.errorBackground,
      borderColor: `${theme.error}30`,
    },
    logoutIconContainer: {
      backgroundColor: `${theme.error}20`,
    },
  };

  return (
    <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top', 'bottom']}>
      {/* User Header */}
      <View style={[styles.header, dynamicStyles.header]}>
        <Image source={logo} style={styles.drawerLogo} />
        <View style={[styles.userInfo, isRtl && styles.userInfoRtl]}>
          <Text style={[styles.userName, dynamicStyles.userName, isRtl && styles.textRtl]}>{user?.name}</Text>
          <Text style={[styles.userEmail, dynamicStyles.userEmail, isRtl && styles.textRtl]}>{user?.email}</Text>
        </View>
      </View>

      {/* Menu Sections */}
      <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
        {menuSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle, isRtl && styles.textRtl]}>
              {section.title}
            </Text>
            {section.items.map((item, itemIndex) => {
              const isActive = props.state.routes[props.state.index]?.name === item.route.split('/').pop();
              return (
                <TouchableOpacity
                  key={itemIndex}
                  style={[
                    styles.menuItem,
                    isActive && [styles.menuItemActive, dynamicStyles.menuItemActive],
                    isRtl && styles.menuItemRtl,
                  ]}
                  onPress={() => handleNavigation(item.route)}
                >
                  <View style={[
                    styles.menuIconContainer, 
                    dynamicStyles.menuIconContainer,
                    isActive && dynamicStyles.menuIconActive
                  ]}>
                    <Ionicons
                      name={item.icon}
                      size={20}
                      color={isActive ? theme.primary : theme.textSecondary}
                    />
                  </View>
                  <Text
                    style={[
                      styles.menuLabel,
                      dynamicStyles.menuLabel,
                      isActive && [styles.menuLabelActive, dynamicStyles.menuLabelActive],
                      isRtl && styles.textRtl,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* Logout Button */}
      <TouchableOpacity
        style={[styles.logoutButton, dynamicStyles.logoutButton, isRtl && styles.menuItemRtl]}
        onPress={handleLogout}
      >
        <View style={[styles.logoutIconContainer, dynamicStyles.logoutIconContainer]}>
          <Ionicons name="log-out-outline" size={20} color={theme.error} />
        </View>
        <Text style={[styles.logoutText, isRtl && styles.textRtl]}>
          {t('logout', locale)}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 20,
    borderBottomWidth: 1,
  },
  drawerLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  userInfoRtl: {
    alignItems: 'flex-end',
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 13,
    marginBottom: 8,
  },
  branchText: {
    fontSize: 11,
    fontWeight: '500',
  },
  menuContainer: {
    flex: 1,
    paddingTop: 8,
  },
  section: {
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 2,
  },
  menuItemRtl: {
    flexDirection: 'row-reverse',
  },
  menuItemActive: {},
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuLabel: {
    fontSize: 15,
    flex: 1,
  },
  menuLabelActive: {
    fontWeight: '500',
  },
  textRtl: {
    textAlign: 'right',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 12,
    marginBottom: 32,
    borderRadius: 12,
    borderWidth: 1,
  },
  logoutIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  logoutText: {
    fontSize: 15,
    color: '#ef4444',
    fontWeight: '500',
    flex: 1,
  },
});
