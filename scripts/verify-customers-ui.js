/**
 * Playwright browser verification for Customers UI (AUDIT-014 Phase 2 module 5).
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

  // Login via the API from the browser context
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

  // Set auth session in localStorage (individual keys per auth.ts STORAGE_KEYS)
  await page.evaluate((login) => {
    localStorage.setItem('accessToken', login.accessToken);
    localStorage.setItem('csrfToken', login.csrfToken);
    if (login.user?.tenantId) {
      localStorage.setItem('tenantId', login.user.tenantId);
    }
    localStorage.setItem('user', JSON.stringify(login.user));
  }, loginResp);

  // Navigate to backoffice home
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'customers-01-home.png') });
  console.log('✓ customers-01-home.png');

  // Click Customers tab
  await page.locator('button', { hasText: 'Customers' }).click();
  await sleep(2000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'customers-02-tab.png') });
  console.log('✓ customers-02-tab.png');

  const rows = await page.locator('table tbody tr').count();
  console.log(`✓ Initial rows: ${rows}`);

  // ─── CREATE ───
  await page.locator('button', { hasText: '+ New customer' }).click();
  await sleep(1000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'customers-03-create-modal.png') });
  console.log('✓ customers-03-create-modal.png');

  await page.locator('#cust-first').fill('Browser');
  await page.locator('#cust-last').fill('TestUser');
  await page.locator('#cust-email').fill('browser.test@verify.com');
  await page.locator('#cust-phone').fill('+968 9222 3333');

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'customers-04-create-filled.png') });
  console.log('✓ customers-04-create-filled.png');

  await page.locator('button[type="submit"]', { hasText: 'Create customer' }).click();
  await sleep(3000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'customers-05-after-create.png') });
  console.log('✓ customers-05-after-create.png');

  const afterCreate = await page.locator('table tbody tr').count();
  console.log(`✓ After create: ${afterCreate} rows`);

  // ─── EDIT ───
  const editRow = page.locator('tr', { hasText: 'Browser TestUser' });
  await editRow.locator('button', { hasText: 'Edit' }).click();
  await sleep(1000);

  await page.locator('#cust-loyalty').fill('100');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'customers-06-edit-modal.png') });
  console.log('✓ customers-06-edit-modal.png');

  await page.locator('button[type="submit"]', { hasText: 'Save changes' }).click();
  await sleep(2000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'customers-07-after-edit.png') });
  console.log('✓ customers-07-after-edit.png');

  // ─── ARCHIVE ───
  const archiveRow = page.locator('tr', { hasText: 'Browser TestUser' });
  await archiveRow.locator('button', { hasText: 'Archive' }).click();
  await sleep(1000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'customers-08-archive-confirm.png') });
  console.log('✓ customers-08-archive-confirm.png');

  // Confirm archive (click the last "Archive" button which is in the confirm dialog)
  await page.locator('button', { hasText: 'Archive' }).last().click();
  await sleep(2000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'customers-09-after-archive.png') });
  console.log('✓ customers-09-after-archive.png');

  const afterArchive = await page.locator('table tbody tr').count();
  console.log(`✓ After archive: ${afterArchive} rows`);

  // ─── ARCHIVED VIEW ───
  await page.locator('button[aria-pressed]', { hasText: 'archived' }).click();
  await sleep(2000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'customers-10-archived-view.png') });
  console.log('✓ customers-10-archived-view.png');

  const archivedRows = await page.locator('table tbody tr').count();
  console.log(`✓ Archived view: ${archivedRows} rows`);

  // ─── RESTORE ───
  await page.locator('tr', { hasText: 'Browser TestUser' }).locator('button', { hasText: 'Restore' }).click();
  await sleep(2000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'customers-11-after-restore.png') });
  console.log('✓ customers-11-after-restore.png');

  // Switch back to active view
  await page.locator('button[aria-pressed]', { hasText: 'active' }).click();
  await sleep(2000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'customers-12-active-final.png') });
  console.log('✓ customers-12-active-final.png');

  const finalRows = await page.locator('table tbody tr').count();
  console.log(`✓ Final active: ${finalRows} rows`);

  await browser.close();
  console.log('\n=== Customers UI Browser Verification COMPLETE ===');
  console.log(`CRUD path: Create(${afterCreate}) Edit Archive(${afterArchive}) ArchivedView(${archivedRows}) Restore Final(${finalRows})`);
}

run().catch(e => { console.error(e); process.exit(1); });
