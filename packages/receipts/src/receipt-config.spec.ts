import { resolveReceiptConfig, DEFAULT_RECEIPT_CONFIG } from './receipt-config';

describe('resolveReceiptConfig (P3 — receipt design configuration)', () => {
  it('returns defaults when nothing is persisted', () => {
    expect(resolveReceiptConfig(undefined)).toEqual(DEFAULT_RECEIPT_CONFIG);
    expect(resolveReceiptConfig(null)).toEqual(DEFAULT_RECEIPT_CONFIG);
  });

  it('returns defaults for a non-object payload', () => {
    expect(resolveReceiptConfig('garbage')).toEqual(DEFAULT_RECEIPT_CONFIG);
    expect(resolveReceiptConfig(42)).toEqual(DEFAULT_RECEIPT_CONFIG);
  });

  it('merges persisted values over defaults', () => {
    const merged = resolveReceiptConfig({
      language: 'ar',
      showLogo: false,
      footerMessage: 'شكراً لزيارتكم',
    });
    expect(merged.language).toBe('ar');
    expect(merged.showLogo).toBe(false);
    expect(merged.footerMessage).toBe('شكراً لزيارتكم');
    expect(merged.showDateTime).toBe(true); // untouched default
  });

  it('coerces wrong-typed values back to defaults (never crashes)', () => {
    const merged = resolveReceiptConfig({
      language: 'fr',
      showLogo: 'yes',
      showDateTime: 1,
      footerMessage: '',
    });
    expect(merged.language).toBe('en');
    expect(merged.showLogo).toBe(true);
    expect(merged.showDateTime).toBe(true);
    expect(merged.footerMessage).toBe(DEFAULT_RECEIPT_CONFIG.footerMessage);
  });

  it('ignores unknown keys', () => {
    const merged = resolveReceiptConfig({ bogus: 'x', language: 'ar' });
    expect(merged.language).toBe('ar');
    expect((merged as Record<string, unknown>).bogus).toBeUndefined();
  });
});