/**
 * Capture Playwright screenshots for Products, Categories, Branches modules.
 * Requires: API on port 8000, Backoffice on port 3001, both running.
 */
const { chromium } = require('/home/user/zayjar/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const UI = 'http://albaik.localhost:3001';
const S = '/home/user/zayjar/screenshots';

async function login(page) {
  await page.goto(`${UI}/login`);
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"]', 'admin@albaik.com');
  await page.fill('input[type="password"]', 'Test@123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/', { timeout: 10000 });
  await page.waitForTimeout(2000);
}

async function clickTab(page, name) {
  await page.click(`nav button:has-text("${name}")`, { timeout: 5000 });
  await page.waitForTimeout(2000);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await login(page);

  // === PRODUCTS ===
  await clickTab(page, 'Products');
  await page.screenshot({ path: `${S}/products-01-tab.png` });
  console.log('✓ products-01-tab');

  const addProd = await page.$('button:has-text("New product")');
  if (addProd) {
    await addProd.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${S}/products-02-create-modal.png` });
    // Fill name
    const nameInput = await page.$('input[id="name"]');
    if (nameInput) await nameInput.fill('Screenshot Test Product');
    const priceInput = await page.$('input[id="basePrice"]');
    if (priceInput) await priceInput.fill('12.50');
    await page.screenshot({ path: `${S}/products-03-create-filled.png` });
    // Cancel
    const cancel = await page.$('button:has-text("Cancel")');
    if (cancel) await cancel.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${S}/products-04-list.png` });
  console.log('✓ products-02-04');

  // === CATEGORIES ===
  await clickTab(page, 'Categories');
  await page.screenshot({ path: `${S}/categories-01-tab.png` });
  console.log('✓ categories-01-tab');

  const addCat = await page.$('button:has-text("New category")');
  if (!addCat) {
    const alt = await page.$('button:has-text("Add")');
    if (alt) await alt.click();
  } else {
    await addCat.click();
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${S}/categories-02-create-modal.png` });
  const catName = await page.$('input[id="name"]');
  if (catName) await catName.fill('Screenshot Test Category');
  await page.screenshot({ path: `${S}/categories-03-create-filled.png` });
  const cancel2 = await page.$('button:has-text("Cancel")');
  if (cancel2) await cancel2.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${S}/categories-04-list.png` });
  console.log('✓ categories-02-04');

  // === BRANCHES ===
  await clickTab(page, 'Branches');
  await page.screenshot({ path: `${S}/branches-01-tab.png` });
  console.log('✓ branches-01-tab');

  const addBranch = await page.$('button:has-text("New branch")');
  if (!addBranch) {
    const alt2 = await page.$('button:has-text("Add")');
    if (alt2) await alt2.click();
  } else {
    await addBranch.click();
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${S}/branches-02-create-modal.png` });
  const brName = await page.$('input[id="name"]');
  if (brName) await brName.fill('Screenshot Test Branch');
  const brAddr = await page.$('input[id="address"]');
  if (brAddr) await brAddr.fill('123 Test St');
  await page.screenshot({ path: `${S}/branches-03-create-filled.png` });
  const cancel3 = await page.$('button:has-text("Cancel")');
  if (cancel3) await cancel3.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${S}/branches-04-list.png` });
  console.log('✓ branches-02-04');

  await browser.close();
  console.log('All screenshots captured.');
}

main().catch(e => { console.error(e); process.exit(1); });
