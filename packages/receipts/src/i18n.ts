/**
 * Receipt labels — English and Arabic (Phase 4 P3).
 *
 * The receipt language comes from the merchant's receipt configuration
 * (`ReceiptConfig.language`). Product/option names are merchant data and are
 * never translated here; only the static receipt chrome is localized.
 */
export type ReceiptLanguage = 'en' | 'ar';

export interface ReceiptLabels {
  order: string;
  date: string;
  time: string;
  branch: string;
  address: string;
  phone: string;
  qty: string;
  item: string;
  price: string;
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  payment: string;
  notes: string;
  ticket: string;
  table: string;
}

export const RECEIPT_LABELS: Record<ReceiptLanguage, ReceiptLabels> = {
  en: {
    order: 'Order',
    date: 'Date',
    time: 'Time',
    branch: 'Branch',
    address: 'Address',
    phone: 'Tel',
    qty: 'Qty',
    item: 'Item',
    price: 'Price',
    subtotal: 'Subtotal',
    tax: 'Tax',
    discount: 'Discount',
    total: 'Total',
    payment: 'Payment',
    notes: 'Notes',
    ticket: 'Ticket',
    table: 'Table',
  },
  ar: {
    order: 'طلب',
    date: 'التاريخ',
    time: 'الوقت',
    branch: 'الفرع',
    address: 'العنوان',
    phone: 'الهاتف',
    qty: 'الكمية',
    item: 'الصنف',
    price: 'السعر',
    subtotal: 'المجموع الفرعي',
    tax: 'الضريبة',
    discount: 'الخصم',
    total: 'الإجمالي',
    payment: 'الدفع',
    notes: 'ملاحظات',
    ticket: 'تذكرة',
    table: 'طاولة',
  },
};

export function getReceiptLabels(language: ReceiptLanguage): ReceiptLabels {
  return RECEIPT_LABELS[language] ?? RECEIPT_LABELS.en;
}

/** Maps a raw server payment method value to a human label. */
export function paymentMethodLabel(method: string | null | undefined, language: ReceiptLanguage): string {
  if (!method) {
    return '—';
  }
  const map: Record<string, Record<ReceiptLanguage, string>> = {
    CASH: { en: 'Cash', ar: 'نقداً' },
    CREDIT_CARD: { en: 'Card', ar: 'بطاقة' },
    APPLE_PAY: { en: 'Apple Pay', ar: 'أبل باي' },
    LOCAL_WALLET: { en: 'Wallet', ar: 'محفظة' },
  };
  return map[method]?.[language] ?? method;
}