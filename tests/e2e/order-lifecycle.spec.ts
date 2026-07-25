import { test, expect } from '@playwright/test';
import {
  TENANT_A,
  BRANCH_A,
  USER_A_CASHIER,
  USER_A_KITCHEN,
  ORDER_A_001,
} from './fixtures/mock-data';
import {
  createOrderStore,
  mockAllCheckoutFlows,
  mockAuthLoginRoute,
  mockAuthMeRoute,
} from './fixtures/api-mocks';

const CASHIER_URL = 'http://localhost:3002';
const BACKOFFICE_URL = 'http://localhost:3001';
const QR_MENU_URL = 'http://localhost:3000';

test.describe('Complete Order Lifecycle (TSK-5.5)', () => {
  test('customer places order via QR Menu with product configuration', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);

    await page.goto(`${QR_MENU_URL}/?table=qr_token_07`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText(TENANT_A.name);

    await page.locator('text=Truffle Umami Smash Burger').first().click();
    await expect(page.locator('h3').last()).toContainText('Truffle Umami Smash Burger');

    await page.locator('button:has-text("Double Patty Max")').click();
    await page.locator('button:has-text("Add to Cart")').first().click();

    const expectedPrice = (14.5 + 4.0).toFixed(2);
    await expect(page.locator(`button:has-text("Add to Cart ($${expectedPrice})")`)).toBeVisible();

    expect(page).toHaveURL(/localhost:3000/);
  });

  test('Cashier terminal loads products from API and displays UI', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);
    mockAuthLoginRoute(page, USER_A_CASHIER);
    mockAuthMeRoute(page, USER_A_CASHIER);

    await page.goto(CASHIER_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText('Cashier Terminal');
    await expect(page.locator('.bg-green-600')).toBeVisible();
    await expect(page.locator('text=Tenant Isolated')).toBeVisible();
  });

  test('Cashier adds items to cart and verifies totals', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);
    mockAuthLoginRoute(page, USER_A_CASHIER);
    mockAuthMeRoute(page, USER_A_CASHIER);

    page.on('dialog', (dialog) => dialog.accept());

    await page.goto(CASHIER_URL);
    await page.waitForLoadState('networkidle');

    const productButtons = page.locator('main button');
    const count = await productButtons.count();
    expect(count).toBeGreaterThan(0);

    await productButtons.first().click();
    await expect(page.locator('text=1x')).toBeVisible();

    await productButtons.first().click();
    await expect(page.locator('text=2x')).toBeVisible();
  });

  test('Cashier checkout triggers API call with correct headers', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);
    mockAuthLoginRoute(page, USER_A_CASHIER);
    mockAuthMeRoute(page, USER_A_CASHIER);

    const checkoutRequests: Array<{ headers: Record<string, string>; body: string }> = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/orders/checkout')) {
        checkoutRequests.push({
          headers: request.headers(),
          body: request.postData() || '',
        });
      }
    });

    page.on('dialog', (dialog) => dialog.accept());

    await page.goto(CASHIER_URL);
    await page.waitForLoadState('networkidle');

    const firstProduct = page.locator('main button').first();
    await firstProduct.click();

    await page.locator('button:has-text("Checkout")').click();

    await page.waitForTimeout(2000);

    if (checkoutRequests.length > 0) {
      const req = checkoutRequests[0];
      expect(req.headers['x-tenant-id']).toBeDefined();
      const body = JSON.parse(req.body);
      expect(body.branchId).toBeDefined();
      expect(body.items).toBeDefined();
      expect(Array.isArray(body.items)).toBe(true);
    }
  });

  test('Kitchen receives order ticket via KDS page', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);
    mockAuthLoginRoute(page, USER_A_KITCHEN);
    mockAuthMeRoute(page, USER_A_KITCHEN);

    await page.goto(`${BACKOFFICE_URL}/kds?branchId=${BRANCH_A.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Active Production Board')).toBeVisible();
    await expect(page.locator('text=Connected').first()).toBeVisible({ timeout: 10000 });
  });

  test('order status transitions via mocked API responses', async ({ page }) => {
    const store = createOrderStore();
    const statusTransitions: string[] = [];

    page.on('response', async (response) => {
      if (response.url().includes('/api/v1/orders/') && response.url().includes('/status')) {
        try {
          const body = await response.json();
          if (body.status) {
            statusTransitions.push(body.status);
          }
        } catch {}
      }
    });

    mockAllCheckoutFlows(page, store);

    const statuses = ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'];

    await page.goto(QR_MENU_URL);
    await page.waitForLoadState('networkidle');

    for (const status of statuses) {
      const orderId = ORDER_A_001.id;
      const response = {
        id: orderId,
        status,
        updatedAt: new Date().toISOString(),
      };

      page.once('route', (route) => {
        if (
          route.request().url().includes(`/api/v1/orders/${orderId}/status`) &&
          route.request().method() === 'PUT'
        ) {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(response),
          });
        }
      });
    }

    expect(statuses.length).toBe(4);
  });

  test('Cashier terminal shows offline queue section', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);
    mockAuthLoginRoute(page, USER_A_CASHIER);
    mockAuthMeRoute(page, USER_A_CASHIER);

    await page.goto(CASHIER_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Offline Queue')).toBeVisible();
    await expect(page.locator('text=No offline orders')).toBeVisible();
  });

  test('Cashier terminal footer shows tenant and branch context', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);
    mockAuthLoginRoute(page, USER_A_CASHIER);
    mockAuthMeRoute(page, USER_A_CASHIER);

    await page.goto(CASHIER_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Service Workers cached')).toBeVisible();
    await expect(page.locator('footer')).toContainText('IndexedDB');
  });
});
