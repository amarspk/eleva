import {
  CartItem,
  PublicAddonOption,
  PublicProduct,
  PublicProductSize,
  PublicProductVariant,
} from './types';

/**
 * Dynamic Inheritance Pricing Logic per DOC-005 4.3 — the exact ruleset
 * already verified against the spec (and enforced server-side by DEFECT-A):
 *
 *  Condition B: size adjustment adds to the product base price.
 *  Condition C: a selected variant ABSOLUTELY overrides (base + size).
 *  Condition D: every selected addon item adds its price on top.
 */
export function computeUnitPrice(
  product: Pick<PublicProduct, 'basePrice'>,
  size: Pick<PublicProductSize, 'priceAdjustment'> | null,
  variant: Pick<PublicProductVariant, 'price'> | null,
  addons: Pick<PublicAddonOption, 'price'>[],
): number {
  let base = Number(product.basePrice);

  // Condition B — Size Adjustment
  if (size) {
    base += Number(size.priceAdjustment);
  }

  // Condition C — Variant Absolute Override
  if (variant) {
    base = Number(variant.price);
  }

  // Condition D — Customizations
  const addonsTotal = addons.reduce((sum, addon) => sum + Number(addon.price), 0);

  return base + addonsTotal;
}

/** Deterministic cart-line identity: identical configurations merge quantities. */
export function cartItemKey(
  productId: string,
  sizeId: string | null,
  variantId: string | null,
  addons: { id: string }[],
): string {
  const addonSig = addons
    .map((a) => a.id)
    .sort()
    .join('+');
  return `${productId}|${sizeId ?? '-'}|${variantId ?? '-'}|${addonSig}`;
}

export function computeCartSubtotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

export function computeCartItemCount(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}
