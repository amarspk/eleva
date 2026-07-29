import {
  buildCheckoutPayload,
  submitGuestOrder,
  resolveServerApiBase,
  fetchGuestMenu,
} from './guest-api';
import type { PublicMenuResponse } from './types';

// ==========================================
// submitGuestOrder — wire contract to POST /api/v1/public/orders/checkout
// ==========================================

it('submitGuestOrder POSTs the payload to the public checkout endpoint and returns the confirmation', async () => {
  const confirmation = { id: 'order-1', orderNumber: 'ORD-2026-12345', status: 'PENDING', total: 12.5 };
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(confirmation),
  });

  const payload = buildCheckoutPayload(
    [
      {
        key: 'k1',
        productId: 'prod-1',
        name: 'Burger',
        sizeId: null,
        sizeName: null,
        variantId: null,
        variantName: null,
        addons: [],
        quantity: 1,
        unitPrice: 8.99,
      },
    ],
    { qrCodeToken: 'qr-token-abc', branchId: 'branch-1', paymentMethod: 'CASH' },
  );

  const result = await submitGuestOrder(payload, fetchImpl as unknown as typeof fetch);

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe('/api/v1/public/orders/checkout');
  expect(init.method).toBe('POST');
  expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  expect(JSON.parse(init.body)).toEqual({
    branchId: 'branch-1',
    qrCodeToken: 'qr-token-abc',
    type: 'DINE_IN',
    paymentMethod: 'CASH',
    items: [{ productId: 'prod-1', quantity: 1 }],
  });
  expect(result).toEqual(confirmation);
});

it('submitGuestOrder surfaces the server rejection message with its status', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: () => Promise.resolve({ message: 'Variant [var-1] for product [p1] is out of stock.' }),
  });

  await expect(
    submitGuestOrder(
      buildCheckoutPayload([], { qrCodeToken: 'qr', branchId: 'b', paymentMethod: 'CASH' }),
      fetchImpl as unknown as typeof fetch,
    ),
  ).rejects.toMatchObject({
    name: 'GuestOrderError',
    status: 400,
    message: 'Variant [var-1] for product [p1] is out of stock.',
  });
});

it('submitGuestOrder survives non-JSON error bodies', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: () => Promise.reject(new Error('not json')),
  });

  await expect(
    submitGuestOrder(
      buildCheckoutPayload([], { qrCodeToken: 'qr', branchId: 'b', paymentMethod: 'CASH' }),
      fetchImpl as unknown as typeof fetch,
    ),
  ).rejects.toMatchObject({ status: 500, message: 'The order could not be placed (HTTP 500).' });
});

// ==========================================
// resolveServerApiBase — tenant-preserving SSR addressing
// ==========================================

describe('resolveServerApiBase', () => {
  const originalEnv = process.env.API_INTERNAL_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.API_INTERNAL_URL;
    } else {
      process.env.API_INTERNAL_URL = originalEnv;
    }
  });

  it('prefers the explicit API_INTERNAL_URL override', () => {
    process.env.API_INTERNAL_URL = 'http://api.internal:3001/';
    expect(resolveServerApiBase('albaik.zayjar.com')).toBe('http://api.internal:3001');
  });

  it('uses same-origin https in production so the tenant Host reaches the API', () => {
    delete process.env.API_INTERNAL_URL;
    expect(resolveServerApiBase('albaik.zayjar.com')).toBe('https://albaik.zayjar.com');
  });

  it('keeps the tenant subdomain and swaps to the API port in local dev', () => {
    delete process.env.API_INTERNAL_URL;
    expect(resolveServerApiBase('albaik.localhost:3000')).toBe('http://albaik.localhost:3001');
    expect(resolveServerApiBase('127.0.0.1:3000')).toBe('http://127.0.0.1:3001');
  });
});

// ==========================================
// fetchGuestMenu — Step-1 public read contract
// ==========================================

it('fetchGuestMenu requests the menu with an encoded token and no-store caching', async () => {
  const menu: Partial<PublicMenuResponse> = { categories: [], table: { number: 'T-1' } };
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(menu),
  });

  const result = await fetchGuestMenu('https://albaik.zayjar.com', 'qr token/with+chars', fetchImpl as unknown as typeof fetch);

  expect(fetchImpl).toHaveBeenCalledWith(
    'https://albaik.zayjar.com/api/v1/public/menu?token=qr%20token%2Fwith%2Bchars',
    { cache: 'no-store' },
  );
  expect(result).toEqual(menu);
});

it('fetchGuestMenu throws GuestOrderError on API rejection (404/403)', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 404 });

  await expect(
    fetchGuestMenu('https://albaik.zayjar.com', 'bad-token', fetchImpl as unknown as typeof fetch),
  ).rejects.toMatchObject({ name: 'GuestOrderError', status: 404 });
});
