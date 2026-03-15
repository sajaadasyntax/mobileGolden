import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Asset } from 'expo-asset';
import { Invoice, InvoiceGenerationOptions, CompanyInfo } from './types';
import { generateInvoiceHTML } from './template';

// Minimal inline SVG fallback when asset load fails (72x72 golden "G" placeholder) - pre-encoded base64
const FALLBACK_LOGO_BASE64 =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3MiIgaGVpZ2h0PSI3MiIgdmlld0JveD0iMCAwIDcyIDcyIj48cmVjdCB3aWR0aD0iNzIiIGhlaWdodD0iNzIiIGZpbGw9IiNmZWYzYzciIHN0cm9rZT0iI2Y1OWUwYiIgc3Ryb2tlLXdpZHRoPSIxIiByeD0iNiIvPjx0ZXh0IHg9IjM2IiB5PSI0NiIgZm9udC1mYW1pbHk9IkFyaWFsLHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjgiIGZvbnQtd2VpZ2h0PSI3MDAiIGZpbGw9IiNkOTc3MDYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkc8L3RleHQ+PC9zdmc+';

// Convert local asset to base64. Returns fallback SVG if asset/File API fails.
export const getLogoBase64 = async (): Promise<string> => {
  try {
    const asset = Asset.fromModule(require('../../assets/logo.jpeg'));
    await asset.downloadAsync();

    if (asset.localUri) {
      const file = new File(asset.localUri);
      const base64 = await file.base64();
      if (base64) return `data:image/jpeg;base64,${base64}`;
    }
  } catch (error) {
    console.warn('Logo load failed, using fallback:', error);
  }
  return FALLBACK_LOGO_BASE64;
};

// Generate invoice number
export const generateInvoiceNumber = (
  type: 'SALES' | 'PROCUREMENT',
  branchCode?: string
): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const prefix = type === 'SALES' ? 'INV' : 'PO';
  const branch = branchCode || 'GLD';
  return `${prefix}-${branch}-${timestamp}-${random}`;
};

// Generate PDF from invoice
export const generateInvoicePDF = async (
  invoice: Invoice,
  options: InvoiceGenerationOptions,
  company?: CompanyInfo
): Promise<{ uri: string; filename: string }> => {
  try {
    if (!invoice || !invoice.invoiceNumber) {
      throw new Error('Invalid invoice data: invoice number is required');
    }

    if (!invoice.items || invoice.items.length === 0) {
      throw new Error('Invalid invoice data: invoice must have at least one item');
    }

    // Get logo as base64 (don't fail if logo fails to load)
    let logoBase64: string | undefined;
    try {
      logoBase64 = await getLogoBase64();
    } catch (logoError) {
      console.warn('Logo loading failed, continuing without logo:', logoError);
      logoBase64 = undefined;
    }

    // Generate HTML
    let html: string;
    try {
      html = generateInvoiceHTML(invoice, options, company, logoBase64);

      if (!html || html.trim().length === 0) {
        throw new Error('Failed to generate invoice HTML');
      }

      console.log(`Generated HTML length: ${html.length} characters`);
    } catch (htmlError: any) {
      console.error('Error generating HTML:', htmlError);
      throw new Error(`Failed to generate invoice HTML: ${htmlError?.message || 'Unknown error'}`);
    }

    // Generate PDF
    let tempUri: string;
    try {
      console.log('Starting PDF generation...');
      const result = await Print.printToFileAsync({ html, base64: false });

      if (!result || !result.uri) {
        throw new Error('PDF generation returned no file URI');
      }

      tempUri = result.uri;
      console.log('PDF generated successfully:', tempUri);
    } catch (pdfError: any) {
      console.error('PDF generation error:', pdfError);

      if (pdfError?.message?.includes('timeout') || pdfError?.code === 'ETIMEDOUT') {
        throw new Error('PDF generation timed out. Please try again.');
      }
      if (pdfError?.message?.includes('permission') || pdfError?.code === 'EACCES') {
        throw new Error('Permission denied. Please check app permissions.');
      }
      if (pdfError?.message?.includes('memory') || pdfError?.code === 'ENOMEM') {
        throw new Error('Insufficient memory to generate PDF. Please try again.');
      }
      throw new Error(`PDF generation failed: ${pdfError?.message || 'Unknown error'}`);
    }

    // Verify temp file
    const tempFile = new File(tempUri);
    if (!tempFile.exists) {
      throw new Error('Generated PDF file does not exist');
    }

    // Prepare destination in documents directory
    const sanitizedInvoiceNumber = invoice.invoiceNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `${sanitizedInvoiceNumber}.pdf`;
    const destFile = new File(Paths.document, filename);

    // Delete existing file if present
    try {
      if (destFile.exists) {
        destFile.delete();
      }
    } catch {
      // Ignore, attempt move anyway
    }

    // Move temp file to documents
    try {
      console.log('Moving file to documents:', destFile.uri);
      tempFile.move(Paths.document);
      // After move the file lives at Paths.document + filename
    } catch (moveError: any) {
      console.error('Move error, trying copy:', moveError);
      try {
        tempFile.copy(Paths.document);
        try { tempFile.delete(); } catch { /* ignore */ }
      } catch (copyError: any) {
        throw new Error(`Failed to save PDF: ${copyError?.message || 'Unknown error'}`);
      }
    }

    // Verify saved file
    if (!destFile.exists) {
      throw new Error('PDF file was not saved successfully');
    }

    console.log('PDF saved successfully:', destFile.uri);
    return { uri: destFile.uri, filename };
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    throw new Error(error?.message || 'Failed to generate PDF invoice');
  }
};

// Share invoice as PDF
export const shareInvoicePDF = async (
  invoice: Invoice,
  options: InvoiceGenerationOptions,
  company?: CompanyInfo
): Promise<void> => {
  try {
    const { uri } = await generateInvoicePDF(invoice, options, company);

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Share Invoice ${invoice.invoiceNumber}`,
        UTI: 'com.adobe.pdf',
      });
    } else {
      throw new Error('Sharing is not available on this device');
    }
  } catch (error) {
    console.error('Error sharing PDF:', error);
    throw error;
  }
};

// Print invoice directly
export const printInvoice = async (
  invoice: Invoice,
  options: InvoiceGenerationOptions,
  company?: CompanyInfo
): Promise<void> => {
  try {
    let logoBase64: string | undefined;
    try {
      logoBase64 = await getLogoBase64();
    } catch {
      logoBase64 = undefined;
    }
    const html = generateInvoiceHTML(invoice, options, company, logoBase64);
    await Print.printAsync({ html });
  } catch (error) {
    console.error('Error printing invoice:', error);
    throw new Error('Failed to print invoice');
  }
};

export const saveInvoicePDF = async (
  invoice: Invoice,
  options: InvoiceGenerationOptions,
  company?: CompanyInfo
): Promise<{ uri: string; filename: string }> => {
  return generateInvoicePDF(invoice, options, company);
};

// Calculate invoice totals
export const calculateInvoiceTotals = (
  items: { quantity: number; unitPrice: number; discount?: number; discountType?: 'PERCENTAGE' | 'FIXED' }[],
  exchangeRate: number,
  taxRate: number = 0,
  invoiceDiscount: number = 0,
  invoiceDiscountType: 'PERCENTAGE' | 'FIXED' = 'FIXED'
): {
  subtotal: number;
  subtotalSdg: number;
  discount: number;
  discountSdg: number;
  tax: number;
  taxSdg: number;
  total: number;
  totalSdg: number;
} => {
  const subtotal = items.reduce((sum, item) => {
    let itemTotal = item.quantity * item.unitPrice;

    if (item.discount) {
      if (item.discountType === 'PERCENTAGE') {
        itemTotal -= itemTotal * (item.discount / 100);
      } else {
        itemTotal -= item.discount;
      }
    }

    return sum + itemTotal;
  }, 0);

  let discount = 0;
  if (invoiceDiscount > 0) {
    if (invoiceDiscountType === 'PERCENTAGE') {
      discount = subtotal * (invoiceDiscount / 100);
    } else {
      discount = invoiceDiscount;
    }
  }

  const taxableAmount = subtotal - discount;
  const tax = taxRate > 0 ? taxableAmount * (taxRate / 100) : 0;
  const total = taxableAmount + tax;

  return {
    subtotal,
    subtotalSdg: subtotal * exchangeRate,
    discount,
    discountSdg: discount * exchangeRate,
    tax,
    taxSdg: tax * exchangeRate,
    total,
    totalSdg: total * exchangeRate,
  };
};

// Format invoice for API submission
export const formatInvoiceForAPI = (invoice: Invoice): Record<string, any> => {
  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceType: invoice.invoiceType,
    invoiceCategory: invoice.invoiceCategory,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    branchId: invoice.branchId,
    customerId: invoice.customer?.id,
    supplierId: invoice.supplier?.id,
    items: invoice.items.map(item => ({
      itemId: item.itemId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      discountType: item.discountType,
    })),
    subtotal: invoice.subtotal,
    discount: invoice.discount,
    tax: invoice.tax,
    total: invoice.total,
    totalSdg: invoice.totalSdg,
    exchangeRate: invoice.exchangeRate,
    paymentStatus: invoice.paymentStatus,
    paymentMethod: invoice.paymentMethod,
    notes: invoice.notes,
    poNumber: invoice.poNumber,
    operationNumber: invoice.operationNumber,
  };
};
