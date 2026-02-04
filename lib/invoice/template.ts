import { Invoice, InvoiceGenerationOptions, CompanyInfo, InvoiceItem } from './types';

// Company default info - can be overridden
const DEFAULT_COMPANY: CompanyInfo = {
  name: 'Golden Trading Company',
  nameAr: 'شركة الذهبي للتجارة',
  address: 'Khartoum, Sudan',
  addressAr: 'الخرطوم، السودان',
  phone: '+249 123 456 789',
  email: 'info@golden-trading.com',
  website: 'www.golden-trading.com',
  taxId: 'TAX-123456789',
  bankName: 'Bank of Khartoum',
  bankAccount: '1234567890',
  logoUri: '',
};

const formatDate = (dateString: string, locale: 'en' | 'ar'): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatCurrency = (amount: number, currency: 'USD' | 'SDG', locale: 'en' | 'ar'): string => {
  const currencySymbol = currency === 'USD' ? '$' : 'SDG';
  const formattedAmount = amount.toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return locale === 'ar' ? `${formattedAmount} ${currencySymbol}` : `${currencySymbol} ${formattedAmount}`;
};

const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    DRAFT: '#8b8ba7',
    PENDING: '#f59e0b',
    CONFIRMED: '#6366f1',
    PAID: '#10b981',
    PARTIALLY_PAID: '#3b82f6',
    CANCELLED: '#ef4444',
    DEFERRED: '#8b5cf6',
  };
  return colors[status] || '#8b8ba7';
};

const getStatusText = (status: string, locale: 'en' | 'ar'): string => {
  const texts: Record<string, { en: string; ar: string }> = {
    DRAFT: { en: 'Draft', ar: 'مسودة' },
    PENDING: { en: 'Pending', ar: 'قيد الانتظار' },
    CONFIRMED: { en: 'Confirmed', ar: 'مؤكدة' },
    PAID: { en: 'Paid', ar: 'مدفوعة' },
    PARTIALLY_PAID: { en: 'Partially Paid', ar: 'مدفوعة جزئياً' },
    CANCELLED: { en: 'Cancelled', ar: 'ملغية' },
    DEFERRED: { en: 'Deferred', ar: 'مؤجلة' },
  };
  return texts[status]?.[locale] || status;
};

const getInvoiceTypeText = (type: string, locale: 'en' | 'ar'): string => {
  const texts: Record<string, { en: string; ar: string }> = {
    SALES: { en: 'Sales Invoice', ar: 'فاتورة مبيعات' },
    PROCUREMENT: { en: 'Purchase Invoice', ar: 'فاتورة مشتريات' },
  };
  return texts[type]?.[locale] || type;
};

const generateItemsTableRows = (items: InvoiceItem[], locale: 'en' | 'ar'): string => {
  return items.map((item, index) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #6b7280;">${index + 1}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <div style="font-weight: 500; color: #1a1a2e;">${locale === 'ar' ? (item.nameAr || item.name) : item.name}</div>
        ${item.sku ? `<div style="font-size: 11px; color: #8b8ba7; margin-top: 2px;">SKU: ${item.sku}</div>` : ''}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity} ${item.unit || ''}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: ${locale === 'ar' ? 'left' : 'right'};">
        <div>${formatCurrency(item.unitPrice, 'USD', locale)}</div>
        <div style="font-size: 11px; color: #8b8ba7;">${formatCurrency(item.unitPriceSdg, 'SDG', locale)}</div>
      </td>
      ${item.discount ? `<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #ef4444;">${item.discountType === 'PERCENTAGE' ? `${item.discount}%` : formatCurrency(item.discount, 'USD', locale)}</td>` : '<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">-</td>'}
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: ${locale === 'ar' ? 'left' : 'right'}; font-weight: 600;">
        <div>${formatCurrency(item.total, 'USD', locale)}</div>
        <div style="font-size: 11px; color: #8b8ba7; font-weight: 400;">${formatCurrency(item.totalSdg, 'SDG', locale)}</div>
      </td>
    </tr>
  `).join('');
};

export const generateInvoiceHTML = (
  invoice: Invoice,
  options: InvoiceGenerationOptions,
  company: CompanyInfo = DEFAULT_COMPANY,
  logoBase64?: string
): string => {
  const { locale } = options;
  const isRtl = locale === 'ar';
  const dir = isRtl ? 'rtl' : 'ltr';
  
  const party = invoice.invoiceType === 'SALES' ? invoice.customer : invoice.supplier;
  const partyLabel = invoice.invoiceType === 'SALES' 
    ? (locale === 'ar' ? 'العميل' : 'Customer')
    : (locale === 'ar' ? 'المورد' : 'Supplier');

  const labels = {
    invoice: locale === 'ar' ? 'فاتورة' : 'INVOICE',
    invoiceNo: locale === 'ar' ? 'رقم الفاتورة' : 'Invoice No.',
    date: locale === 'ar' ? 'التاريخ' : 'Date',
    dueDate: locale === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date',
    status: locale === 'ar' ? 'الحالة' : 'Status',
    billTo: locale === 'ar' ? 'فاتورة إلى' : 'Bill To',
    item: locale === 'ar' ? 'الصنف' : 'Item',
    qty: locale === 'ar' ? 'الكمية' : 'Qty',
    unitPrice: locale === 'ar' ? 'سعر الوحدة' : 'Unit Price',
    discount: locale === 'ar' ? 'الخصم' : 'Discount',
    total: locale === 'ar' ? 'الإجمالي' : 'Total',
    subtotal: locale === 'ar' ? 'المجموع الفرعي' : 'Subtotal',
    tax: locale === 'ar' ? 'الضريبة' : 'Tax',
    grandTotal: locale === 'ar' ? 'الإجمالي الكلي' : 'Grand Total',
    amountPaid: locale === 'ar' ? 'المبلغ المدفوع' : 'Amount Paid',
    amountDue: locale === 'ar' ? 'المبلغ المستحق' : 'Amount Due',
    exchangeRate: locale === 'ar' ? 'سعر الصرف' : 'Exchange Rate',
    notes: locale === 'ar' ? 'ملاحظات' : 'Notes',
    terms: locale === 'ar' ? 'الشروط والأحكام' : 'Terms & Conditions',
    bankDetails: locale === 'ar' ? 'التفاصيل البنكية' : 'Bank Details',
    bankName: locale === 'ar' ? 'اسم البنك' : 'Bank Name',
    accountNo: locale === 'ar' ? 'رقم الحساب' : 'Account No.',
    thankYou: locale === 'ar' ? 'شكراً لتعاملكم معنا' : 'Thank you for your business!',
    phone: locale === 'ar' ? 'الهاتف' : 'Phone',
    email: locale === 'ar' ? 'البريد' : 'Email',
    poNumber: locale === 'ar' ? 'رقم أمر الشراء' : 'PO Number',
    operationNo: locale === 'ar' ? 'رقم العملية' : 'Operation No.',
  };

  return `
<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+Arabic:wght@300;400;500;600;700&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: ${isRtl ? "'Noto Sans Arabic', 'Inter', sans-serif" : "'Inter', 'Noto Sans Arabic', sans-serif"};
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      color: #1a1a2e;
      line-height: 1.6;
      padding: 20px;
    }
    
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
      overflow: hidden;
    }
    
    .invoice-header {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      padding: 40px;
      color: white;
      position: relative;
      overflow: hidden;
    }
    
    .invoice-header::before {
      content: '';
      position: absolute;
      top: -50%;
      ${isRtl ? 'left' : 'right'}: -20%;
      width: 60%;
      height: 200%;
      background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 100%);
      transform: rotate(-15deg);
    }
    
    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      position: relative;
      z-index: 1;
    }
    
    .company-info {
      flex: 1;
    }
    
    .logo-container {
      width: 100px;
      height: 100px;
      background: white;
      border-radius: 16px;
      padding: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    }
    
    .logo-container img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    
    .company-name {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 8px;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .company-details {
      font-size: 13px;
      opacity: 0.9;
      line-height: 1.8;
    }
    
    .invoice-title-section {
      background: #f8f9fa;
      padding: 30px 40px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .invoice-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    
    .invoice-type-badge {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: white;
      padding: 8px 20px;
      border-radius: 30px;
      font-weight: 600;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .invoice-number {
      font-size: 24px;
      font-weight: 700;
      color: #1a1a2e;
      font-family: 'Courier New', monospace;
    }
    
    .invoice-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 20px;
    }
    
    .meta-item {
      background: white;
      padding: 15px 20px;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
    }
    
    .meta-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #8b8ba7;
      margin-bottom: 5px;
    }
    
    .meta-value {
      font-size: 15px;
      font-weight: 600;
      color: #1a1a2e;
    }
    
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    
    .parties-section {
      padding: 30px 40px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      background: white;
    }
    
    .party-card {
      background: #f8f9fa;
      padding: 25px;
      border-radius: 16px;
      border: 1px solid #e5e7eb;
    }
    
    .party-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #6366f1;
      margin-bottom: 12px;
      font-weight: 600;
    }
    
    .party-name {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a2e;
      margin-bottom: 10px;
    }
    
    .party-details {
      font-size: 13px;
      color: #6b7280;
      line-height: 1.8;
    }
    
    .items-section {
      padding: 0 40px 30px;
    }
    
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    
    .items-table thead {
      background: linear-gradient(135deg, #1a1a2e 0%, #2a2a3e 100%);
      color: white;
    }
    
    .items-table th {
      padding: 16px;
      text-align: ${isRtl ? 'right' : 'left'};
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .items-table th:first-child {
      border-radius: ${isRtl ? '0 12px 0 0' : '12px 0 0 0'};
    }
    
    .items-table th:last-child {
      border-radius: ${isRtl ? '12px 0 0 0' : '0 12px 0 0'};
    }
    
    .totals-section {
      padding: 0 40px 40px;
    }
    
    .totals-container {
      background: linear-gradient(135deg, #f8f9fa 0%, #f1f3f5 100%);
      border-radius: 16px;
      padding: 25px;
      margin-${isRtl ? 'right' : 'left'}: auto;
      width: 350px;
    }
    
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px dashed #e5e7eb;
    }
    
    .totals-row:last-child {
      border-bottom: none;
    }
    
    .totals-row.grand-total {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: white;
      margin: 15px -25px -25px;
      padding: 20px 25px;
      border-radius: 0 0 16px 16px;
    }
    
    .totals-label {
      color: #6b7280;
      font-size: 14px;
    }
    
    .totals-value {
      font-weight: 600;
      font-size: 15px;
    }
    
    .totals-row.grand-total .totals-label,
    .totals-row.grand-total .totals-value {
      color: white;
      font-size: 16px;
    }
    
    .totals-row.grand-total .totals-value {
      font-size: 20px;
      font-weight: 700;
    }
    
    .sdg-value {
      font-size: 12px;
      color: #8b8ba7;
      margin-top: 2px;
    }
    
    .notes-section {
      padding: 0 40px 40px;
    }
    
    .notes-card {
      background: #fffbeb;
      border: 1px solid #fcd34d;
      border-radius: 12px;
      padding: 20px;
    }
    
    .notes-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #92400e;
      margin-bottom: 10px;
      font-weight: 600;
    }
    
    .notes-text {
      font-size: 14px;
      color: #78350f;
      line-height: 1.6;
    }
    
    .footer-section {
      background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%);
      padding: 40px;
      color: white;
    }
    
    .footer-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    
    .bank-details {
      background: rgba(255, 255, 255, 0.1);
      padding: 20px;
      border-radius: 12px;
      flex: 1;
      margin-${isRtl ? 'left' : 'right'}: 30px;
    }
    
    .bank-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #a1a1aa;
      margin-bottom: 15px;
    }
    
    .bank-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 14px;
    }
    
    .bank-label {
      color: #a1a1aa;
    }
    
    .bank-value {
      font-weight: 500;
    }
    
    .thank-you {
      text-align: center;
      flex: 1;
    }
    
    .thank-you-text {
      font-size: 18px;
      font-weight: 600;
      color: #6366f1;
      margin-bottom: 10px;
    }
    
    .contact-info {
      font-size: 13px;
      color: #a1a1aa;
    }
    
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 100px;
      font-weight: 700;
      color: rgba(99, 102, 241, 0.05);
      text-transform: uppercase;
      pointer-events: none;
      z-index: 0;
    }
    
    @media print {
      body {
        padding: 0;
        background: white;
      }
      
      .invoice-container {
        box-shadow: none;
        border-radius: 0;
      }
    }
  </style>
</head>
<body>
  ${options.watermark ? `<div class="watermark">${options.watermark}</div>` : ''}
  
  <div class="invoice-container">
    <!-- Header -->
    <div class="invoice-header">
      <div class="header-content">
        <div class="company-info">
          <div class="company-name">${isRtl ? company.nameAr : company.name}</div>
          <div class="company-details">
            ${isRtl ? company.addressAr : company.address}<br>
            ${labels.phone}: ${company.phone}<br>
            ${labels.email}: ${company.email}
            ${company.taxId ? `<br>Tax ID: ${company.taxId}` : ''}
          </div>
        </div>
        <div class="logo-container">
          ${logoBase64 ? `<img src="${logoBase64}" alt="Logo">` : '<div style="color: #6366f1; font-weight: 700; font-size: 24px;">GOLDEN</div>'}
        </div>
      </div>
    </div>
    
    <!-- Invoice Title Section -->
    <div class="invoice-title-section">
      <div class="invoice-title-row">
        <span class="invoice-type-badge">${getInvoiceTypeText(invoice.invoiceType, locale)}</span>
        <span class="invoice-number">${invoice.invoiceNumber}</span>
      </div>
      
      <div class="invoice-meta">
        <div class="meta-item">
          <div class="meta-label">${labels.date}</div>
          <div class="meta-value">${formatDate(invoice.invoiceDate, locale)}</div>
        </div>
        ${invoice.dueDate ? `
        <div class="meta-item">
          <div class="meta-label">${labels.dueDate}</div>
          <div class="meta-value">${formatDate(invoice.dueDate, locale)}</div>
        </div>
        ` : ''}
        <div class="meta-item">
          <div class="meta-label">${labels.status}</div>
          <div class="meta-value">
            <span class="status-badge" style="background: ${getStatusColor(invoice.paymentStatus)}20; color: ${getStatusColor(invoice.paymentStatus)}">
              ${getStatusText(invoice.paymentStatus, locale)}
            </span>
          </div>
        </div>
        <div class="meta-item">
          <div class="meta-label">${labels.exchangeRate}</div>
          <div class="meta-value">1 USD = ${invoice.exchangeRate.toLocaleString()} SDG</div>
        </div>
        ${invoice.poNumber ? `
        <div class="meta-item">
          <div class="meta-label">${labels.poNumber}</div>
          <div class="meta-value">${invoice.poNumber}</div>
        </div>
        ` : ''}
        ${invoice.operationNumber ? `
        <div class="meta-item">
          <div class="meta-label">${labels.operationNo}</div>
          <div class="meta-value">${invoice.operationNumber}</div>
        </div>
        ` : ''}
      </div>
    </div>
    
    <!-- Parties Section -->
    <div class="parties-section">
      <div class="party-card">
        <div class="party-label">${locale === 'ar' ? 'من' : 'From'}</div>
        <div class="party-name">${isRtl ? company.nameAr : company.name}</div>
        <div class="party-details">
          ${isRtl ? company.addressAr : company.address}<br>
          ${labels.phone}: ${company.phone}<br>
          ${labels.email}: ${company.email}
        </div>
      </div>
      
      ${party ? `
      <div class="party-card">
        <div class="party-label">${partyLabel}</div>
        <div class="party-name">${isRtl ? (party.nameAr || party.name) : party.name}</div>
        <div class="party-details">
          ${party.address ? `${isRtl ? (party.addressAr || party.address) : party.address}<br>` : ''}
          ${party.phone ? `${labels.phone}: ${party.phone}<br>` : ''}
          ${party.email ? `${labels.email}: ${party.email}` : ''}
          ${party.taxId ? `<br>Tax ID: ${party.taxId}` : ''}
        </div>
      </div>
      ` : `
      <div class="party-card">
        <div class="party-label">${partyLabel}</div>
        <div class="party-name">${locale === 'ar' ? 'عميل نقدي' : 'Walk-in Customer'}</div>
      </div>
      `}
    </div>
    
    <!-- Items Section -->
    <div class="items-section">
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 50px; text-align: center;">#</th>
            <th>${labels.item}</th>
            <th style="width: 80px; text-align: center;">${labels.qty}</th>
            <th style="width: 120px; text-align: ${isRtl ? 'left' : 'right'};">${labels.unitPrice}</th>
            <th style="width: 80px; text-align: center;">${labels.discount}</th>
            <th style="width: 130px; text-align: ${isRtl ? 'left' : 'right'};">${labels.total}</th>
          </tr>
        </thead>
        <tbody>
          ${generateItemsTableRows(invoice.items, locale)}
        </tbody>
      </table>
    </div>
    
    <!-- Totals Section -->
    <div class="totals-section">
      <div class="totals-container">
        <div class="totals-row">
          <span class="totals-label">${labels.subtotal}</span>
          <span class="totals-value">
            ${formatCurrency(invoice.subtotal, 'USD', locale)}
            <div class="sdg-value">${formatCurrency(invoice.subtotalSdg, 'SDG', locale)}</div>
          </span>
        </div>
        ${invoice.discount > 0 ? `
        <div class="totals-row">
          <span class="totals-label">${labels.discount}</span>
          <span class="totals-value" style="color: #ef4444;">
            -${formatCurrency(invoice.discount, 'USD', locale)}
            <div class="sdg-value">-${formatCurrency(invoice.discountSdg, 'SDG', locale)}</div>
          </span>
        </div>
        ` : ''}
        ${invoice.tax > 0 ? `
        <div class="totals-row">
          <span class="totals-label">${labels.tax}</span>
          <span class="totals-value">
            ${formatCurrency(invoice.tax, 'USD', locale)}
            <div class="sdg-value">${formatCurrency(invoice.taxSdg, 'SDG', locale)}</div>
          </span>
        </div>
        ` : ''}
        ${options.includePaymentDetails && invoice.amountPaid > 0 ? `
        <div class="totals-row">
          <span class="totals-label">${labels.amountPaid}</span>
          <span class="totals-value" style="color: #10b981;">
            ${formatCurrency(invoice.amountPaid, 'USD', locale)}
            <div class="sdg-value">${formatCurrency(invoice.amountPaidSdg, 'SDG', locale)}</div>
          </span>
        </div>
        <div class="totals-row">
          <span class="totals-label">${labels.amountDue}</span>
          <span class="totals-value" style="color: #f59e0b;">
            ${formatCurrency(invoice.amountDue, 'USD', locale)}
            <div class="sdg-value">${formatCurrency(invoice.amountDueSdg, 'SDG', locale)}</div>
          </span>
        </div>
        ` : ''}
        <div class="totals-row grand-total">
          <span class="totals-label">${labels.grandTotal}</span>
          <span class="totals-value">
            ${formatCurrency(invoice.total, 'USD', locale)}
            <div class="sdg-value" style="color: rgba(255,255,255,0.8);">${formatCurrency(invoice.totalSdg, 'SDG', locale)}</div>
          </span>
        </div>
      </div>
    </div>
    
    <!-- Notes Section -->
    ${(invoice.notes || invoice.notesAr) ? `
    <div class="notes-section">
      <div class="notes-card">
        <div class="notes-title">${labels.notes}</div>
        <div class="notes-text">${isRtl ? (invoice.notesAr || invoice.notes) : invoice.notes}</div>
      </div>
    </div>
    ` : ''}
    
    <!-- Footer Section -->
    <div class="footer-section">
      <div class="footer-content">
        ${options.includeBankDetails && company.bankName ? `
        <div class="bank-details">
          <div class="bank-title">${labels.bankDetails}</div>
          <div class="bank-row">
            <span class="bank-label">${labels.bankName}:</span>
            <span class="bank-value">${company.bankName}</span>
          </div>
          <div class="bank-row">
            <span class="bank-label">${labels.accountNo}:</span>
            <span class="bank-value">${company.bankAccount}</span>
          </div>
        </div>
        ` : '<div></div>'}
        
        <div class="thank-you">
          <div class="thank-you-text">${labels.thankYou}</div>
          <div class="contact-info">
            ${company.website || ''}<br>
            ${company.email}
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

