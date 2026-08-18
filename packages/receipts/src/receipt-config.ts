import type { ReceiptConfig } from './receipt-types';

/**
 * Receipt design configuration defaults + resolver (Phase 4 P3).
 *
 * The merchant's receipt settings live inside the existing design
 * configuration (TenantDesign JSONB under the `receipt` key) — no new
 * database tables. `resolveReceiptConfig` merges the persisted value with
 * these defaults and coerces/validates every field so a malformed or legacy
 * payload can never crash the receipt renderer.
 */
export const DEFAULT_RECEIPT_CONFIG: ReceiptConfig = {
  language: 'en',
  showLogo: true,
  showBranchInfo: true,
  showOrderNumber: true,
  showDateTime: true,
  showDiscounts: true,
  showPayment: true,
  showNotes: true,
  footerMessage: 'Thank you for your order!',
};

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/**
 * Merges a persisted `design.receipt` payload (unknown shape) with the
 * defaults. Unknown keys are ignored; wrong types fall back to defaults.
 */
export function resolveReceiptConfig(persisted?: unknown): ReceiptConfig {
  const src = (persisted && typeof persisted === 'object' ? persisted : {}) as Record<string, unknown>;
  return {
    language: src.language === 'ar' ? 'ar' : 'en',
    showLogo: asBoolean(src.showLogo, DEFAULT_RECEIPT_CONFIG.showLogo),
    showBranchInfo: asBoolean(src.showBranchInfo, DEFAULT_RECEIPT_CONFIG.showBranchInfo),
    showOrderNumber: asBoolean(src.showOrderNumber, DEFAULT_RECEIPT_CONFIG.showOrderNumber),
    showDateTime: asBoolean(src.showDateTime, DEFAULT_RECEIPT_CONFIG.showDateTime),
    showDiscounts: asBoolean(src.showDiscounts, DEFAULT_RECEIPT_CONFIG.showDiscounts),
    showPayment: asBoolean(src.showPayment, DEFAULT_RECEIPT_CONFIG.showPayment),
    showNotes: asBoolean(src.showNotes, DEFAULT_RECEIPT_CONFIG.showNotes),
    footerMessage: asString(src.footerMessage, DEFAULT_RECEIPT_CONFIG.footerMessage),
  };
}