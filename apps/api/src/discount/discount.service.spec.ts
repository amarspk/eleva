import { BadRequestException } from '@nestjs/common';
import { DiscountService, DISCOUNT_INVALID_MESSAGE, DiscountRowShape } from './discount.service';

const baseRow = (overrides: Partial<DiscountRowShape> = {}): DiscountRowShape => ({
  id: 'disc-1',
  type: 'PERCENTAGE',
  value: 10,
  active: true,
  validFrom: null,
  validTo: null,
  usageLimit: null,
  usageCount: 0,
  ...overrides,
});

describe('DiscountService.computeDiscountAmount', () => {
  it('computes a percentage discount from the pre-tax subtotal', () => {
    expect(DiscountService.computeDiscountAmount(100, 'PERCENTAGE', 10)).toBe(10);
    expect(DiscountService.computeDiscountAmount(28, 'PERCENTAGE', 10)).toBe(2.8);
  });

  it('uses a fixed-amount discount as-is', () => {
    expect(DiscountService.computeDiscountAmount(100, 'FIXED_AMOUNT', 5)).toBe(5);
  });

  it('caps a discount at the subtotal (never negative total)', () => {
    expect(DiscountService.computeDiscountAmount(3, 'FIXED_AMOUNT', 5)).toBe(3);
    expect(DiscountService.computeDiscountAmount(3, 'PERCENTAGE', 200)).toBe(3);
  });

  it('rounds to 2 decimal places', () => {
    expect(DiscountService.computeDiscountAmount(9.99, 'PERCENTAGE', 33.333)).toBe(3.33);
  });

  it('returns 0 for non-positive values or subtotal', () => {
    expect(DiscountService.computeDiscountAmount(0, 'PERCENTAGE', 10)).toBe(0);
    expect(DiscountService.computeDiscountAmount(100, 'PERCENTAGE', 0)).toBe(0);
    expect(DiscountService.computeDiscountAmount(100, 'PERCENTAGE', -5)).toBe(0);
  });
});

describe('DiscountService.validateDiscount', () => {
  it('returns the resolved discount for a valid row', () => {
    expect(DiscountService.validateDiscount(baseRow(), 'SAVE10', 100)).toEqual({
      discountId: 'disc-1',
      code: 'SAVE10',
      amount: 10,
    });
  });

  it('rejects a missing discount with the uniform message', () => {
    expect(() => DiscountService.validateDiscount(null, 'NOPE', 100)).toThrow(BadRequestException);
    expect(() => DiscountService.validateDiscount(null, 'NOPE', 100)).toThrow(DISCOUNT_INVALID_MESSAGE);
  });

  it('rejects an inactive discount', () => {
    expect(() => DiscountService.validateDiscount(baseRow({ active: false }), 'SAVE10', 100)).toThrow(
      DISCOUNT_INVALID_MESSAGE,
    );
  });

  it('rejects a discount before its validFrom window', () => {
    const future = new Date(Date.now() + 86400000);
    expect(() => DiscountService.validateDiscount(baseRow({ validFrom: future }), 'SAVE10', 100)).toThrow(
      DISCOUNT_INVALID_MESSAGE,
    );
  });

  it('rejects a discount after its validTo window', () => {
    const past = new Date(Date.now() - 86400000);
    expect(() => DiscountService.validateDiscount(baseRow({ validTo: past }), 'SAVE10', 100)).toThrow(
      DISCOUNT_INVALID_MESSAGE,
    );
  });

  it('rejects a discount whose usage limit is exhausted', () => {
    expect(() =>
      DiscountService.validateDiscount(baseRow({ usageLimit: 10, usageCount: 10 }), 'SAVE10', 100),
    ).toThrow(DISCOUNT_INVALID_MESSAGE);
  });

  it('rejects a discount that computes to a zero amount', () => {
    expect(() => DiscountService.validateDiscount(baseRow({ value: 0 }), 'SAVE10', 100)).toThrow(
      DISCOUNT_INVALID_MESSAGE,
    );
  });
});
