import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Get API URL from config or environment
// For Android emulator, use http://10.0.2.2:4000 (special IP that maps to host machine)
// For iOS simulator, use http://localhost:4000
// For physical device, use your computer's IP address (e.g., http://192.168.1.100:4000)
const getDefaultApiUrl = () => {
  if (Platform.OS === 'android') {
    // Android emulator uses 10.0.2.2 to access host machine's localhost
    return 'http://10.0.2.2:4000';
  }
  // iOS simulator and web can use localhost
  return 'http://localhost:4000';
};

const API_URL = 
  process.env.EXPO_PUBLIC_API_URL || 
  Constants.expoConfig?.extra?.apiUrl || 
  getDefaultApiUrl();

// Debug logging (disabled in production)
// console.log('API URL:', API_URL);
// console.log('Platform:', Platform.OS);

// Token storage
export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync('token');
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync('token', token);
}

export async function removeToken(): Promise<void> {
  await SecureStore.deleteItemAsync('token');
}

// API client
interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: object;
  headers?: Record<string, string>;
  retries?: number;
  retryDelay?: number;
}

// Retry configuration
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1 second
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to check if error is retryable
const isRetryableError = (error: any, status?: number): boolean => {
  if (status && RETRYABLE_STATUS_CODES.includes(status)) {
    return true;
  }
  if (error.message === 'Network request failed' || error.message?.includes('Network')) {
    return true;
  }
  if (error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT')) {
    return true;
  }
  return false;
};

export async function apiCall<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const token = await getToken();
  const maxRetries = options.retries ?? DEFAULT_RETRIES;
  const retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });

      // Check if we should retry based on status code
      if (!response.ok && RETRYABLE_STATUS_CODES.includes(response.status) && attempt < maxRetries) {
        const waitTime = retryDelay * Math.pow(2, attempt); // Exponential backoff
        await delay(waitTime);
        continue;
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(error.message || error.error?.message || 'Request failed');
      }

      const data = await response.json();
      // tRPC returns data in result format, extract it
      // Handle both nested (result.data.json) and flat (result.data) structures
      if (data.result && data.result.data) {
        return data.result.data.json || data.result.data;
      }
      return data;
    } catch (error: any) {
      lastError = error;
      
      // Check if we should retry
      if (isRetryableError(error) && attempt < maxRetries) {
        const waitTime = retryDelay * Math.pow(2, attempt); // Exponential backoff
        await delay(waitTime);
        continue;
      }
      
      // Handle network errors with helpful message
      if (error.message === 'Network request failed' || error.message?.includes('Network')) {
        throw new Error(
          `Cannot connect to server at ${API_URL}. ` +
          `Make sure the backend is running and the API URL is correct. ` +
          `For Android emulator, use http://10.0.2.2:4000. ` +
          `For physical device, use your computer's IP address.`
        );
      }
      throw error;
    }
  }
  
  // If we exhausted all retries, throw the last error
  throw lastError || new Error('Request failed after retries');
}

/**
 * Wrapper for tRPC query calls with consistent error handling
 */
async function trpcQuery<T>(endpoint: string, params: object = {}): Promise<T> {
  const token = await getToken();
  const hasParams = Object.keys(params).length > 0;
  const url = hasParams 
    ? `${API_URL}/trpc/${endpoint}?input=${encodeURIComponent(JSON.stringify({ json: params }))}`
    : `${API_URL}/trpc/${endpoint}`;
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const result = await response.json();
  
  // Check for tRPC error format
  if (result.error) {
    const errorMessage = result.error.message || result.error.data?.message || 'Request failed';
    // Handle auth errors - clear token and redirect
    if (response.status === 401 || result.error.data?.code === 'UNAUTHORIZED') {
      await removeToken();
    }
    throw new Error(errorMessage);
  }
  
  if (!response.ok) {
    throw new Error(result.message || 'Request failed');
  }
  
  // Extract data from tRPC response format
  return result.result?.data?.json || result.result?.data || result;
}

/**
 * Wrapper for tRPC mutation calls with consistent error handling
 */
async function trpcMutation<T>(endpoint: string, data: object): Promise<T> {
  const token = await getToken();
  
  const response = await fetch(`${API_URL}/trpc/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ json: data }),
  });

  const result = await response.json();
  
  // Check for tRPC error format
  if (result.error) {
    const errorMessage = result.error.message || result.error.data?.message || 'Request failed';
    // Handle auth errors - clear token and redirect
    if (response.status === 401 || result.error.data?.code === 'UNAUTHORIZED') {
      await removeToken();
    }
    throw new Error(errorMessage);
  }
  
  if (!response.ok) {
    throw new Error(result.message || 'Request failed');
  }
  
  // Extract data from tRPC response format
  return result.result?.data?.json || result.result?.data || result;
}

// tRPC-style API calls
export const api = {
  auth: {
    login: async (email: string, password: string) => {
      try {
        // tRPC mutation format
        const response = await fetch(`${API_URL}/trpc/auth.login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            json: { email, password },
          }),
        });

        const responseData = await response.json();
        // Debug: console.log('Login response:', JSON.stringify(responseData, null, 2));

        if (!response.ok) {
          // tRPC error format
          const error = responseData.error || responseData;
          const errorMessage = error?.message || error?.data?.message || 'Invalid credentials';
          throw new Error(errorMessage);
        }

        // Extract the actual data from tRPC response
        // tRPC returns: { result: { data: { json: { user, token, expiresAt } } } }
        const jsonData = responseData.result?.data?.json || responseData.result?.data || responseData;
        
        if (!jsonData || !jsonData.token) {
          console.error('Token extraction failed. Response structure:', responseData);
          throw new Error('No token received from server');
        }
        
        await setToken(jsonData.token);
        return jsonData;
      } catch (error: any) {
        console.error('Login API error:', error);
        // Handle network errors with better messages
        if (error.message === 'Network request failed' || error.message?.includes('Network')) {
          throw new Error(
            `Cannot connect to server at ${API_URL}.\n\n` +
            `Troubleshooting:\n` +
            `• Make sure backend is running (cd backend && npm run dev)\n` +
            `• Android emulator: Use http://10.0.2.2:4000\n` +
            `• iOS simulator: Use http://localhost:4000\n` +
            `• Physical device: Use your computer's IP (e.g., http://192.168.1.100:4000)\n\n` +
            `Update API URL in app.json or set EXPO_PUBLIC_API_URL environment variable.`
          );
        }
        // Re-throw with better error message
        if (error.message) {
          throw error;
        }
        throw new Error('Network error. Please check your API URL and ensure backend is running.');
      }
    },
    logout: async () => {
      const token = await getToken();
      try {
        await fetch(`${API_URL}/trpc/auth.logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
      } catch (error) {
        console.error('Logout error:', error);
      } finally {
        await removeToken();
      }
    },
    me: async () => {
      const token = await getToken();
      
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      try {
        const response = await fetch(`${API_URL}/trpc/auth.me`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error('Failed to get user');
        }

        const result = await response.json();
        // Handle both nested and flat response structures
        return result.result?.data?.json || result.result?.data || result;
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Request timeout - server may be unreachable');
        }
        throw error;
      }
    },
  },
  dayCycle: {
    getCurrent: (branchId: string) => 
      trpcQuery<any>('dayCycle.getCurrent', { branchId }),
    
    list: (branchId: string, options?: { startDate?: string; endDate?: string; page?: number; pageSize?: number }) => 
      trpcQuery<any>('dayCycle.list', {
        branchId,
        page: options?.page || 1,
        pageSize: options?.pageSize || 30,
        ...(options?.startDate && { startDate: options.startDate }),
        ...(options?.endDate && { endDate: options.endDate }),
      }),
    
    open: (branchId: string, exchangeRate: number) => 
      trpcMutation<any>('dayCycle.open', { branchId, exchangeRateUsdSdg: exchangeRate }),
    
    close: (dayCycleId: string, options?: { force?: boolean; notes?: string }) => 
      trpcMutation<any>('dayCycle.close', { 
        dayCycleId,
        ...(options?.force !== undefined && { force: options.force }),
        ...(options?.notes && { notes: options.notes }),
      }),
    
    reopen: (dayCycleId: string, notes?: string) => 
      trpcMutation<any>('dayCycle.reopen', { 
        dayCycleId,
        ...(notes && { notes }),
      }),
    
    updateExchangeRate: (dayCycleId: string, exchangeRate: number) => 
      trpcMutation<any>('dayCycle.updateExchangeRate', { 
        dayCycleId, 
        exchangeRateUsdSdg: exchangeRate 
      }),
  },
  inventory: {
    items: (page = 1, pageSize = 50) => 
      trpcQuery<any>('inventory.items.list', { page, pageSize, isActive: true }),
    itemsWithPrices: async (branchId: string, page = 1, pageSize = 50) => {
      const token = await getToken();
      // Get items first
      const itemsResponse = await fetch(
        `${API_URL}/trpc/inventory.items.list?input=${encodeURIComponent(JSON.stringify({ json: { page, pageSize, isActive: true } }))}`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );
      const itemsResult = await itemsResponse.json();
      const items = itemsResult.result?.data?.json?.data || itemsResult.result?.data?.data || [];
      
      // Get price policies for each item
      const itemsWithPrices = await Promise.all(
        items.map(async (item: any) => {
          try {
            const priceResponse = await fetch(
              `${API_URL}/trpc/inventory.pricePolicies.getForItem?input=${encodeURIComponent(JSON.stringify({ json: { itemId: item.id, branchId } }))}`,
              {
                headers: {
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
              }
            );
            const priceResult = await priceResponse.json();
            const policy = priceResult.result?.data?.json || priceResult.result?.data || null;
            
            return {
              id: item.id,
              name: item.nameEn,
              nameAr: item.nameAr,
              sku: item.sku,
              wholesalePrice: policy ? Number(policy.wholesalePriceUsd) : 0,
              retailPrice: policy ? Number(policy.retailPriceUsd) : 0,
              unit: item.unit?.symbol || item.unit?.name,
            };
          } catch {
            return {
              id: item.id,
              name: item.nameEn,
              nameAr: item.nameAr,
              sku: item.sku,
              wholesalePrice: 0,
              retailPrice: 0,
              unit: item.unit?.symbol || item.unit?.name,
            };
          }
        })
      );
      
      return itemsWithPrices;
    },
    stock: (branchId: string) => 
      trpcQuery<any>('inventory.stock.list', { branchId }),
    
    shelves: () => 
      trpcQuery<any>('inventory.shelves.list', {}),
    
    warehouses: () => 
      trpcQuery<any>('inventory.warehouses.list', {}),
    
    categories: () => 
      trpcQuery<any>('inventory.categories.list'),
    
    units: () => 
      trpcQuery<any>('inventory.units.list'),
    // Price policies
    pricePolicies: {
      list: (branchId: string, itemId?: string) => 
        trpcQuery<any>('inventory.pricePolicies.list', { 
          branchId, 
          ...(itemId && { itemId }) 
        }),
      
      getForItem: (itemId: string, branchId: string) => 
        trpcQuery<any>('inventory.pricePolicies.getForItem', { itemId, branchId }),
      
      create: (data: {
        itemId: string;
        branchId: string;
        wholesalePriceUsd: number;
        retailPriceUsd: number;
        priceRangeMinUsd: number;
        priceRangeMaxUsd: number;
        effectiveFrom: string;
        effectiveTo?: string;
      }) => trpcMutation<any>('inventory.pricePolicies.create', data),
    },
    // Stock management
    stockManagement: {
      getWarehouseStock: (warehouseId: string, options?: { categoryId?: string; search?: string; page?: number; pageSize?: number }) => 
        trpcQuery<any>('inventory.stock.getWarehouseStock', {
          warehouseId,
          page: options?.page || 1,
          pageSize: options?.pageSize || 20,
          ...(options?.categoryId && { categoryId: options.categoryId }),
          ...(options?.search && { search: options.search }),
        }),
      
      getShelfStock: (shelfId: string, options?: { categoryId?: string; search?: string; page?: number; pageSize?: number }) => 
        trpcQuery<any>('inventory.stock.getShelfStock', {
          shelfId,
          page: options?.page || 1,
          pageSize: options?.pageSize || 20,
          ...(options?.categoryId && { categoryId: options.categoryId }),
          ...(options?.search && { search: options.search }),
        }),
      
      getBatches: (itemId: string, options?: { warehouseId?: string; shelfId?: string; includeEmpty?: boolean }) => 
        trpcQuery<any>('inventory.stock.getBatches', {
          itemId,
          ...(options?.warehouseId && { warehouseId: options.warehouseId }),
          ...(options?.shelfId && { shelfId: options.shelfId }),
          ...(options?.includeEmpty !== undefined && { includeEmpty: options.includeEmpty }),
        }),
      
      getMovements: (options?: { batchId?: string; itemId?: string; startDate?: string; endDate?: string; page?: number; pageSize?: number }) => 
        trpcQuery<any>('inventory.stock.getMovements', {
          page: options?.page || 1,
          pageSize: options?.pageSize || 50,
          ...(options?.batchId && { batchId: options.batchId }),
          ...(options?.itemId && { itemId: options.itemId }),
          ...(options?.startDate && { startDate: options.startDate }),
          ...(options?.endDate && { endDate: options.endDate }),
        }),
    },
  },
  sales: {
    invoices: (branchId: string, page = 1) => 
      trpcQuery<any>('sales.salesInvoices.listByBranch', { branchId, page }),
    
    getInvoice: (id: string) => 
      trpcQuery<any>('sales.salesInvoices.getById', { id }),
    
    createInvoice: (data: {
      shelfId: string;
      customerId?: string;
      invoiceType: 'WHOLESALE' | 'RETAIL';
      notes?: string;
      lines: { itemId: string; qty: number; unitPriceUsd: number }[];
    }) => trpcMutation<any>('sales.salesInvoices.create', data),
    
    voidInvoice: (id: string, reason?: string) => 
      trpcMutation<any>('sales.salesInvoices.void', { id, reason }),
    customers: {
      list: (page = 1, pageSize = 50) => 
        trpcQuery<any>('sales.customers.list', { page, pageSize, isActive: true }),
      
      create: (data: {
        name: string;
        nameAr?: string;
        phone?: string;
        email?: string;
        customerType: 'WHOLESALE' | 'RETAIL';
        creditLimitSdg?: number;
      }) => trpcMutation<any>('sales.customers.create', data),
    },
    // Sales Orders (Warehouse)
    salesOrders: {
      list: (branchId: string, options?: { customerId?: string; status?: string; startDate?: string; endDate?: string; page?: number; pageSize?: number }) => 
        trpcQuery<any>('sales.salesOrders.list', {
          branchId,
          page: options?.page || 1,
          pageSize: options?.pageSize || 20,
          ...(options?.customerId && { customerId: options.customerId }),
          ...(options?.status && { status: options.status }),
          ...(options?.startDate && { startDate: options.startDate }),
          ...(options?.endDate && { endDate: options.endDate }),
        }),
      
      getById: (id: string) => 
        trpcQuery<any>('sales.salesOrders.getById', { id }),
      
      create: (data: {
        customerId: string;
        warehouseId: string;
        notes?: string;
        lines: { itemId: string; qty: number; unitPriceUsd: number }[];
      }) => trpcMutation<any>('sales.salesOrders.create', data),
      
      confirm: (id: string) => 
        trpcMutation<any>('sales.salesOrders.confirm', { id }),
      
      deliver: (data: {
        orderId: string;
        lines: { lineId: string; qtyDelivered: number }[];
      }) => trpcMutation<any>('sales.salesOrders.deliver', data),
    },
    // Goods Requests (Shelf to Warehouse)
    goodsRequests: {
      list: (options?: { shelfId?: string; branchId?: string; status?: string; page?: number; pageSize?: number }) => 
        trpcQuery<any>('sales.goodsRequests.list', {
          page: options?.page || 1,
          pageSize: options?.pageSize || 20,
          ...(options?.shelfId && { shelfId: options.shelfId }),
          ...(options?.branchId && { branchId: options.branchId }),
          ...(options?.status && { status: options.status }),
        }),
      
      getById: (id: string) => 
        trpcQuery<any>('sales.goodsRequests.getById', { id }),
      
      create: (data: {
        shelfId: string;
        notes?: string;
        lines: { itemId: string; qtyRequested: number }[];
      }) => trpcMutation<any>('sales.goodsRequests.create', data),
      
      submit: (id: string) => 
        trpcMutation<any>('sales.goodsRequests.submit', { id }),
      
      approve: (data: {
        requestId: string;
        notes?: string;
        lines: { lineId: string; qtyApproved: number }[];
      }) => trpcMutation<any>('sales.goodsRequests.approve', data),
      
      reject: (data: {
        requestId: string;
        reason?: string;
      }) => trpcMutation<any>('sales.goodsRequests.reject', data),
      
      issue: (data: {
        requestId: string;
        warehouseId: string;
        lines: { lineId: string; qtyIssued: number }[];
      }) => trpcMutation<any>('sales.goodsRequests.issue', data),
    },
    // Daily aggregate invoice for shelf sales
    dailyAggregate: {
      getOrCreate: (shelfId: string) => 
        trpcQuery<any>('sales.dailyAggregate.getOrCreate', { shelfId }),
      
      update: (shelfId: string, data: {
        cashTotalSdg?: number;
        cardTotalSdg?: number;
        itemCount?: number;
        transactionCount?: number;
      }) => trpcMutation<any>('sales.dailyAggregate.update', { shelfId, ...data }),
    },
  },
  // Shelf requests (stock replenishment)
  shelfRequests: {
    list: (shelfId?: string, branchId?: string, page = 1) => 
      trpcQuery<any>('inventory.shelfRequests.list', {
        page,
        ...(shelfId && { shelfId }),
        ...(branchId && { branchId }),
      }),
    
    create: (data: {
      shelfId: string;
      lines: { itemId: string; qty: number }[];
      notes?: string;
    }) => trpcMutation<any>('inventory.shelfRequests.create', data),
  },
  procurement: {
    orders: (branchId: string, page = 1, options?: { supplierId?: string; status?: string }) => 
      trpcQuery<any>('procurement.purchaseOrders.list', { 
        branchId, 
        page,
        ...(options?.supplierId && { supplierId: options.supplierId }),
        ...(options?.status && { status: options.status }),
      }),
    
    getOrderById: (id: string) => 
      trpcQuery<any>('procurement.purchaseOrders.getById', { id }),
    
    approve: (id: string) => 
      trpcMutation<any>('procurement.purchaseOrders.approve', { id }),
    
    // Goods Receipt
    goodsReceipts: {
      create: (data: {
        purchaseOrderId: string;
        warehouseId: string;
        notes?: string;
        lines: {
          purchaseOrderLineId: string;
          itemId: string;
          qtyReceived: number;
          unitCostSdg: number;
          expiryDate?: string;
        }[];
      }) => trpcMutation<any>('procurement.goodsReceipts.create', data),
      
      getByPO: (purchaseOrderId: string) => 
        trpcQuery<any>('procurement.goodsReceipts.getByPO', { purchaseOrderId }),
    },
    
    suppliers: {
      list: (page = 1, pageSize = 50) => 
        trpcQuery<any>('procurement.suppliers.list', { page, pageSize, isActive: true }),
      
      getById: (id: string) => 
        trpcQuery<any>('procurement.suppliers.getById', { id }),
      
      create: (data: {
        name: string;
        nameAr?: string;
        phone?: string;
        email?: string;
        address?: string;
      }) => trpcMutation<any>('procurement.suppliers.create', data),
    },
    
    createPurchaseOrder: (data: {
      supplierId: string;
      branchId: string;
      expectedDate?: string;
      notes?: string;
      isConsignment?: boolean;
      poNumber?: string;
      operationNumber?: string;
      lines: { itemId: string; qty: number; unitPriceSdg: number }[];
    }) => trpcMutation<any>('procurement.purchaseOrders.create', data),
    
    supplierInvoices: (page = 1, pageSize = 20) => 
      trpcQuery<any>('procurement.supplierInvoices.list', { page, pageSize }),
    
    createSupplierInvoice: (data: {
      supplierId: string;
      purchaseOrderId?: string;
      invoiceNumber: string;
      totalSdg: number;
      invoiceDate: string;
      dueDate: string;
      notes?: string;
    }) => trpcMutation<any>('procurement.supplierInvoices.create', data),
  },
  // ==================== ACCOUNTING ====================
  accounting: {
    // Accounts
    accounts: {
      list: (accountType?: string) => 
        trpcQuery<any>('accounting.accounts.list', accountType ? { accountType } : {}),
    },
    
    // Transactions
    transactions: {
      list: (branchId: string, options?: { transactionType?: string; startDate?: string; endDate?: string; page?: number; pageSize?: number }) => 
        trpcQuery<any>('accounting.transactions.list', {
          branchId,
          page: options?.page || 1,
          pageSize: options?.pageSize || 20,
          ...(options?.transactionType && { transactionType: options.transactionType }),
          ...(options?.startDate && { startDate: options.startDate }),
          ...(options?.endDate && { endDate: options.endDate }),
        }),
      
      create: (data: {
        transactionType: 'CASH_IN' | 'CASH_OUT' | 'BANK_IN' | 'BANK_OUT' | 'TRANSFER' | 'ADJUSTMENT';
        amountSdg: number;
        fromAccountId?: string;
        toAccountId?: string;
        description: string;
        referenceNumber?: string;
        receiptImages?: string[];
      }) => trpcMutation<any>('accounting.transactions.create', data),
    },
    
    // Expenses
    expenses: {
      list: (branchId: string, options?: { categoryId?: string; startDate?: string; endDate?: string; page?: number; pageSize?: number }) => 
        trpcQuery<any>('accounting.expenses.list', {
          branchId,
          page: options?.page || 1,
          pageSize: options?.pageSize || 20,
          ...(options?.categoryId && { categoryId: options.categoryId }),
          ...(options?.startDate && { startDate: options.startDate }),
          ...(options?.endDate && { endDate: options.endDate }),
        }),
      
      create: (data: {
        categoryId: string;
        amountSdg: number;
        description: string;
      }) => trpcMutation<any>('accounting.expenses.create', data),
      
      approve: (id: string) => 
        trpcMutation<any>('accounting.expenses.approve', { id }),
      
      categories: {
        list: () => trpcQuery<any>('accounting.expenses.categories.list'),
      },
    },
    
    // Reports
    reports: {
      dashboard: (branchId: string) => 
        trpcQuery<any>('accounting.reports.dashboard', { branchId }),
      
      liquidAssets: (branchId: string) => 
        trpcQuery<any>('accounting.reports.liquidAssets', { branchId }),
      
      outstandingPayables: (branchId?: string, supplierId?: string) => 
        trpcQuery<any>('accounting.reports.outstandingPayables', {
          ...(branchId && { branchId }),
          ...(supplierId && { supplierId }),
        }),
      
      outstandingReceivables: (branchId?: string, customerId?: string) => 
        trpcQuery<any>('accounting.reports.outstandingReceivables', {
          ...(branchId && { branchId }),
          ...(customerId && { customerId }),
        }),
      
      balanceSheet: (branchId: string, asOfDate?: string) => 
        trpcQuery<any>('accounting.reports.balanceSheet', {
          branchId,
          ...(asOfDate && { asOfDate }),
        }),
    },
    
    // Budget
    budget: {
      list: (branchId: string, period?: string) => 
        trpcQuery<any>('accounting.budget.list', {
          branchId,
          ...(period && { period }),
        }),
      
      getPreviousPeriods: (branchId: string, months = 6) => 
        trpcQuery<any>('accounting.budget.getPreviousPeriods', { branchId, months }),
    },
    
    // Payment Schedules
    paymentSchedules: {
      list: (options?: { status?: string; supplierId?: string; startDate?: string; endDate?: string; page?: number; pageSize?: number }) => 
        trpcQuery<any>('accounting.paymentSchedules.list', {
          page: options?.page || 1,
          pageSize: options?.pageSize || 20,
          ...(options?.status && { status: options.status }),
          ...(options?.supplierId && { supplierId: options.supplierId }),
          ...(options?.startDate && { startDate: options.startDate }),
          ...(options?.endDate && { endDate: options.endDate }),
        }),
      
      create: (data: { invoiceId: string; amountSdg: number; dueDate: string; notes?: string }) => 
        trpcMutation<any>('accounting.paymentSchedules.create', data),
      
      markPaid: (id: string) => 
        trpcMutation<any>('accounting.paymentSchedules.markPaid', { id }),
    },
    
    // Bank Notices (Match Operation)
    bankNotices: {
      list: (options?: { isMatched?: boolean; supplierId?: string; page?: number; pageSize?: number }) => 
        trpcQuery<any>('accounting.bankNotices.list', {
          page: options?.page || 1,
          pageSize: options?.pageSize || 20,
          ...(options?.isMatched !== undefined && { isMatched: options.isMatched }),
          ...(options?.supplierId && { supplierId: options.supplierId }),
        }),
      
      create: (data: { invoiceId: string; operationNumber: string; bankReference?: string; amountSdg: number; fileUrl?: string }) => 
        trpcMutation<any>('accounting.bankNotices.create', data),
      
      match: (id: string, operationNumber: string) => 
        trpcMutation<any>('accounting.bankNotices.match', { id, operationNumber }),
    },
    
    // Supplier Invoices (Consignment, Deferred, Issued)
    supplierInvoices: {
      list: (options?: { status?: string; supplierId?: string; isConsignment?: boolean; startDate?: string; endDate?: string; page?: number; pageSize?: number }) => 
        trpcQuery<any>('accounting.supplierInvoices.list', {
          page: options?.page || 1,
          pageSize: options?.pageSize || 20,
          ...(options?.status && { status: options.status }),
          ...(options?.supplierId && { supplierId: options.supplierId }),
          ...(options?.isConsignment !== undefined && { isConsignment: options.isConsignment }),
          ...(options?.startDate && { startDate: options.startDate }),
          ...(options?.endDate && { endDate: options.endDate }),
        }),
      
      listDeferred: (options?: { supplierId?: string; page?: number; pageSize?: number }) => 
        trpcQuery<any>('accounting.supplierInvoices.listDeferred', {
          page: options?.page || 1,
          pageSize: options?.pageSize || 20,
          ...(options?.supplierId && { supplierId: options.supplierId }),
        }),
      
      listIssued: (options?: { supplierId?: string; page?: number; pageSize?: number }) => 
        trpcQuery<any>('accounting.supplierInvoices.listIssued', {
          page: options?.page || 1,
          pageSize: options?.pageSize || 20,
          ...(options?.supplierId && { supplierId: options.supplierId }),
        }),
      
      listConsignment: (options?: { page?: number; pageSize?: number }) => 
        trpcQuery<any>('accounting.supplierInvoices.listConsignment', {
          page: options?.page || 1,
          pageSize: options?.pageSize || 20,
        }),
      
      updateStatus: (id: string, status: string) => 
        trpcMutation<any>('accounting.supplierInvoices.updateStatus', { id, status }),
      
      // Get single invoice by ID
      getById: (id: string) => 
        trpcQuery<any>('accounting.supplierInvoices.getById', { id }),
      
      // Pay invoice (Admin only)
      payInvoice: (data: {
        id: string;
        paymentMethod: 'CASH' | 'BANK_TRANSFER';
        transactionNumber?: string;
        receiptImageUrl?: string;
        paidAmountSdg?: number;
      }) => trpcMutation<any>('accounting.supplierInvoices.payInvoice', data),
      
      // Mark invoice as outstanding (ready for goods receipt)
      markOutstanding: (id: string) => 
        trpcMutation<any>('accounting.supplierInvoices.markOutstanding', { id }),
      
      // Confirm payment (procurement user marks payment as confirmed)
      confirmPayment: (id: string) => 
        trpcMutation<any>('accounting.supplierInvoices.updateStatus', { id, status: 'PAID' }),
    },
    
    // Outstanding Invoices (for mobile screen)
    outstandingInvoices: {
      list: async (branchId: string, type?: 'RECEIVABLE' | 'PAYABLE') => {
        const token = await getToken();
        const params = { branchId };
        
        if (type === 'RECEIVABLE' || !type) {
          // Get sales invoices that are outstanding
          const receivablesResponse = await fetch(
            `${API_URL}/trpc/accounting.reports.outstandingReceivables?input=${encodeURIComponent(JSON.stringify({ json: params }))}`,
            {
              headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            }
          );
          const receivablesResult = await receivablesResponse.json();
          const receivables = receivablesResult.result?.data?.json || receivablesResult.result?.data || { invoices: [] };
          
          if (type === 'RECEIVABLE') {
            return receivables.invoices.map((inv: any) => ({
              ...inv,
              invoiceType: 'RECEIVABLE',
            }));
          }
          
          // Get payables too if no specific type
          const payablesResponse = await fetch(
            `${API_URL}/trpc/accounting.reports.outstandingPayables?input=${encodeURIComponent(JSON.stringify({ json: params }))}`,
            {
              headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            }
          );
          const payablesResult = await payablesResponse.json();
          const payables = payablesResult.result?.data?.json || payablesResult.result?.data || { invoices: [] };
          
          return [
            ...receivables.invoices.map((inv: any) => ({ ...inv, invoiceType: 'RECEIVABLE' })),
            ...payables.invoices.map((inv: any) => ({ ...inv, invoiceType: 'PAYABLE' })),
          ];
        }
        
        // PAYABLE only
        const payablesResponse = await fetch(
          `${API_URL}/trpc/accounting.reports.outstandingPayables?input=${encodeURIComponent(JSON.stringify({ json: params }))}`,
          {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }
        );
        const payablesResult = await payablesResponse.json();
        const payables = payablesResult.result?.data?.json || payablesResult.result?.data || { invoices: [] };
        
        return payables.invoices.map((inv: any) => ({
          ...inv,
          invoiceType: 'PAYABLE',
        }));
      },
    },
  },
  
  // ==================== USERS ====================
  users: {
    list: (options?: { branchId?: string; role?: string; search?: string; page?: number; pageSize?: number }) =>
      trpcQuery<any>('user.list', {
        page: options?.page || 1,
        pageSize: options?.pageSize || 50,
        ...(options?.branchId && { branchId: options.branchId }),
        ...(options?.role && { role: options.role }),
        ...(options?.search && { search: options.search }),
      }),
    
    getById: (id: string) =>
      trpcQuery<any>('user.getById', { id }),
    
    create: (data: {
      email: string;
      password: string;
      name: string;
      nameAr?: string;
      role: 'MANAGER' | 'WAREHOUSE_SALES' | 'SHELF_SALES' | 'PROCUREMENT' | 'ACCOUNTANT';
      branchId?: string;
    }) => trpcMutation<any>('user.create', data),
    
    update: (data: {
      id: string;
      email?: string;
      name?: string;
      nameAr?: string;
      role?: 'MANAGER' | 'WAREHOUSE_SALES' | 'SHELF_SALES' | 'PROCUREMENT' | 'ACCOUNTANT';
      branchId?: string;
      isActive?: boolean;
    }) => trpcMutation<any>('user.update', data),
    
    resetPassword: (userId: string, newPassword: string) =>
      trpcMutation<any>('user.resetPassword', { userId, newPassword }),
  },
  
  // ==================== BRANCHES ====================
  branch: {
    list: () => trpcQuery<any>('branch.list'),
    getById: (id: string) => trpcQuery<any>('branch.getById', { id }),
  },
};
