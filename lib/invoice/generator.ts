import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { Invoice, InvoiceGenerationOptions, CompanyInfo } from './types';
import { generateInvoiceHTML } from './template';

// Convert local asset to base64
export const getLogoBase64 = async (): Promise<string | undefined> => {
  try {
    // Load the logo asset
    const asset = Asset.fromModule(require('../../assets/logo.jpeg'));
    await asset.downloadAsync();
    
    if (asset.localUri) {
      // Use legacy FileSystem API to avoid deprecation warnings
      const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `data:image/jpeg;base64,${base64}`;
    }
    return undefined;
  } catch (error) {
    console.error('Error loading logo:', error);
    return undefined;
  }
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
    // Validate invoice data
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
      
      // Validate HTML was generated
      if (!html || html.trim().length === 0) {
        throw new Error('Failed to generate invoice HTML');
      }
      
      // Basic HTML validation - check for required tags
      if (!html.includes('<html') && !html.includes('<HTML')) {
        console.warn('Generated HTML may be missing HTML tag');
      }
      
      // Log HTML length for debugging (truncated)
      console.log(`Generated HTML length: ${html.length} characters`);
      
      // Escape any problematic characters that might break PDF generation
      // Note: We don't modify the HTML, just log warnings
      if (html.includes('\0')) {
        console.warn('HTML contains null characters which may cause issues');
      }
    } catch (htmlError: any) {
      console.error('Error generating HTML:', htmlError);
      throw new Error(`Failed to generate invoice HTML: ${htmlError?.message || 'Unknown error'}`);
    }
    
    // Generate PDF with better error handling
    let uri: string;
    try {
      console.log('Starting PDF generation...');
      const result = await Print.printToFileAsync({
        html,
        base64: false,
      });
      
      if (!result || !result.uri) {
        throw new Error('PDF generation returned no file URI');
      }
      
      uri = result.uri;
      console.log('PDF generated successfully:', uri);
    } catch (pdfError: any) {
      console.error('PDF generation error:', pdfError);
      
      // Provide more specific error messages
      if (pdfError?.message?.includes('timeout') || pdfError?.code === 'ETIMEDOUT') {
        throw new Error('PDF generation timed out. The invoice may be too large. Please try again.');
      }
      
      if (pdfError?.message?.includes('permission') || pdfError?.code === 'EACCES') {
        throw new Error('Permission denied. Please check app permissions.');
      }
      
      if (pdfError?.message?.includes('memory') || pdfError?.code === 'ENOMEM') {
        throw new Error('Insufficient memory to generate PDF. Please try again.');
      }
      
      throw new Error(`PDF generation failed: ${pdfError?.message || 'Unknown error'}`);
    }
    
    // Verify temp file exists
    try {
      const tempFileInfo = await FileSystem.getInfoAsync(uri);
      if (!tempFileInfo.exists) {
        throw new Error('Generated PDF file does not exist');
      }
    } catch (verifyError: any) {
      console.error('Temp file verification error:', verifyError);
      throw new Error(`Failed to verify generated PDF: ${verifyError?.message || 'Unknown error'}`);
    }
    
    // Create a better filename (sanitize invoice number for filename)
    const sanitizedInvoiceNumber = invoice.invoiceNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `${sanitizedInvoiceNumber}.pdf`;
    const newUri = `${FileSystem.documentDirectory}${filename}`;
    
    // Ensure document directory exists
    try {
      const docDirInfo = await FileSystem.getInfoAsync(FileSystem.documentDirectory || '');
      if (!docDirInfo.exists) {
        throw new Error('Document directory does not exist');
      }
    } catch (dirError) {
      console.error('Document directory check failed:', dirError);
      // Continue anyway, might still work
    }
    
    // Check if file already exists and delete it
    try {
      const fileInfo = await FileSystem.getInfoAsync(newUri);
      if (fileInfo.exists) {
        console.log('Deleting existing file:', newUri);
        await FileSystem.deleteAsync(newUri, { idempotent: true });
      }
    } catch (deleteError) {
      // Ignore delete errors, we'll try to overwrite anyway
      console.warn('Could not delete existing file:', deleteError);
    }
    
    // Move file to documents directory with proper name
    try {
      console.log('Moving file from', uri, 'to', newUri);
      await FileSystem.moveAsync({
        from: uri,
        to: newUri,
      });
      console.log('File moved successfully');
    } catch (moveError: any) {
      console.error('Move error:', moveError);
      
      // If move fails, try copying instead
      if (moveError.code === 'EEXIST' || moveError.message?.includes('already exists')) {
        console.log('File exists, deleting and retrying move...');
        await FileSystem.deleteAsync(newUri, { idempotent: true });
        await FileSystem.moveAsync({
          from: uri,
          to: newUri,
        });
      } else {
        // Try copy as fallback
        console.log('Move failed, trying copy instead...');
        await FileSystem.copyAsync({
          from: uri,
          to: newUri,
        });
        // Clean up temp file
        try {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    }
    
    // Verify file was saved
    const savedFileInfo = await FileSystem.getInfoAsync(newUri);
    if (!savedFileInfo.exists) {
      throw new Error('PDF file was not saved successfully - file verification failed');
    }
    
    console.log('PDF saved successfully:', newUri);
    return { uri: newUri, filename };
  } catch (error: any) {
    console.error('Error generating PDF - Full error:', error);
    console.error('Error stack:', error?.stack);
    
    // Provide user-friendly error message
    let errorMessage = 'Failed to generate PDF invoice';
    
    if (error?.message) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    throw new Error(errorMessage);
  }
};

// Share invoice as PDF
export const shareInvoicePDF = async (
  invoice: Invoice,
  options: InvoiceGenerationOptions,
  company?: CompanyInfo
): Promise<void> => {
  try {
    const { uri, filename } = await generateInvoicePDF(invoice, options, company);
    
    // Check if sharing is available
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
    // Get logo as base64
    const logoBase64 = await getLogoBase64();
    
    // Generate HTML
    const html = generateInvoiceHTML(invoice, options, company, logoBase64);
    
    // Print
    await Print.printAsync({ html });
  } catch (error) {
    console.error('Error printing invoice:', error);
    throw new Error('Failed to print invoice');
  }
};

// Save invoice as image (screenshot approach using webview)
export const saveInvoiceAsImage = async (
  invoice: Invoice,
  options: InvoiceGenerationOptions,
  company?: CompanyInfo
): Promise<{ uri: string; filename: string }> => {
  try {
    // For image export, we first generate PDF then inform user
    // Native image generation from HTML requires additional setup
    // For now, we'll save as PDF which can be converted or screenshot
    const result = await generateInvoicePDF(invoice, options, company);
    return result;
  } catch (error) {
    console.error('Error saving invoice as image:', error);
    throw error;
  }
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
  // Calculate subtotal
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
  
  // Calculate invoice-level discount
  let discount = 0;
  if (invoiceDiscount > 0) {
    if (invoiceDiscountType === 'PERCENTAGE') {
      discount = subtotal * (invoiceDiscount / 100);
    } else {
      discount = invoiceDiscount;
    }
  }
  
  // Calculate tax
  const taxableAmount = subtotal - discount;
  const tax = taxRate > 0 ? taxableAmount * (taxRate / 100) : 0;
  
  // Calculate total
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

