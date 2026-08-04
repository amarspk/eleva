/**
 * Quick debug: check what the backoffice page shows after login.
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

  console.log('Login:', loginResp.accessToken ? 'SUCCESS' : 'FAILED');

  // Set auth session (individual keys)
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
  await sleep(3000);

  // Take a screenshot to see what's rendered
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'debug-home.png') });

  // Print the page content
  const text = await page.innerText('body').catch(() => 'NO BODY TEXT');
  console.log('Page text (first 500 chars):', text.substring(0, 500));

  // Print all button texts
  const buttons = await page.locator('button').allTextContents();
  console.log('Buttons:', buttons);

  // Check for the login form (might mean we got redirected back)
  const url = page.url();
  console.log('Current URL:', url);

  await browser.close();
}

run().catch(e => { console.error(e); process.exit(1); });
