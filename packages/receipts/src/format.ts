import type { ReceiptLanguage } from './i18n';

/**
 * Shared receipt number/date formatting (Phase 4 P3).
 * Intentionally locale-aware so Arabic receipts render with Arabic-indic
 * digits when the platform locale supports it.
 */
export function formatMoney(amount: number, currency: string, language: ReceiptLanguage): string {
  const locale = language === 'ar' ? 'ar-EG' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'USD' }).format(amount);
  } catch {
    // Unknown/legacy currency code — fall back to a plain numeric rendering.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatDateTime(iso: string | undefined, language: ReceiptLanguage): { date: string; time: string } {
  if (!iso) return { date: '—', time: '—' };
  const locale = language === 'ar' ? 'ar-EG' : 'en-US';
  try {
    const d = new Date(iso);
    return {
      date: new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(d),
      time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d),
    };
  } catch {
    return { date: String(iso).slice(0, 10), time: '—' };
  }
}