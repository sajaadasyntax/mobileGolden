// Invoice Types for Sales and Procurement

export type InvoiceType = 'SALES' | 'PROCUREMENT';
export type InvoiceCategory = 'WHOLESALE' | 'RETAIL' | 'CONSIGNMENT';
export type PaymentStatus = 'DRAFT' | 'PENDING' | 'CONFIRMED' | 'PAID' | 'PARTIALLY_PAID' | 'CANCELLED' | 'DEFERRED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHECK' | 'CREDIT' | 'MIXED';

export interface InvoiceItem {
  id: string;
  itemId: string;
  name: string;
  nameAr?: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  unitPriceSdg: number;
  discount?: number;
  discountType?: 'PERCENTAGE' | 'FIXED';
  total: number;
  totalSdg: number;
  unit?: string;
  batchNumber?: string;
  expiryDate?: string;
}

export interface InvoiceParty {
  id?: string;
  name: string;
  nameAr?: string;
  phone?: string;
  email?: string;
  address?: string;
  addressAr?: string;
  taxId?: string;
  creditLimit?: number;
  balance?: number;
}

export interface InvoicePayment {
  id: string;
  method: PaymentMethod;
  amount: number;
  amountSdg: number;
  reference?: string;
  date: string;
  notes?: string;
}

export interface Invoice {
  id?: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  invoiceCategory: InvoiceCategory;
  
  // Dates
  invoiceDate: string;
  dueDate?: string;
  deliveryDate?: string;
  
  // Parties
  customer?: InvoiceParty; // For sales
  supplier?: InvoiceParty; // For procurement
  
  // Branch info
  branchId: string;
  branchName?: string;
  branchNameAr?: string;
  branchAddress?: string;
  branchPhone?: string;
  
  // Items
  items: InvoiceItem[];
  
  // Totals
  subtotal: number;
  subtotalSdg: number;
  discount: number;
  discountSdg: number;
  tax: number;
  taxSdg: number;
  total: number;
  totalSdg: number;
  
  // Exchange rate
  exchangeRate: number;
  
  // Payment
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  payments?: InvoicePayment[];
  amountPaid: number;
  amountPaidSdg: number;
  amountDue: number;
  amountDueSdg: number;
  
  // Additional
  notes?: string;
  notesAr?: string;
  terms?: string;
  termsAr?: string;
  operationNumber?: string;
  poNumber?: string; // For procurement
  
  // Metadata
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  confirmedAt?: string;
  confirmedBy?: string;
}

export interface InvoiceGenerationOptions {
  locale: 'en' | 'ar';
  includePaymentDetails?: boolean;
  includeBankDetails?: boolean;
  showQrCode?: boolean;
  watermark?: string;
}

export interface CompanyInfo {
  name: string;
  nameAr: string;
  address: string;
  addressAr: string;
  phone: string;
  email: string;
  website?: string;
  taxId?: string;
  bankName?: string;
  bankAccount?: string;
  logoUri: string;
}

