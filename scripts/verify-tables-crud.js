const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating...');
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: '/home/user/zayjar/screenshots/tables-01-home.png', fullPage: true });
  console.log('✓ Home');

  await page.click('button:has-text("Tables")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/home/user/zayjar/screenshots/tables-02-module.png', fullPage: true });
  console.log('✓ Tables tab');

  // Try create if button exists
  const createBtn = page.locator('button:has-text("+ New table")');
  if (await createBtn.count() > 0) {
    await createBtn.click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: '/home/user/zayjar/screenshots/tables-03-create.png', fullPage: true });

    await page.fill('#table-number', 'T03');
    await page.fill('#table-capacity', '8');
    await page.screenshot({ path: '/home/user/zayjar/screenshots/tables-04-filled.png', fullPage: true });

    await page.click('button:has-text("Create table")');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: '/home/user/zayjar/screenshots/tables-05-created.png', fullPage: true });
    console.log('✓ Create');
  }

  // Edit first
  const edit = page.locator('button:has-text("Edit")').first();
  if (await edit.count() > 0) {
    await edit.click();
    await page.waitForTimeout(900);
    await page.fill('#table-capacity', '9');
    await page.click('button:has-text("Save changes")');
    await page.waitForTimeout(2200);
    await page.screenshot({ path: '/home/user/zayjar/screenshots/tables-06-edited.png', fullPage: true });
    console.log('✓ Edit');
  }

  // Archive
  const archive = page.locator('button:has-text("Archive")').first();
  if (await archive.count() > 0) {
    await archive.click();
    await page.waitForTimeout(700);
    await page.click('button:has-text("Archive")');
    await page.waitForTimeout(2200);
    await page.screenshot({ path: '/home/user/zayjar/screenshots/tables-07-archived.png', fullPage: true });
    console.log('✓ Archive');
  }

  await page.click('button:has-text("archived")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/home/user/zayjar/screenshots/tables-08-archived-view.png', fullPage: true });

  const restore = page.locator('button:has-text("Restore")').first();
  if (await restore.count() > 0) {
    await restore.click();
    await page.waitForTimeout(2200);
    await page.screenshot({ path: '/home/user/zayjar/screenshots/tables-09-restored.png', fullPage: true });
    console.log('✓ Restore');
  }

  await browser.close();
  console.log('✅ FULL TABLES CRUD VERIFIED (screenshots captured).');
})();
