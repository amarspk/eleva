import { BadRequestException } from '@nestjs/common';
import { Prisma, DiscountType } from '@zayjar/db';

/**
 * Uniform rejection message for every invalid-discount path (anti-oracle):
 * a caller can never distinguish an unknown code from an expired, inactive,
 * or usage-exhausted one (no enumeration via errors).
 */
export const DISCOUNT_INVALID_MESSAGE = 'The discount code is invalid or expired.';

export interface ResolvedDiscount {
  discountId: string;
  code: string;
  amount: number;
}

export interface DiscountRowShape {
  id: string;
  type: DiscountType;
  value: Prisma.Decimal | number | string;
  active: boolean;
  validFrom: Date | null;
  validTo: Date | null;
  usageLimit: number | null;
  usageCount: number;
}

/**
 * Discount engine (Sprint 2 Task 4).
 *
 * Replaces the former `discountAmount = 0.00` placeholder in the order
 * pipeline with a real, tenant-scoped discount model. All pricing is computed
 * server-side (DOC-005 §4.3 — never trust client prices).
 *
 * This is a stateless, pure pricing/validation utility (no DI needed): the
 * order service resolves the discount row inside the checkout transaction
 * (see order.service.ts createOrder — `tx.discount.findUnique`) and passes it
 * to `validateDiscount`, then persists the resulting discountAmount + discount
 * snapshot on the order and increments usageCount in the same transaction.
 */
export class DiscountService {
  /**
   * Pure pricing computation. Percentage discounts apply to the pre-tax
   * subtotal; fixed-amount discounts are capped so a discount can never exceed
   * the subtotal (the order total can never go negative). Rounded to 2dp.
   */
  static computeDiscountAmount(
    subtotal: number,
    type: DiscountType,
    value: Prisma.Decimal | number | string,
  ): number {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0 || !Number.isFinite(subtotal) || subtotal <= 0) {
      return 0;
    }
    const amount = type === 'PERCENTAGE' ? (subtotal * numericValue) / 100 : numericValue;
    return Number(Math.min(amount, subtotal).toFixed(2));
  }

  /**
   * Validates a discount row and computes its server-authoritative amount.
   * Every rejection path throws the same generic BadRequestException.
   */
  static validateDiscount(
    discount: DiscountRowShape | null,
    code: string,
    subtotal: number,
  ): ResolvedDiscount {
    if (!discount || !discount.active) {
      throw new BadRequestException(DISCOUNT_INVALID_MESSAGE);
    }
    const now = new Date();
    if (discount.validFrom && now < discount.validFrom) {
      throw new BadRequestException(DISCOUNT_INVALID_MESSAGE);
    }
    if (discount.validTo && now > discount.validTo) {
      throw new BadRequestException(DISCOUNT_INVALID_MESSAGE);
    }
    if (
      discount.usageLimit !== null &&
      discount.usageLimit !== undefined &&
      discount.usageCount >= discount.usageLimit
    ) {
      throw new BadRequestException(DISCOUNT_INVALID_MESSAGE);
    }
    const amount = DiscountService.computeDiscountAmount(subtotal, discount.type, discount.value);
    if (amount <= 0) {
      throw new BadRequestException(DISCOUNT_INVALID_MESSAGE);
    }
    return { discountId: discount.id, code, amount };
  }
}
