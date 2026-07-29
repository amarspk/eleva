import { computeUnitPrice, computeCartSubtotal, computeCartItemCount, cartItemKey } from './pricing';
import { buildCheckoutPayload } from './guest-api';
import type { CartItem } from './types';

// ==========================================
// DOC-005 4.3 Dynamic Inheritance Pricing
// ==========================================

it('Condition B: base price plus size adjustment', () => {
  expect(computeUnitPrice({ basePrice: 10 }, { priceAdjustment: 2.5 }, null, [])).toBe(12.5);
});

it('Condition C: variant absolute override replaces base AND size adjustment', () => {
  expect(computeUnitPrice({ basePrice: 10 }, { priceAdjustment: 2.5 }, { price: 22.5 }, [])).toBe(22.5);
});

it('Condition D: addons add on top of (base + size)', () => {
  expect(
    computeUnitPrice({ basePrice: 10 }, { priceAdjustment: 2 }, null, [{ price: 1.5 }, { price: 0.75 }]),
  ).toBe(14.25);
});

it('Conditions C+D combined: variant override then addons add', () => {
  expect(
    computeUnitPrice({ basePrice: 10 }, { priceAdjustment: 2 }, { price: 22.5 }, [{ price: 1 }]),
  ).toBe(23.5);
});

// ==========================================
// Cart identity & totals
// ==========================================

it('cartItemKey merges identical configurations and distinguishes different ones', () => {
  const a = cartItemKey('p1', null, null, [{ id: 'a2' }, { id: 'a1' }]);
  const b = cartItemKey('p1', null, null, [{ id: 'a1' }, { id: 'a2' }]);
  const c = cartItemKey('p1', 's1', null, [{ id: 'a1' }, { id: 'a2' }]);
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});

it('cart subtotal and item count aggregate lines and quantities', () => {
  const cart: CartItem[] = [
    { key: 'k1', productId: 'p1', name: 'A', sizeId: null, sizeName: null, variantId: 'v1', variantName: 'V', addons: [], quantity: 2, unitPrice: 10 },
    { key: 'k2', productId: 'p2', name: 'B', sizeId: null, sizeName: null, variantId: null, variantName: null, addons: [{ id: 'a1', name: 'X', price: 1 }], quantity: 1, unitPrice: 6 },
  ];
  expect(computeCartSubtotal(cart)).toBe(26);
  expect(computeCartItemCount(cart)).toBe(3);
});

// ==========================================
// Checkout payload mapping (CreateOrderRequestDto contract)
// ==========================================

it('buildCheckoutPayload emits the exact backend contract with qrCodeToken and omits null selections', () => {
  const cart: CartItem[] = [
    {
      key: 'k1',
      productId: 'prod-1',
      name: 'Burger',
      sizeId: null,
      sizeName: null,
      variantId: 'var-9',
      variantName: 'Double',
      addons: [{ id: 'addon-1', name: 'Cheese', price: 1.5 }],
      quantity: 2,
      unitPrice: 24,
    },
    {
      key: 'k2',
      productId: 'prod-2',
      name: 'Fries',
      sizeId: 'size-1',
      sizeName: 'Large',
      variantId: null,
      variantName: null,
      addons: [],
      quantity: 1,
      unitPrice: 5,
    },
  ];

  const payload = buildCheckoutPayload(cart, {
    qrCodeToken: 'qr-token-abc',
    branchId: 'branch-7',
    paymentMethod: 'CASH',
    specialNotes: '  no onions  ',
  });

  expect(payload).toEqual({
    branchId: 'branch-7',
    qrCodeToken: 'qr-token-abc',
    type: 'DINE_IN',
    paymentMethod: 'CASH',
    specialNotes: 'no onions',
    items: [
      { productId: 'prod-1', quantity: 2, variantId: 'var-9', addons: [{ addonItemId: 'addon-1' }] },
      { productId: 'prod-2', quantity: 1, sizeId: 'size-1' },
    ],
  });
  // Whitelist safety: no undefined-valued optional keys are emitted
  expect('sizeId' in payload.items[0]).toBe(false);
  expect('variantId' in payload.items[1]).toBe(false);
  expect('addons' in payload.items[1]).toBe(false);
});

it('buildCheckoutPayload omits specialNotes when blank', () => {
  const payload = buildCheckoutPayload([], {
    qrCodeToken: 'qr',
    branchId: 'b',
    paymentMethod: 'CASH',
    specialNotes: '   ',
  });
  expect('specialNotes' in payload).toBe(false);
});
