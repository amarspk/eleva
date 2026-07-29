import {
  CartItem,
  CreateGuestOrderPayload,
  GuestOrderConfirmation,
  PublicMenuResponse,
} from './types';

/**
 * Maps the local cart to the exact CreateOrderRequestDto contract enforced by
 * the backend ValidationPipe (whitelist + forbidNonWhitelisted).
 * Null optional selections are OMITTED so class-validator @IsOptional applies
 * cleanly. qrCodeToken is the mandatory guest credential (DOC-005 4.6); the
 * server re-derives branch/table bindings from it authoritatively.
 */
export function buildCheckoutPayload(
  cart: CartItem[],
  context: {
    qrCodeToken: string;
    branchId: string;
    paymentMethod: CreateGuestOrderPayload['paymentMethod'];
    specialNotes?: string;
  },
): CreateGuestOrderPayload {
  const payload: CreateGuestOrderPayload = {
    branchId: context.branchId,
    qrCodeToken: context.qrCodeToken,
    type: 'DINE_IN',
    paymentMethod: context.paymentMethod,
    items: cart.map((item) => {
      const selection: CreateGuestOrderPayload['items'][number] = {
        productId: item.productId,
        quantity: item.quantity,
      };
      if (item.variantId) {
        selection.variantId = item.variantId;
      }
      if (item.sizeId) {
        selection.sizeId = item.sizeId;
      }
      if (item.addons.length > 0) {
        selection.addons = item.addons.map((addon) => ({ addonItemId: addon.id }));
      }
      return selection;
    }),
  };

  const notes = context.specialNotes?.trim();
  if (notes) {
    payload.specialNotes = notes;
  }

  return payload;
}

export class GuestOrderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'GuestOrderError';
  }
}

function extractServerMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return message.filter((m) => typeof m === 'string').join(', ');
    }
  }
  return `The order could not be placed (HTTP ${status}).`;
}

/**
 * Submits the guest order to the public checkout endpoint implemented in
 * Sprint 1 Step 2. The URL is deliberately same-origin relative: in
 * production nginx routes /api/* to the backend preserving the tenant Host
 * (subdomain tenancy), and in local dev next.config rewrites proxy it.
 */
export async function submitGuestOrder(
  payload: CreateGuestOrderPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<GuestOrderConfirmation> {
  const res = await fetchImpl('/api/v1/public/orders/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new GuestOrderError(extractServerMessage(body, res.status), res.status);
  }

  return body as GuestOrderConfirmation;
}

/**
 * Server-side API base URL resolution for the SSR page.
 *
 * Production: the QR app and the /api backend sit behind the same nginx
 * virtual host, so fetching the incoming request's own host reaches the API
 * with the tenant subdomain intact (TenantContextMiddleware resolves the
 * tenant from that Host).
 *
 * Local dev: the API listens on port 3001; the tenant subdomain is preserved
 * (e.g. http://albaik.localhost:3000 -> http://albaik.localhost:3001).
 * API_INTERNAL_URL overrides everything when set.
 */
export function resolveServerApiBase(host: string): string {
  const configured = process.env.API_INTERNAL_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  const hostname = host.split(':')[0];
  if (hostname.endsWith('localhost') || hostname === '127.0.0.1') {
    return `http://${hostname}:3001`;
  }
  return `https://${host}`;
}

/**
 * Server-side fetch of the full guest menu for a scanned table token.
 * Throws on any non-OK response; callers render a uniform error view.
 */
export async function fetchGuestMenu(
  apiBase: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicMenuResponse> {
  const res = await fetchImpl(`${apiBase}/api/v1/public/menu?token=${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new GuestOrderError(`Guest menu request failed (HTTP ${res.status}).`, res.status);
  }
  return (await res.json()) as PublicMenuResponse;
}
