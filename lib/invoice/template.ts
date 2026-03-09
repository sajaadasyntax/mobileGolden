import { Invoice, InvoiceGenerationOptions, CompanyInfo, InvoiceItem } from './types';

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

const escapeHtml = (str: string | undefined | null): string => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const formatDate = (dateString: string, locale: 'en' | 'ar'): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
};

const formatCurrency = (amount: number, currency: 'USD' | 'SDG', locale: 'en' | 'ar'): string => {
  const formatted = amount.toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'USD' ? `$${formatted}` : `${formatted} SDG`;
};

const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    DRAFT: '#6b7280',
    PENDING: '#d97706',
    CONFIRMED: '#2563eb',
    PAID: '#16a34a',
    PARTIALLY_PAID: '#0284c7',
    CANCELLED: '#dc2626',
    DEFERRED: '#7c3aed',
    ISSUED: '#059669',
  };
  return colors[status] || '#6b7280';
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
    ISSUED: { en: 'Issued', ar: 'مُصدرة' },
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

const getPaymentMethodText = (method: string, locale: 'en' | 'ar'): string => {
  const texts: Record<string, { en: string; ar: string }> = {
    CASH: { en: 'Cash', ar: 'نقداً' },
    BANK_TRANSFER: { en: 'Bank Transfer', ar: 'تحويل بنكي' },
    CHECK: { en: 'Check', ar: 'شيك' },
    CREDIT: { en: 'Credit', ar: 'آجل' },
    MIXED: { en: 'Mixed', ar: 'مختلط' },
  };
  return texts[method]?.[locale] || method;
};

const generateItemsTableRows = (items: InvoiceItem[], locale: 'en' | 'ar'): string => {
  return items.map((item, index) => {
    const hasDiscount = item.discount && item.discount > 0;
    const rowBg = index % 2 === 0 ? '#ffffff' : '#f9fafb';
    return `
    <tr style="background: ${rowBg};">
      <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 13px;">${index + 1}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">
        <div style="font-weight: 600; color: #111827; font-size: 13px;">${escapeHtml(locale === 'ar' ? (item.nameAr || item.name) : item.name)}</div>
        ${item.nameAr && locale !== 'ar' ? `<div style="font-size: 11px; color: #9ca3af; margin-top: 1px;">${escapeHtml(item.nameAr)}</div>` : ''}
        ${item.sku ? `<div style="font-size: 11px; color: #9ca3af; margin-top: 1px; font-family: 'Courier New', monospace;">${escapeHtml(item.sku)}</div>` : ''}
      </td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 13px;">${item.quantity} ${escapeHtml(item.unit || '')}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: ${locale === 'ar' ? 'left' : 'right'}; font-size: 13px;">
        <div>${formatCurrency(item.unitPriceSdg, 'SDG', locale)}</div>
      </td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 13px; color: ${hasDiscount ? '#dc2626' : '#9ca3af'};">
        ${hasDiscount ? (item.discountType === 'PERCENTAGE' ? `${item.discount}%` : formatCurrency(item.discount! * item.unitPriceSdg / (item.unitPrice || 1), 'SDG', locale)) : '—'}
      </td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: ${locale === 'ar' ? 'left' : 'right'}; font-weight: 600; font-size: 13px;">
        <div>${formatCurrency(item.totalSdg, 'SDG', locale)}</div>
      </td>
    </tr>`;
  }).join('');
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
  const alignStart = isRtl ? 'right' : 'left';
  const alignEnd = isRtl ? 'left' : 'right';

  const party = invoice.invoiceType === 'SALES' ? invoice.customer : invoice.supplier;
  const partyLabel = invoice.invoiceType === 'SALES'
    ? (locale === 'ar' ? 'العميل' : 'Customer')
    : (locale === 'ar' ? 'المورد' : 'Supplier');

  const L = {
    invoiceNo: locale === 'ar' ? 'رقم الفاتورة' : 'Invoice No.',
    invoiceType: locale === 'ar' ? 'نوع الفاتورة' : 'Invoice Type',
    date: locale === 'ar' ? 'التاريخ' : 'Date',
    dueDate: locale === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date',
    status: locale === 'ar' ? 'الحالة' : 'Status',
    from: locale === 'ar' ? 'من' : 'From',
    billTo: locale === 'ar' ? 'فاتورة إلى' : 'Bill To',
    item: locale === 'ar' ? 'الصنف' : 'Item',
    qty: locale === 'ar' ? 'الكمية' : 'Qty',
    unitPrice: locale === 'ar' ? 'سعر الوحدة' : 'Unit Price',
    discount: locale === 'ar' ? 'الخصم' : 'Discount',
    total: locale === 'ar' ? 'الإجمالي' : 'Total',
    subtotal: locale === 'ar' ? 'المجموع الفرعي' : 'Subtotal',
    taxLabel: locale === 'ar' ? 'الضريبة' : 'Tax',
    grandTotal: locale === 'ar' ? 'الإجمالي الكلي' : 'Grand Total',
    amountPaid: locale === 'ar' ? 'المبلغ المدفوع' : 'Amount Paid',
    amountDue: locale === 'ar' ? 'المبلغ المستحق' : 'Amount Due',
    exchangeRate: locale === 'ar' ? 'سعر الصرف' : 'Exchange Rate',
    paymentMethod: locale === 'ar' ? 'طريقة الدفع' : 'Payment Method',
    notes: locale === 'ar' ? 'ملاحظات' : 'Notes',
    bankDetails: locale === 'ar' ? 'بيانات الحساب البنكي' : 'Bank Details',
    bankName: locale === 'ar' ? 'البنك' : 'Bank',
    accountNo: locale === 'ar' ? 'رقم الحساب' : 'Account No.',
    iban: locale === 'ar' ? 'الآيبان' : 'IBAN',
    thankYou: locale === 'ar' ? 'شكراً لتعاملكم معنا' : 'Thank you for your business!',
    phone: locale === 'ar' ? 'هاتف' : 'Tel',
    email: locale === 'ar' ? 'بريد' : 'Email',
    poNumber: locale === 'ar' ? 'رقم أمر الشراء' : 'PO Number',
    operationNo: locale === 'ar' ? 'رقم العملية' : 'Operation No.',
    taxId: locale === 'ar' ? 'الرقم الضريبي' : 'Tax ID',
    page: locale === 'ar' ? 'صفحة' : 'Page',
    walkIn: locale === 'ar' ? 'عميل نقدي' : 'Walk-in Customer',
    discountRow: locale === 'ar' ? 'الخصم' : 'Discount',
  };

  // System font stacks - no external loading required
  const fontFamily = isRtl
    ? "'Geeza Pro', 'Arabic Typesetting', 'Traditional Arabic', 'Noto Sans Arabic', Arial, sans-serif"
    : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  const statusColor = getStatusColor(invoice.paymentStatus);

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: ${fontFamily};
      background: #f3f4f6;
      color: #111827;
      font-size: 13px;
      line-height: 1.5;
      padding: 24px;
      direction: ${dir};
    }

    .invoice-wrap {
      max-width: 794px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #d1d5db;
    }

    /* ---- TOP HEADER ---- */
    .inv-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 24px 28px 20px;
      border-bottom: 2px solid #111827;
    }

    .inv-header-left {
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }

    .inv-logo {
      width: 72px;
      height: 72px;
      object-fit: contain;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      flex-shrink: 0;
    }

    .inv-logo-placeholder {
      width: 72px;
      height: 72px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      color: #374151;
      letter-spacing: 1px;
      flex-shrink: 0;
      background: #f9fafb;
    }

    .inv-company-name {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      line-height: 1.2;
      margin-bottom: 2px;
    }

    .inv-company-name-ar {
      font-size: 15px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 6px;
    }

    .inv-company-detail {
      font-size: 12px;
      color: #6b7280;
      line-height: 1.6;
    }

    .inv-header-right {
      text-align: ${alignEnd};
      flex-shrink: 0;
    }

    .inv-title {
      font-size: 26px;
      font-weight: 800;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 8px;
    }

    .inv-number-box {
      border: 1px solid #d1d5db;
      border-radius: 4px;
      padding: 8px 14px;
      font-size: 13px;
    }

    .inv-number-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #9ca3af;
      margin-bottom: 2px;
    }

    .inv-number-value {
      font-family: 'Courier New', monospace;
      font-weight: 700;
      font-size: 14px;
      color: #111827;
    }

    /* ---- META STRIP ---- */
    .inv-meta-strip {
      display: flex;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .inv-meta-cell {
      flex: 1;
      padding: 10px 14px;
      border-${alignEnd}: 1px solid #e5e7eb;
    }

    .inv-meta-cell:last-child {
      border-${alignEnd}: none;
    }

    .inv-meta-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #9ca3af;
      margin-bottom: 3px;
    }

    .inv-meta-value {
      font-size: 13px;
      font-weight: 600;
      color: #111827;
    }

    .status-pill {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid;
    }

    /* ---- PARTIES ---- */
    .inv-parties {
      display: flex;
      border-bottom: 1px solid #e5e7eb;
    }

    .inv-party {
      flex: 1;
      padding: 16px 20px;
      border-${alignEnd}: 1px solid #e5e7eb;
    }

    .inv-party:last-child {
      border-${alignEnd}: none;
    }

    .inv-party-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #9ca3af;
      margin-bottom: 6px;
    }

    .inv-party-name {
      font-size: 15px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 4px;
    }

    .inv-party-detail {
      font-size: 12px;
      color: #6b7280;
      line-height: 1.6;
    }

    /* ---- ITEMS TABLE ---- */
    .inv-items-wrap {
      padding: 0;
    }

    .inv-table {
      width: 100%;
      border-collapse: collapse;
    }

    .inv-table thead tr {
      background: #111827;
      color: #ffffff;
    }

    .inv-table th {
      padding: 10px 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      text-align: ${alignStart};
    }

    .inv-table th.center { text-align: center; }
    .inv-table th.end { text-align: ${alignEnd}; }

    .inv-table tbody tr:last-child td {
      border-bottom: 2px solid #e5e7eb;
    }

    /* ---- TOTALS ---- */
    .inv-totals-wrap {
      display: flex;
      justify-content: flex-end;
      padding: 16px 20px 16px 0;
      border-bottom: 1px solid #e5e7eb;
    }

    .inv-totals-table {
      width: 300px;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
    }

    .inv-totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 14px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 13px;
    }

    .inv-totals-row:last-child {
      border-bottom: none;
    }

    .inv-totals-row.grand {
      background: #111827;
      color: #ffffff;
    }

    .inv-totals-label {
      color: #6b7280;
    }

    .inv-totals-row.grand .inv-totals-label {
      color: #d1d5db;
      font-weight: 600;
    }

    .inv-totals-value {
      font-weight: 600;
      text-align: ${alignEnd};
    }

    .inv-totals-row.grand .inv-totals-value {
      color: #ffffff;
    }

    .inv-totals-sdg {
      font-size: 11px;
      color: #9ca3af;
      font-weight: 400;
    }

    .inv-totals-row.grand .inv-totals-sdg {
      color: rgba(255,255,255,0.6);
    }

    /* ---- NOTES ---- */
    .inv-notes {
      padding: 14px 20px;
      border-bottom: 1px solid #e5e7eb;
      background: #fffbeb;
    }

    .inv-notes-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #92400e;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .inv-notes-text {
      font-size: 13px;
      color: #78350f;
    }

    /* ---- FOOTER ---- */
    .inv-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 16px 20px;
      background: #f9fafb;
      border-top: 2px solid #111827;
      gap: 24px;
    }

    .inv-bank-section {
      flex: 1;
    }

    .inv-bank-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #6b7280;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .inv-bank-row {
      display: flex;
      gap: 6px;
      font-size: 12px;
      margin-bottom: 3px;
    }

    .inv-bank-key {
      color: #9ca3af;
      flex-shrink: 0;
    }

    .inv-bank-val {
      color: #111827;
      font-weight: 500;
    }

    .inv-footer-brand {
      text-align: center;
      flex-shrink: 0;
    }

    .inv-thankyou {
      font-size: 14px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 4px;
    }

    .inv-contact {
      font-size: 11px;
      color: #9ca3af;
      line-height: 1.5;
    }

    .inv-watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 90px;
      font-weight: 800;
      color: rgba(17,24,39,0.04);
      text-transform: uppercase;
      pointer-events: none;
      z-index: 0;
      white-space: nowrap;
    }

    @media print {
      body { padding: 0; background: #fff; }
      .invoice-wrap { border: none; }
    }
  </style>
</head>
<body>
  ${options.watermark ? `<div class="inv-watermark">${escapeHtml(options.watermark)}</div>` : ''}

  <div class="invoice-wrap">

    <!-- HEADER: Logo + Company | Invoice Title + Number -->
    <div class="inv-header">
      <div class="inv-header-left">
        ${logoBase64
          ? `<img src="${logoBase64}" class="inv-logo" alt="Logo">`
          : `<div class="inv-logo-placeholder">GOLDEN</div>`}
        <div>
          <div class="inv-company-name">${escapeHtml(company.name)}</div>
          <div class="inv-company-name-ar">${escapeHtml(company.nameAr)}</div>
          <div class="inv-company-detail">
            ${escapeHtml(company.address)}<br>
            ${escapeHtml(company.addressAr)}<br>
            ${L.phone}: ${escapeHtml(company.phone)}&nbsp;&nbsp;|&nbsp;&nbsp;${L.email}: ${escapeHtml(company.email)}
            ${company.taxId ? `<br>${L.taxId}: ${escapeHtml(company.taxId)}` : ''}
          </div>
        </div>
      </div>

      <div class="inv-header-right">
        <div class="inv-title">${getInvoiceTypeText(invoice.invoiceType, locale)}</div>
        <div class="inv-number-box">
          <div class="inv-number-label">${L.invoiceNo}</div>
          <div class="inv-number-value">${escapeHtml(invoice.invoiceNumber)}</div>
        </div>
      </div>
    </div>

    <!-- META STRIP: Date | Due Date | Status | Exchange Rate | PO/Op No -->
    <div class="inv-meta-strip">
      <div class="inv-meta-cell">
        <div class="inv-meta-label">${L.date}</div>
        <div class="inv-meta-value">${formatDate(invoice.invoiceDate, locale)}</div>
      </div>
      ${invoice.dueDate ? `
      <div class="inv-meta-cell">
        <div class="inv-meta-label">${L.dueDate}</div>
        <div class="inv-meta-value">${formatDate(invoice.dueDate, locale)}</div>
      </div>` : ''}
      <div class="inv-meta-cell">
        <div class="inv-meta-label">${L.status}</div>
        <div class="inv-meta-value">
          <span class="status-pill" style="color:${statusColor}; border-color:${statusColor}; background:${statusColor}18;">
            ${getStatusText(invoice.paymentStatus, locale)}
          </span>
        </div>
      </div>
      ${invoice.poNumber ? `
      <div class="inv-meta-cell">
        <div class="inv-meta-label">${L.poNumber}</div>
        <div class="inv-meta-value">${escapeHtml(invoice.poNumber)}</div>
      </div>` : ''}
      ${invoice.operationNumber ? `
      <div class="inv-meta-cell">
        <div class="inv-meta-label">${L.operationNo}</div>
        <div class="inv-meta-value">${escapeHtml(invoice.operationNumber)}</div>
      </div>` : ''}
      ${invoice.paymentMethod ? `
      <div class="inv-meta-cell">
        <div class="inv-meta-label">${L.paymentMethod}</div>
        <div class="inv-meta-value">${getPaymentMethodText(invoice.paymentMethod, locale)}</div>
      </div>` : ''}
    </div>

    <!-- PARTIES: From | To -->
    <div class="inv-parties">
      <div class="inv-party">
        <div class="inv-party-label">${L.from}</div>
        <div class="inv-party-name">${escapeHtml(isRtl ? company.nameAr : company.name)}</div>
        <div class="inv-party-detail">
          ${escapeHtml(isRtl ? company.addressAr : company.address)}<br>
          ${L.phone}: ${escapeHtml(company.phone)}<br>
          ${L.email}: ${escapeHtml(company.email)}
        </div>
      </div>
      <div class="inv-party">
        <div class="inv-party-label">${partyLabel}</div>
        ${party ? `
        <div class="inv-party-name">${escapeHtml(isRtl ? (party.nameAr || party.name) : party.name)}</div>
        <div class="inv-party-detail">
          ${party.address ? `${escapeHtml(isRtl ? (party.addressAr || party.address) : party.address)}<br>` : ''}
          ${party.phone ? `${L.phone}: ${escapeHtml(party.phone)}<br>` : ''}
          ${party.email ? `${L.email}: ${escapeHtml(party.email)}<br>` : ''}
          ${party.taxId ? `${L.taxId}: ${escapeHtml(party.taxId)}` : ''}
        </div>
        ` : `<div class="inv-party-name">${L.walkIn}</div>`}
      </div>
    </div>

    <!-- ITEMS TABLE -->
    <div class="inv-items-wrap">
      <table class="inv-table">
        <thead>
          <tr>
            <th class="center" style="width:40px;">#</th>
            <th>${L.item}</th>
            <th class="center" style="width:80px;">${L.qty}</th>
            <th class="end" style="width:120px;">${L.unitPrice}</th>
            <th class="center" style="width:80px;">${L.discount}</th>
            <th class="end" style="width:130px;">${L.total}</th>
          </tr>
        </thead>
        <tbody>
          ${generateItemsTableRows(invoice.items, locale)}
        </tbody>
      </table>
    </div>

    <!-- TOTALS -->
    <div class="inv-totals-wrap">
      <div class="inv-totals-table">
        <div class="inv-totals-row">
          <span class="inv-totals-label">${L.subtotal}</span>
          <span class="inv-totals-value">${formatCurrency(invoice.subtotalSdg, 'SDG', locale)}</span>
        </div>
        ${invoice.discount > 0 ? `
        <div class="inv-totals-row">
          <span class="inv-totals-label" style="color:#dc2626;">${L.discountRow}</span>
          <span class="inv-totals-value" style="color:#dc2626;">-${formatCurrency(invoice.discountSdg, 'SDG', locale)}</span>
        </div>` : ''}
        ${invoice.tax > 0 ? `
        <div class="inv-totals-row">
          <span class="inv-totals-label">${L.taxLabel}</span>
          <span class="inv-totals-value">${formatCurrency(invoice.taxSdg, 'SDG', locale)}</span>
        </div>` : ''}
        ${options.includePaymentDetails && invoice.amountPaid > 0 ? `
        <div class="inv-totals-row">
          <span class="inv-totals-label" style="color:#16a34a;">${L.amountPaid}</span>
          <span class="inv-totals-value" style="color:#16a34a;">${formatCurrency(invoice.amountPaidSdg, 'SDG', locale)}</span>
        </div>
        <div class="inv-totals-row">
          <span class="inv-totals-label" style="color:#d97706;">${L.amountDue}</span>
          <span class="inv-totals-value" style="color:#d97706;">${formatCurrency(invoice.amountDueSdg, 'SDG', locale)}</span>
        </div>` : ''}
        <div class="inv-totals-row grand">
          <span class="inv-totals-label">${L.grandTotal}</span>
          <span class="inv-totals-value">${formatCurrency(invoice.totalSdg, 'SDG', locale)}</span>
        </div>
      </div>
    </div>

    <!-- NOTES -->
    ${(invoice.notes || invoice.notesAr) ? `
    <div class="inv-notes">
      <div class="inv-notes-label">${L.notes}</div>
      <div class="inv-notes-text">${escapeHtml(isRtl ? (invoice.notesAr || invoice.notes) : invoice.notes)}</div>
    </div>` : ''}

    <!-- FOOTER: Bank Details | Thank You -->
    <div class="inv-footer">
      ${options.includeBankDetails && company.bankName ? `
      <div class="inv-bank-section">
        <div class="inv-bank-label">${L.bankDetails}</div>
        <div class="inv-bank-row"><span class="inv-bank-key">${L.bankName}:</span><span class="inv-bank-val">${escapeHtml(company.bankName)}</span></div>
        <div class="inv-bank-row"><span class="inv-bank-key">${L.accountNo}:</span><span class="inv-bank-val">${escapeHtml(company.bankAccount || '')}</span></div>
      </div>` : '<div></div>'}
      <div class="inv-footer-brand">
        <div class="inv-thankyou">${L.thankYou}</div>
        <div class="inv-contact">
          ${company.website ? `${escapeHtml(company.website)}<br>` : ''}
          ${escapeHtml(company.email)}
        </div>
      </div>
    </div>

  </div>
</body>
</html>`;
};
