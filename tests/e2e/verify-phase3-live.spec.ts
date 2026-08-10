import { test, expect } from '@playwright/test';
import { prisma, dbTenantContext } from '@zayjar/db';

/**
 * LIVE Phase 3 verification — real Chromium → real Next (production build) →
 * real API (compiled dist) → real PostgreSQL.
 *
 * Provisioned by CI job `e2e-live` (.github/workflows/ci.yml): postgres +
 * redis services, migrations applied via the canonical chain (M4 parked per
 * the standing R2/PREX-MIG-002 closure), canonical seed, API on :8000,
 * qr-menu on :3000, tenant subdomain `albaik.localhost` mapped in /etc/hosts
 * so TenantContextMiddleware resolves tenancy from the Host header.
 *
 * This spec contains NO API mocks. Every assertion flows through the real
 * database and the real public API. It closes the Phase 3 verification gaps
 * recorded in PROJECT_STATE.md:
 *   1. live Chromium cart scroll preservation (add/open/close/qty/remove/place)
 *   2. live PostgreSQL preorder persistence (isPreorder/scheduledAt/preorderStatus)
 *   3. live draft-vs-published design exposure (published only, draft never)
 */

const API_BASE = process.env.API_INTERNAL_URL || 'http://albaik.localhost:8000';
const QR_BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://albaik.localhost:3000';

let tenantId: string;
let branchId: string;
let token: string;
let productId: string;
let productName: string;

test.beforeAll(async () => {
  const tenant = await prisma.tenant.findUnique({ where: { subdomain: 'albaik' } });
  expect(tenant, 'seeded tenant albaik must exist').not.toBeNull();
  tenantId = tenant!.id;

  const ctx = await dbTenantContext.run({ tenantId }, async () => {
    const table = await prisma.table.findFirst({ where: { deletedAt: null } });
    expect(table, 'seeded table must exist').not.toBeNull();
    const product = await prisma.product.findFirst({
      where: { isAvailable: true, deletedAt: null },
      orderBy: { name: 'asc' },
    });
    expect(product, 'seeded active product must exist').not.toBeNull();
    return { table, product };
  });

  token = ctx.table!.qrCodeToken;
  branchId = ctx.table!.branchId;
  productId = ctx.product!.id;
  productName = ctx.product!.name;
});

test.describe('Phase 3 LIVE — real stack, no mocks', () => {
  test('1. SSR menu renders real seeded data; design:null falls back to product grid', async ({ page }) => {
    await page.goto(`${QR_BASE}/?t=${encodeURIComponent(token)}`);
    await page.waitForLoadState('domcontentloaded');
    // tenant header comes from the database via the API
    await expect(page.locator('h1').first()).toContainText('Al-Baik');
    // a real seeded product is visible (grid fallback, no published sections)
    await expect(page.locator(`text=${productName}`).first()).toBeVisible({ timeout: 15000 });

    // API contract: with no TenantDesign row, design is null
    const res = await fetch(`${API_BASE}/api/v1/public/menu?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { design: unknown };
    expect(body.design).toBeNull();
  });

  test('2. live cart: add/open/close preserves scroll; qty +/- and remove work', async ({ page }) => {
    await page.goto(`${QR_BASE}/?t=${encodeURIComponent(token)}`);
    await page.waitForLoadState('domcontentloaded');
    const target = page.locator(`text=${productName}`).first();
    await expect(target).toBeVisible({ timeout: 15000 });

    // Deterministic anchor: bring the product card into view, then record the
    // settled scroll position. The guarantee under test is that the cart UX
    // (open product / add / open cart / close) never moves the page itself.
    await target.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);

    // open product detail and add to cart — scroll preserved
    await target.click();
    await page.waitForTimeout(300);
    const addBtn = page.locator('button:has-text("Add to Cart")').first();
    await expect(addBtn).toBeVisible();
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(50);
    await addBtn.click();
    await page.waitForTimeout(500);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(50);

    // open cart — scroll preserved
    const viewCart = page.locator('button:has-text("View cart")').first();
    await expect(viewCart).toBeVisible();
    await viewCart.click();
    await page.waitForTimeout(300);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(50);

    // quantity + and - inside the drawer
    const cartPanel = page.locator('div.max-h-\\[65vh\\]').first();
    await expect(cartPanel).toBeVisible();
    const stepper = cartPanel.locator('div.rounded-full').first();
    await expect(stepper.locator('span').first()).toHaveText('1');
    await cartPanel.locator('button:has-text("+")').first().click();
    await expect(stepper.locator('span').first()).toHaveText('2');
    await cartPanel.locator('button:has-text("-")').first().click();
    await expect(stepper.locator('span').first()).toHaveText('1');

    // remove -> empty state
    await cartPanel.locator('button:has-text("Remove")').click();
    await expect(cartPanel.locator('text=Your cart is empty.')).toBeVisible();

    // close drawer — scroll preserved
    await page.locator('button:has-text("×")').last().click();
    await page.waitForTimeout(500);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(50);
  });

  test('3. live place order persists to PostgreSQL (PENDING, items, totals)', async ({ page }) => {
    await page.goto(`${QR_BASE}/?t=${encodeURIComponent(token)}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(`text=${productName}`).first()).toBeVisible({ timeout: 15000 });

    await page.locator(`text=${productName}`).first().click();
    await page.locator('button:has-text("Add to Cart")').first().click();
    await page.waitForTimeout(300);
    await page.locator('button:has-text("View cart")').first().click();
    await page.waitForTimeout(300);
    await page.locator('button:has-text("Place order")').first().click();

    // confirmation view shows the real server-issued order number
    const confirmation = page.locator('text=/ORD-\\d{4}-\\d+/').first();
    await expect(confirmation).toBeVisible({ timeout: 20000 });

    // the order exists in PostgreSQL with a real item line
    const order = await dbTenantContext.run({ tenantId }, async () => {
      return prisma.order.findFirst({ where: {}, orderBy: { createdAt: 'desc' } });
    });
    expect(order, 'a real order row must exist').not.toBeNull();
    expect(order!.orderNumber).toMatch(/^ORD-\d{4}-\d+$/);
    expect(order!.status).toBe('PENDING');
    expect(order!.isPreorder).toBe(false);
    expect(order!.paymentMethod).toBe('CASH');

    const itemCount = await dbTenantContext.run({ tenantId }, async () => {
      return prisma.orderItem.count({ where: { orderId: order!.id } });
    });
    expect(itemCount).toBeGreaterThan(0);

    // kitchen queue entry was created by the transaction
    const queueCount = await dbTenantContext.run({ tenantId }, async () => {
      return prisma.kitchenQueue.count({ where: { orderId: order!.id } });
    });
    expect(queueCount).toBe(1);
  });

  test('4. live preorder: UI schedules, DB persists, 15-min rule enforced', async ({ page }) => {
    await page.goto(`${QR_BASE}/?t=${encodeURIComponent(token)}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(`text=${productName}`).first()).toBeVisible({ timeout: 15000 });

    await page.locator(`text=${productName}`).first().click();
    await page.locator('button:has-text("Add to Cart")').first().click();
    await page.waitForTimeout(300);
    await page.locator('button:has-text("View cart")').first().click();
    await page.waitForTimeout(300);

    // schedule ~45 minutes ahead in browser-local time
    const d = new Date(Date.now() + 45 * 60_000);
    const localValue = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await page.locator('text=Pre-order (schedule for later)').click();
    await page.locator('input[type="datetime-local"]').fill(localValue);
    await page.locator('button:has-text("Place order")').first().click();

    const confirmation = page.locator('text=/ORD-\\d{4}-\\d+/').first();
    await expect(confirmation).toBeVisible({ timeout: 20000 });

    // PostgreSQL: isPreorder=true, preorderStatus=SCHEDULED, scheduledAt ~45min out
    const order = await dbTenantContext.run({ tenantId }, async () => {
      return prisma.order.findFirst({ where: { isPreorder: true }, orderBy: { createdAt: 'desc' } });
    });
    expect(order, 'a real preorder row must exist').not.toBeNull();
    expect(order!.preorderStatus).toBe('SCHEDULED');
    expect(order!.scheduledAt).not.toBeNull();
    const deltaMinutes = (order!.scheduledAt!.getTime() - Date.now()) / 60_000;
    expect(deltaMinutes).toBeGreaterThan(30);
    expect(deltaMinutes).toBeLessThan(60);

    // server-side rule: scheduledAt less than 15 minutes ahead is rejected
    const tooSoon = new Date(Date.now() + 5 * 60_000).toISOString();
    const res = await fetch(`${API_BASE}/api/v1/public/orders/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId,
        qrCodeToken: token,
        type: 'DINE_IN',
        paymentMethod: 'CASH',
        items: [{ productId, quantity: 1 }],
        isPreorder: true,
        scheduledAt: tooSoon,
      }),
    });
    expect(res.status).toBe(400);
    const errBody = (await res.json()) as { message: string | string[] };
    expect(JSON.stringify(errBody.message)).toContain('at least 15 minutes');
  });

  test('5. live draft-vs-published: public menu exposes published design only', async () => {
    const markerPublished = `PUBLISHED-${Date.now()}`;
    const markerDraft = `DRAFT-${Date.now()}`;

    // Seed has no TenantDesign row; create one through the real tenant-scoped
    // client with distinctive markers in draft and published.
    await dbTenantContext.run({ tenantId }, async () => {
      const existing = await prisma.tenantDesign.findUnique({ where: { tenantId } });
      const data = {
        draft: { sections: [{ type: 'hero', title: markerDraft }] },
        published: { sections: [{ type: 'hero', title: markerPublished }] },
        version: existing ? existing.version + 1 : 1,
        publishedAt: new Date(),
      };
      if (existing) {
        await prisma.tenantDesign.update({ where: { tenantId }, data });
      } else {
        await prisma.tenantDesign.create({ data });
      }
    });

    try {
      const res = await fetch(`${API_BASE}/api/v1/public/menu?token=${encodeURIComponent(token)}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { design: unknown };
      expect(body.design, 'published design must be exposed').not.toBeNull();
      const serialized = JSON.stringify(body.design);
      expect(serialized).toContain(markerPublished);
      expect(serialized).not.toContain(markerDraft);
    } finally {
      // restore pristine state
      await dbTenantContext.run({ tenantId }, async () => {
        return prisma.tenantDesign.delete({ where: { tenantId } });
      });
    }
  });
});
