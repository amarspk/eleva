const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  console.log('Navigating...');
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('Clicking Tables tab...');
  await page.locator('button').filter({ hasText: 'Tables' }).click();
  await page.waitForTimeout(2500);

  await page.screenshot({ path: 'screenshots/tables-01-tab.png', fullPage: true });
  console.log('Saved: tables-01-tab.png');

  // Create form
  const newBtn = page.locator('button').filter({ hasText: /New table/i });
  if (await newBtn.count() > 0) {
    await newBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'screenshots/tables-02-create.png', fullPage: true });
    console.log('Saved: tables-02-create.png');
  }

  // Fill and show
  const numInput = page.locator('input#table-number, input[placeholder*="number"]');
  if (await numInput.count() > 0) await numInput.fill('T-42');
  const cap = page.locator('#table-capacity');
  if (await cap.count() > 0) await cap.fill('6');
  await page.screenshot({ path: 'screenshots/tables-03-filled.png', fullPage: true });
  console.log('Saved: tables-03-filled.png');

  await page.screenshot({ path: 'screenshots/tables-final.png', fullPage: true });
  console.log('Saved: tables-final.png');

  await browser.close();
  console.log('Screenshots complete in /home/user/zayjar/screenshots/');
})();
