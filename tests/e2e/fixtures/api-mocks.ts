import { Page, Route, RouteHandler } from '@playwright/test';
import {
  TENANT_A,
  TENANT_B,
  BRANCH_A,
  BRANCH_B,
  CATEGORIES_A,
  CATEGORY_B,
  PRODUCTS_A_FLAT,
  CHECKOUT_RESPONSE,
  ORDER_A_001,
  ORDER_A_002,
  METRICS_RESPONSE,
} from './mock-data';

type OrderStatus = 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';

const jsonOk = (body: unknown) => ({
  status: 200,
  contentType: 'application/json' as const,
  body: JSON.stringify(body),
});

const jsonCreated = (body: unknown) => ({
  status: 201,
  contentType: 'application/json' as const,
  body: JSON.stringify(body),
});

const jsonNoContent = () => ({
  status: 204,
  contentType: 'application/json' as const,
  body: '',
});

const jsonForbidden = (message = 'Tenant context required') => ({
  status: 403,
  contentType: 'application/json' as const,
  body: JSON.stringify({ statusCode: 403, message }),
});

const jsonNotFound = (message = 'Not found') => ({
  status: 404,
  contentType: 'application/json' as const,
  body: JSON.stringify({ statusCode: 404, message }),
});

export interface MockOrderStore {
  orders: Map<string, Record<string, unknown>>;
  orderCounter: number;
}

export function createOrderStore(): MockOrderStore {
  return {
    orders: new Map([
      [ORDER_A_001.id, { ...ORDER_A_001 }],
      [ORDER_A_002.id, { ...ORDER_A_002 }],
    ]),
    orderCounter: 10,
  };
}

function getOrderStatusResponse(orderId: string, status: OrderStatus) {
  const eventMap: Record<OrderStatus, string> = {
    DRAFT: 'order.created',
    PENDING: 'order.created',
    ACCEPTED: 'order.accepted',
    PREPARING: 'order.preparing',
    READY: 'order.ready',
    COMPLETED: 'order.completed',
    CANCELLED: 'order.cancelled',
  };
  return {
    id: orderId,
    status,
    event: eventMap[status],
    updatedAt: new Date().toISOString(),
  };
}

export function mockTenantRoute(page: Page, tenant: typeof TENANT_A) {
  page.route(`**/api/v1/tenants/*`, async (route) => {
    await route.fulfill(jsonOk(tenant));
  });
}

export function mockCategoriesRoute(page: Page, categories: typeof CATEGORIES_A = CATEGORIES_A) {
  page.route('**/api/v1/menu/categories*', async (route) => {
    await route.fulfill(jsonOk(categories));
  });
}

export function mockProductsRoute(page: Page, products: typeof PRODUCTS_A_FLAT = PRODUCTS_A_FLAT) {
  page.route('**/api/v1/menu/products', async (route) => {
    const request = route.request();
    const tenantHeader = request.headers()['x-tenant-id'];
    if (tenantHeader === TENANT_B.id) {
      const tenantBProducts = CATEGORY_B.flatMap((cat) =>
        cat.products.map((p) => ({ ...p, categoryId: cat.id, categoryName: cat.name }))
      );
      await route.fulfill(jsonOk(tenantBProducts));
    } else {
      await route.fulfill(jsonOk(products));
    }
  });
}

export function mockCheckoutRoute(
  page: Page,
  store: MockOrderStore,
  responseOverrides?: Partial<typeof CHECKOUT_RESPONSE>
) {
  page.route('**/api/v1/orders/checkout', async (route) => {
    const request = route.request();
    const tenantHeader = request.headers()['x-tenant-id'];
    if (!tenantHeader) {
      await route.fulfill(jsonForbidden());
      return;
    }
    store.orderCounter++;
    const orderNumber = `ORD-2026-${String(store.orderCounter).padStart(3, '0')}`;
    const orderId = `order-${store.orderCounter}`;
    const body = JSON.parse(request.postData() || '{}');
    const items = body.items || [];

    const subtotal = items.reduce((sum: number, item: Record<string, unknown>) => {
      const product = PRODUCTS_A_FLAT.find((p) => p.id === item.productId);
      return sum + (product ? product.basePrice * (Number(item.quantity) || 1) : 0);
    }, 0);
    const taxAmount = Math.round(subtotal * 0.15 * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;

    const order = {
      id: orderId,
      orderNumber,
      tenantId: tenantHeader,
      branchId: body.branchId || BRANCH_A.id,
      type: body.type || 'DINE_IN',
      status: 'PENDING',
      subtotal,
      taxAmount,
      total,
      createdAt: new Date().toISOString(),
      ...responseOverrides,
    };

    store.orders.set(orderId, order);
    await route.fulfill(jsonCreated(order));
  });
}

export function mockOrdersListRoute(page: Page, store: MockOrderStore) {
  page.route('**/api/v1/orders?**', async (route) => {
    const url = new URL(route.request().url());
    const branchId = url.searchParams.get('branchId');
    const tenantHeader = route.request().headers()['x-tenant-id'];
    const orders = Array.from(store.orders.values()).filter((o) => {
      if (branchId && o.branchId !== branchId) return false;
      if (tenantHeader && o.tenantId !== tenantHeader) return false;
      return true;
    });
    await route.fulfill(jsonOk(orders));
  });
}

export function mockOrderGetRoute(page: Page, store: MockOrderStore) {
  page.route('**/api/v1/orders/*', async (route) => {
    const request = route.request();
    if (request.method() === 'PUT') {
      const urlParts = route.request().url().split('/');
      const orderId = urlParts[urlParts.length - 2];
      const body = JSON.parse(request.postData() || '{}');
      const newStatus = body.status as OrderStatus;
      const existing = store.orders.get(orderId);
      if (existing) {
        existing.status = newStatus;
        store.orders.set(orderId, existing);
      }
      await route.fulfill(jsonOk(getOrderStatusResponse(orderId, newStatus)));
      return;
    }
    if (request.method() === 'POST' && route.request().url().includes('/cancel')) {
      const urlParts = route.request().url().split('/');
      const orderId = urlParts[urlParts.length - 2];
      const existing = store.orders.get(orderId);
      if (existing) {
        existing.status = 'CANCELLED';
        store.orders.set(orderId, existing);
      }
      await route.fulfill(jsonOk(getOrderStatusResponse(orderId, 'CANCELLED')));
      return;
    }
    const urlParts = route.request().url().split('/');
    const orderId = urlParts[urlParts.length - 1];
    const order = store.orders.get(orderId);
    if (order) {
      await route.fulfill(jsonOk(order));
    } else {
      await route.fulfill(jsonNotFound(`Order ${orderId} not found`));
    }
  });
}

export function mockKdsTicketsRoute(page: Page, store: MockOrderStore) {
  page.route('**/api/v1/kds/tickets**', async (route) => {
    const url = new URL(route.request().url());
    const branchId = url.searchParams.get('branchId');
    const tickets = Array.from(store.orders.values())
      .filter((o) => {
        if (branchId && o.branchId !== branchId) return false;
        return ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status as string);
      })
      .map((o) => ({
        ticketId: o.id,
        ticketNumber: (o.orderNumber as string)?.slice(-3) || '000',
        priority: 'NORMAL',
        elapsedMinutes: 0,
        items: ((o as Record<string, unknown>).orderItems as Array<Record<string, unknown>> || []).map(
          (item) => ({
            id: item.id,
            name: item.productName || 'Unknown',
            quantity: item.quantity || 1,
            size: item.sizeName || null,
            addons: [],
            cookingStatus: item.cookingStatus || 'PENDING',
          })
        ),
      }));
    await route.fulfill(jsonOk(tickets));
  });
}

export function mockKdsStatusUpdateRoute(page: Page) {
  page.route('**/api/v1/kds/items/*/status', async (route) => {
    const request = route.request();
    const body = JSON.parse(request.postData() || '{}');
    const urlParts = route.request().url().split('/');
    const orderItemId = urlParts[urlParts.length - 2];
    await route.fulfill(jsonOk({
      orderItemId,
      cookingStatus: body.status,
      updatedAt: new Date().toISOString(),
    }));
  });
}

export function mockBranchesRoute(page: Page, branch: typeof BRANCH_A = BRANCH_A) {
  page.route('**/api/v1/branches**', async (route) => {
    await route.fulfill(jsonOk([branch]));
  });
}

export function mockMetricsRoute(page: Page) {
  page.route('**/api/v1/admin/tenants/metrics**', async (route) => {
    await route.fulfill(jsonOk(METRICS_RESPONSE));
  });
}

export function mockAuthLoginRoute(page: Page, user: { id: string; email: string; roles: string[] }) {
  page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill(jsonOk({
      accessToken: 'mock-jwt-access-token-e2e',
      refreshToken: 'mock-jwt-refresh-token-e2e',
      user,
    }));
  });
}

export function mockAuthMeRoute(page: Page, user: { id: string; email: string; roles: string[] }) {
  page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill(jsonOk(user));
  });
}

export function mockHealthRoute(page: Page) {
  page.route('**/api/v1/health', async (route) => {
    await route.fulfill(jsonOk({ status: 'ok', timestamp: new Date().toISOString() }));
  });
}

export function mockAllCheckoutFlows(
  page: Page,
  store: MockOrderStore,
  options?: { tenant?: typeof TENANT_A; branch?: typeof BRANCH_A }
) {
  mockHealthRoute(page);
  mockCategoriesRoute(page, options?.tenant?.id === TENANT_B.id ? CATEGORY_B : CATEGORIES_A);
  mockProductsRoute(page);
  mockCheckoutRoute(page, store);
  mockOrdersListRoute(page, store);
  mockOrderGetRoute(page, store);
  mockBranchesRoute(page, options?.branch);
  mockKdsTicketsRoute(page, store);
  mockKdsStatusUpdateRoute(page);
  mockMetricsRoute(page);
}
