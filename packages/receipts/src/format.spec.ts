import { formatMoney, formatDateTime } from './format';
import { paymentMethodLabel, getReceiptLabels } from './i18n';

describe('receipt formatting (P3)', () => {
  it('formats money with the tenant currency', () => {
    expect(formatMoney(12.5, 'USD', 'en')).toBe('$12.50');
  });

  it('formats money with a fallback for unknown currency codes', () => {
    const out = formatMoney(12.5, 'XYZ', 'en');
    expect(out).toContain('12.50');
    expect(out).toContain('XYZ');
  });

  it('formats date/time from an ISO string', () => {
    const { date, time } = formatDateTime('2026-08-18T14:30:00.000Z', 'en');
    expect(date).toContain('2026');
    expect(time).toBeTruthy();
  });

  it('handles a missing date', () => {
    expect(formatDateTime(undefined, 'en')).toEqual({ date: '—', time: '—' });
  });

  it('maps payment methods to localized labels', () => {
    expect(paymentMethodLabel('CASH', 'en')).toBe('Cash');
    expect(paymentMethodLabel('CASH', 'ar')).toBe('نقداً');
    expect(paymentMethodLabel('APPLE_PAY', 'en')).toBe('Apple Pay');
    expect(paymentMethodLabel(null, 'en')).toBe('—');
  });

  it('provides both English and Arabic labels', () => {
    expect(getReceiptLabels('en').order).toBe('Order');
    expect(getReceiptLabels('ar').order).toBe('طلب');
  });
});