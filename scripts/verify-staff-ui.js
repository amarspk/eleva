/**
 * Playwright browser verification for Staff UI (AUDIT-014 Phase 2 module 6).
 */
const { chromium } = require('/home/user/zayjar/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');
const path = require('path');

const BASE = 'http://albaik.localhost:3001';
const API = 'http://albaik.localhost:8000';
const TENANT_ID = '80a00898-782c-4a6e-8bad-880e8f4f7977';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Navigate to login page
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(1000);

  // Login via API
  const loginResp = await page.evaluate(async (opts) => {
    const resp = await fetch(`${opts.api}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': opts.tenantId },
      body: JSON.stringify({ email: 'admin@albaik.com', password: 'Test@123' }),
    });
    return resp.json();
  }, { api: API, tenantId: TENANT_ID });

  console.log('Login:', loginResp.accessToken ? 'SUCCESS' : 'FAILED', loginResp.message || '');

  if (!loginResp.accessToken) {
    console.error('Cannot authenticate. Aborting.');
    await browser.close();
    process.exit(1);
  }

  // Set auth session
  await page.evaluate((login) => {
    localStorage.setItem('accessToken', login.accessToken);
    localStorage.setItem('csrfToken', login.csrfToken);
    if (login.user?.tenantId) {
      localStorage.setItem('tenantId', login.user.tenantId);
    }
    localStorage.setItem('user', JSON.stringify(login.user));
  }, loginResp);

  // Navigate to backoffice
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'staff-01-home.png') });
  console.log('✓ staff-01-home.png');

  // Click Staff tab
  await page.locator('button', { hasText: 'Staff' }).click();
  await sleep(2000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'staff-02-tab.png') });
  console.log('✓ staff-02-tab.png');

  const rows = await page.locator('table tbody tr').count();
  console.log(`✓ Initial rows: ${rows}`);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'staff-03-list.png') });
  console.log('✓ staff-03-list.png');

  // ─── CREATE ───
  await page.locator('button', { hasText: '+ New staff member' }).click();
  await sleep(1000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'staff-04-create-modal.png') });
  console.log('✓ staff-04-create-modal.png');

  await page.locator('#staff-first').fill('Browser');
  await page.locator('#staff-last').fill('StaffTest');
  await page.locator('#staff-email').fill('browser.staff@verify.com');
  await page.locator('#staff-pass').fill('TestPass@123');

  // Select CASHIER role checkbox
  const cashierCheckbox = page.locator('input[type="checkbox"]').filter({ hasText: '' });
  // Click the CASHIER label
  await page.locator('label', { hasText: 'CASHIER' }).click();

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'staff-05-create-filled.png') });
  console.log('✓ staff-05-create-filled.png');

  await page.locator('button[type="submit"]', { hasText: 'Create staff member' }).click();
  await sleep(3000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'staff-06-after-create.png') });
  console.log('✓ staff-06-after-create.png');

  const afterCreate = await page.locator('table tbody tr').count();
  console.log(`✓ After create: ${afterCreate} rows`);

  // ─── EDIT ───
  const editRow = page.locator('tr', { hasText: 'Browser StaffTest' });
  await editRow.locator('button', { hasText: 'Edit' }).click();
  await sleep(1000);

  await page.locator('#staff-last').fill('StaffTest-Updated');

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'staff-07-edit-modal.png') });
  console.log('✓ staff-07-edit-modal.png');

  await page.locator('button[type="submit"]', { hasText: 'Save changes' }).click();
  await sleep(2000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'staff-08-after-edit.png') });
  console.log('✓ staff-08-after-edit.png');

  // ─── DELETE ───
  const deleteRow = page.locator('tr', { hasText: 'Browser StaffTest' });
  await deleteRow.locator('button', { hasText: 'Delete' }).click();
  await sleep(1000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'staff-09-delete-confirm.png') });
  console.log('✓ staff-09-delete-confirm.png');

  // Confirm delete
  await page.locator('button', { hasText: 'Delete' }).last().click();
  await sleep(2000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'staff-10-after-delete.png') });
  console.log('✓ staff-10-after-delete.png');

  const afterDelete = await page.locator('table tbody tr').count();
  console.log(`✓ After delete: ${afterDelete} rows`);

  await browser.close();
  console.log('\n=== Staff UI Browser Verification COMPLETE ===');
  console.log(`CRUD path: Create(${afterCreate}) Edit Delete(${afterDelete})`);
}

run().catch(e => { console.error(e); process.exit(1); });
