/**
 * Shared receipt domain types (Phase 4 P3 — Printing & Receipts).
 *
 * This contract mirrors what the server-assembled receipt endpoint returns
 * (`GET /api/v1/orders/:id/receipt`). The package is consumed by both the
 * cashier app (production printing) and the backoffice app (Receipt Designer
 * live preview) so receipt rendering is defined once, never duplicated.
 */

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  size?: string | null;
  variant?: string | null;
  addons?: string[];
}

export interface ReceiptConfig {
  /** Receipt language — controls labels and print direction (LTR/RTL). */
  language: 'en' | 'ar';
  showLogo: boolean;
  showBranchInfo: boolean;
  showOrderNumber: boolean;
  showDateTime: boolean;
  showDiscounts: boolean;
  showPayment: boolean;
  showNotes: boolean;
  footerMessage: string;
}

export interface ReceiptOrder {
  id: string;
  orderNumber: string;
  type: string;
  status: string;
  paymentMethod?: string | null;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  specialNotes?: string | null;
  createdAt: string;
  items: ReceiptItem[];
}

export interface ReceiptTenant {
  name: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  currency: string;
}

export interface ReceiptBranch {
  name: string;
  address?: string | null;
  phoneNumber?: string | null;
}

export interface ReceiptData {
  config: ReceiptConfig;
  tenant: ReceiptTenant;
  branch: ReceiptBranch;
  order: ReceiptOrder;
}
