const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 950 });

  console.log('Navigating to http://localhost:3001 ...');
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);

  console.log('Clicking Tables tab...');
  await page.getByRole('button', { name: 'Tables' }).click().catch(async () => {
    await page.locator('button').filter({ hasText: 'Tables' }).first().click();
  });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'screenshots/tables-01-tab.png', fullPage: true });
  console.log('Saved tables-01-tab.png');

  const tablesSection = page.locator('section[aria-labelledby="tables-heading"]');
  if (await tablesSection.count() > 0) {
    await tablesSection.screenshot({ path: 'screenshots/tables-02-module.png' });
    console.log('Saved tables-02-module.png');
  }

  // Open create
  const newBtn = page.getByRole('button', { name: /New table/i });
  if (await newBtn.count() > 0) {
    console.log('Opening create form...');
    await newBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'screenshots/tables-03-create-modal.png', fullPage: true });
    console.log('Saved tables-03-create-modal.png');

    // Fill fields (UI verification)
    const branch = page.locator('#table-branch');
    if (await branch.count() > 0) {
      const count = await branch.locator('option').count();
      if (count > 1) await branch.selectOption({ index: 1 }).catch(() => {});
    }
    const numberField = page.locator('#table-number');
    if (await numberField.count() > 0) await numberField.fill('T-VERIFY-42');
    const cap = page.locator('#table-capacity');
    if (await cap.count() > 0) await cap.fill('6');

    await page.screenshot({ path: 'screenshots/tables-04-filled.png', fullPage: true });
    console.log('Saved tables-04-filled.png');

    // Close without submit to keep UI clean
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  }

  // Archived view
  const archived = page.getByRole('button', { name: 'archived' });
  if (await archived.count() > 0) {
    await archived.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/tables-05-archived.png', fullPage: true });
    console.log('Saved tables-05-archived.png');
  }

  // Back to active
  const active = page.getByRole('button', { name: 'active' });
  if (await active.count() > 0) await active.click();
  await page.waitForTimeout(1500);

  await page.screenshot({ path: 'screenshots/tables-06-final.png', fullPage: true });
  console.log('Saved tables-06-final.png');

  await browser.close();
  console.log('=== Tables UI verification complete ===');
})();
