import { test, expect } from '@playwright/test';
import { CATEGORIES_A } from './fixtures/mock-data';
import { createOrderStore, mockAllCheckoutFlows } from './fixtures/api-mocks';

const QR_MENU_URL = 'http://localhost:3000';

test.describe('Customer QR Menu Checkout Journey (TSK-5.5)', () => {
  test('should display restaurant branding and category tabs', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);

    await page.goto(QR_MENU_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText('Gourmet Burger LLC');
    await expect(page.locator('button:has-text("All")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Premium Craft Burgers")')).toBeVisible();
    await expect(page.locator('button:has-text("Artisan Pizzas")')).toBeVisible();
  });

  test('should display table number when query param is provided', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);

    await page.goto(`${QR_MENU_URL}/?table=7`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Table 7')).toBeVisible();
    await expect(page.locator('text=QR Secure Ordering')).toBeVisible();
  });

  test('should browse products by category', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);

    await page.goto(QR_MENU_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Truffle Umami Smash Burger')).toBeVisible();
    await expect(page.locator('text=Classic Smash Burger')).toBeVisible();
    await expect(page.locator('text=Margherita Craft')).toBeVisible();

    const pizzaTab = page.locator('button:has-text("Artisan Pizzas")');
    await pizzaTab.click();

    await expect(page.locator('text=Margherita Craft')).toBeVisible();
    await expect(page.locator('text=Truffle Umami Smash Burger')).not.toBeVisible();
  });

  test('should search menu items', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);

    await page.goto(QR_MENU_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Truffle Umami Smash Burger')).toBeVisible();
    await expect(page.locator('text=Classic Smash Burger')).toBeVisible();

    const searchInput = page.locator('input[placeholder="Search menu items..."]');
    await searchInput.fill('Margherita');

    await expect(page.locator('text=Margherita Craft')).toBeVisible();
    await expect(page.locator('text=Truffle Umami Smash Burger')).not.toBeVisible();
  });

  test('should open product detail drawer and show sizes and addons', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);

    await page.goto(QR_MENU_URL);
    await page.waitForLoadState('networkidle');

    await page.locator('text=Truffle Umami Smash Burger').first().click();

    await expect(page.locator('h3').last()).toContainText('Truffle Umami Smash Burger');
    await expect(page.locator('text=Select Size')).toBeVisible();
    await expect(page.locator('button:has-text("Single (+$0.00)")')).toBeVisible();
    await expect(page.locator('button:has-text("Double Patty Max (+$4.00)")')).toBeVisible();
    await expect(page.locator('text=Extra Sauces')).toBeVisible();
    await expect(page.locator('button:has-text("House Truffle Aioli")')).toBeVisible();
    await expect(page.locator('button:has-text("Chili Garlic Butter")')).toBeVisible();
  });

  test('should select size and addons, calculate correct total', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);

    await page.goto(QR_MENU_URL);
    await page.waitForLoadState('networkidle');

    await page.locator('text=Truffle Umami Smash Burger').first().click();

    await page.locator('button:has-text("Double Patty Max")').click();
    await page.locator('button:has-text("House Truffle Aioli")').click();

    const expectedPrice = (14.5 + 4.0 + 0.75).toFixed(2);
    await expect(page.locator(`button:has-text("Add to Cart ($${expectedPrice})")`)).toBeVisible();
  });

  test('should show Add to Cart button with correct price after configuration', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);

    await page.goto(QR_MENU_URL);
    await page.waitForLoadState('networkidle');

    await page.locator('text=Truffle Umami Smash Burger').first().click();
    await page.locator('button:has-text("Double Patty Max")').click();

    const expectedPrice = (14.5 + 4.0).toFixed(2);
    await expect(page.locator(`button:has-text("Add to Cart ($${expectedPrice})")`)).toBeVisible();
  });

  test('should complete full QR checkout flow — open drawer, configure, verify price', async ({
    page,
  }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);

    await page.goto(`${QR_MENU_URL}/?table=qr_token_07`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText('Gourmet Burger LLC');

    await page.locator('text=Truffle Umami Smash Burger').first().click();
    await expect(page.locator('h3').last()).toContainText('Truffle Umami Smash Burger');

    await page.locator('button:has-text("Double Patty Max")').click();
    await page.locator('button:has-text("House Truffle Aioli")').click();
    await page.locator('button:has-text("Chili Garlic Butter")').click();

    const expectedPrice = (14.5 + 4.0 + 0.75 + 0.5).toFixed(2);
    await expect(page.locator(`button:has-text("Add to Cart ($${expectedPrice})")`)).toBeVisible();

    expect(page).toHaveURL(/localhost:3000/);
  });

  test('should handle simple product without sizes or addons', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);

    await page.goto(QR_MENU_URL);
    await page.waitForLoadState('networkidle');

    await page.locator('text=Classic Smash Burger').first().click();

    await expect(page.locator('h3').last()).toContainText('Classic Smash Burger');
    await expect(page.locator('text=Select Size')).not.toBeVisible();
    await expect(page.locator('text=Extra Sauces')).not.toBeVisible();

    const price = (10.0).toFixed(2);
    await expect(page.locator(`button:has-text("Add to Cart ($${price})")`)).toBeVisible();
  });

  test('should close product drawer when X button clicked', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);

    await page.goto(QR_MENU_URL);
    await page.waitForLoadState('networkidle');

    await page.locator('text=Truffle Umami Smash Burger').first().click();
    await expect(page.locator('h3').last()).toContainText('Truffle Umami Smash Burger');

    await page.locator('button:has-text("×")').click();

    await expect(page.locator('.fixed.inset-0')).not.toBeVisible({ timeout: 3000 });
  });

  test('should increment and decrement quantity in product drawer', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);

    await page.goto(QR_MENU_URL);
    await page.waitForLoadState('networkidle');

    await page.locator('text=Truffle Umami Smash Burger').first().click();

    const quantityContainer = page.locator('div.border.rounded-full');
    const minusBtn = quantityContainer.locator('button').filter({ hasText: /^-$/ });
    const plusBtn = quantityContainer.locator('button').filter({ hasText: /^\+$/ });

    await plusBtn.click();
    const doublePrice = (14.5 * 2).toFixed(2);
    await expect(page.locator(`button:has-text("Add to Cart ($${doublePrice})")`)).toBeVisible();

    await minusBtn.click();
    const singlePrice = (14.5).toFixed(2);
    await expect(page.locator(`button:has-text("Add to Cart ($${singlePrice})")`)).toBeVisible();
  });

  test('should show product variants with low stock warning', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);

    await page.goto(QR_MENU_URL);
    await page.waitForLoadState('networkidle');

    await page.locator('text=Truffle Umami Smash Burger').first().click();

    await expect(page.locator('text=Select Variant')).toBeVisible();
    await expect(page.locator('button:has-text("Classic - Medium")')).toBeVisible();
    await expect(page.locator('text=Only 3 left!')).toBeVisible();
    await expect(page.locator('button:has-text("Spicy - Hot")')).toBeVisible();
  });

  test('should show Margherita with pizza sizes and addons', async ({ page }) => {
    const store = createOrderStore();
    mockAllCheckoutFlows(page, store);

    await page.goto(QR_MENU_URL);
    await page.waitForLoadState('networkidle');

    await page.locator('text=Margherita Craft').first().click();

    await expect(page.locator('h3').last()).toContainText('Margherita Craft');
    await expect(page.locator('button:has-text("Medium 12\\"")')).toBeVisible();
    await expect(page.locator('button:has-text("Large 14\\"")')).toBeVisible();
    await expect(page.locator('text=Extra Toppings')).toBeVisible();
    await expect(page.locator('button:has-text("Extra Mozzarella")')).toBeVisible();
    await expect(page.locator('button:has-text("Pepperoni")')).toBeVisible();
  });
});
