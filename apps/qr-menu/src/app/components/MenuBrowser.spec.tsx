import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MenuBrowser } from './MenuBrowser';
import type { PublicMenuResponse } from '../lib/types';

// Fixture data mirrors the real GET /api/v1/public/menu contract
// (test fixtures are not production mock data).
const sampleMenuResponse: PublicMenuResponse = {
  table: { number: 'T-7' },
  branch: { id: 'branch-1', name: 'Downtown Branch' },
  restaurant: { name: 'Gourmet Burgers', currency: 'USD' },
  tenant: {
    name: 'Gourmet Burger LLC',
    logoUrl: null,
    bannerUrl: null,
    primaryColor: '#ff0000',
    secondaryColor: '#ffffff',
  },
  categories: [
    {
      id: 'cat-1',
      name: 'Drinks',
      products: [
        {
          id: 'prod-1',
          name: 'Coca-Cola',
          description: 'Classic cola drink',
          imageUrl: null,
          basePrice: 2.5,
          calories: 140,
          preparationTime: 5,
          isAvailable: true,
          sizes: [],
          variants: [],
          addons: [],
        },
        {
          id: 'prod-2',
          name: 'Pepsi',
          description: 'Pepsi cola',
          imageUrl: null,
          basePrice: 2.5,
          calories: 150,
          preparationTime: 5,
          isAvailable: true,
          sizes: [],
          variants: [],
          addons: [],
        },
      ],
    },
    {
      id: 'cat-2',
      name: 'Food',
      products: [
        {
          id: 'prod-3',
          name: 'Burger',
          description: 'Classic beef burger',
          imageUrl: null,
          basePrice: 8.99,
          calories: 650,
          preparationTime: 15,
          isAvailable: true,
          sizes: [{ id: 'size-1', name: 'Double Patty', priceAdjustment: 2 }],
          variants: [{ id: 'var-1', name: 'Spicy Edition', price: 12.5, stockQuantity: 8 }],
          addons: [
            {
              id: 'grp-1',
              name: 'Extras',
              minSelections: 0,
              maxSelections: 2,
              options: [{ id: 'addon-1', name: 'Extra Cheese', price: 1.5, isAvailable: true }],
            },
          ],
        },
      ],
    },
  ],
};

const defaultProps = {
  initialData: sampleMenuResponse,
  token: 'qr-test-token',
};

function withFeatured(productIds: string[]): PublicMenuResponse {
  return {
    ...sampleMenuResponse,
    design: {
      sections: [
        {
          id: 'featured',
          type: 'featured',
          enabled: true,
          order: 0,
          config: { variant: 'grid', productIds },
        },
      ],
    },
  };
}

beforeEach(() => {
  (global.fetch as jest.Mock).mockClear();
});

// ==========================================
// Rendering & browsing (pre-existing behaviors preserved)
// ==========================================

it('renders all category headings', () => {
  render(<MenuBrowser {...defaultProps} />);
  expect(screen.getAllByText('Drinks').length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText('Food').length).toBeGreaterThanOrEqual(1);
});

it('renders all products', () => {
  render(<MenuBrowser {...defaultProps} />);
  expect(screen.getByText('Coca-Cola')).toBeTruthy();
  expect(screen.getByText('Pepsi')).toBeTruthy();
  expect(screen.getByText('Burger')).toBeTruthy();
});

it('filters products by search query', () => {
  render(<MenuBrowser {...defaultProps} />);
  const searchInput = screen.getByPlaceholderText(/search/i);
  fireEvent.change(searchInput, { target: { value: 'cola' } });
  expect(screen.getByText('Coca-Cola')).toBeTruthy();
  expect(screen.queryByText('Burger')).toBeNull();
});

it('filters products by category', () => {
  render(<MenuBrowser {...defaultProps} />);
  const foodButtons = screen.getAllByText('Food');
  fireEvent.click(foodButtons[0]);
  expect(screen.queryByText('Coca-Cola')).toBeNull();
  expect(screen.getByText('Burger')).toBeTruthy();
});

it('keeps featured products in configured order while rendering the full catalog', () => {
  render(<MenuBrowser {...defaultProps} initialData={withFeatured(['prod-3', 'prod-1'])} />);

  const featured = screen.getByTestId('featured-section');
  expect(within(featured).getByText('Burger')).toBeTruthy();
  expect(within(featured).getByText('Coca-Cola')).toBeTruthy();
  const featuredText = featured.textContent ?? '';
  expect(featuredText.indexOf('Burger')).toBeLessThan(featuredText.indexOf('Coca-Cola'));
  expect(within(featured).queryByText('Pepsi')).toBeNull();

  // Pepsi is active but not curated; it remains in the ordinary catalog.
  expect(screen.getByText('Pepsi')).toBeTruthy();
});

it('keeps a non-featured product reachable through category navigation', () => {
  render(<MenuBrowser {...defaultProps} initialData={withFeatured(['prod-3'])} />);

  fireEvent.click(screen.getByRole('button', { name: 'Drinks' }));

  expect(screen.getByText('Pepsi')).toBeTruthy();
  expect(screen.getByText('Coca-Cola')).toBeTruthy();
  expect(screen.queryByText('Burger')).toBeNull();
});

it('keeps a non-featured product reachable through search', () => {
  render(<MenuBrowser {...defaultProps} initialData={withFeatured(['prod-3'])} />);

  fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'pepsi' } });

  expect(screen.getByText('Pepsi')).toBeTruthy();
  expect(screen.queryByText('Burger')).toBeNull();
  expect(screen.queryByText('Coca-Cola')).toBeNull();
});

it('skips unknown curated ids without substituting ordinary catalog products', () => {
  render(
    <MenuBrowser
      {...defaultProps}
      initialData={withFeatured(['foreign-tenant-product', 'prod-3', 'unknown-product'])}
    />,
  );

  const featured = screen.getByTestId('featured-section');
  expect(within(featured).getByText('Burger')).toBeTruthy();
  expect(within(featured).queryByText('Coca-Cola')).toBeNull();
  expect(within(featured).queryByText('Pepsi')).toBeNull();
});

it('displays product prices', () => {
  render(<MenuBrowser {...defaultProps} />);
  expect(screen.getAllByText('$2.50').length).toBe(2);
  expect(screen.getByText('$8.99')).toBeTruthy();
});

it('applies custom primary color', () => {
  render(<MenuBrowser {...defaultProps} />);
  const buttons = screen.getAllByRole('button');
  expect(buttons.length).toBeGreaterThan(0);
});

it('renders empty main content when categories are empty', () => {
  const { container } = render(
    <MenuBrowser {...defaultProps} initialData={{ ...sampleMenuResponse, categories: [] }} />,
  );
  const main = container.querySelector('main');
  expect(main).toBeTruthy();
  expect(main!.children.length).toBe(0);
});

it('opens product detail modal on product click', () => {
  render(<MenuBrowser {...defaultProps} />);
  fireEvent.click(screen.getByText('Coca-Cola'));
  expect(screen.getByText(/add to cart|select options/i)).toBeTruthy();
});

// ==========================================
// Real cart (Sprint 1, Step 3)
// ==========================================

it('adds an item to the cart and shows the cart bar with count and subtotal', () => {
  render(<MenuBrowser {...defaultProps} />);
  fireEvent.click(screen.getByText('Coca-Cola'));
  fireEvent.click(screen.getByText(/add to cart/i));

  const cartBar = screen.getByRole('button', { name: /view cart/i });
  expect(cartBar.textContent).toContain('1 item');
  expect(cartBar.textContent).toContain('$2.50');
});

it('applies DOC-005 4.3 pricing: variant absolute override beats base+size', () => {
  render(<MenuBrowser {...defaultProps} />);
  fireEvent.click(screen.getByText('Burger'));

  // Select size first: 8.99 + 2.00 = $10.99
  fireEvent.click(screen.getByText(/Double Patty/i));
  expect(screen.getByText(/add to cart/i).textContent).toContain('$10.99');

  // Variant override (Condition C): absolute $12.50 regardless of size
  fireEvent.click(screen.getByText(/Spicy Edition/i));
  expect(screen.getByText(/add to cart/i).textContent).toContain('$12.50');

  // Addon adds +1.50 on top of the variant price (Condition D)
  fireEvent.click(screen.getByText(/Extra Cheese/i));
  expect(screen.getByText(/add to cart/i).textContent).toContain('$14.00');
});

// ==========================================
// Checkout wiring to POST /api/v1/public/orders/checkout
// ==========================================

it('submits the order to the public checkout endpoint with the QR token and shows the confirmation', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({ id: 'order-1', orderNumber: 'ORD-2026-12345', status: 'PENDING', total: 8.99 }),
  });

  render(<MenuBrowser {...defaultProps} />);

  fireEvent.click(screen.getByText('Burger'));
  fireEvent.click(screen.getByText(/add to cart/i));
  fireEvent.click(screen.getByText(/view cart/i));
  fireEvent.click(screen.getByText(/place order/i));

  // Order submitted from the QR frontend — assert the wire contract
  await screen.findByText(/order received/i);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe('/api/v1/public/orders/checkout');
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body)).toEqual({
    branchId: 'branch-1',
    qrCodeToken: 'qr-test-token',
    type: 'DINE_IN',
    paymentMethod: 'CASH',
    items: [{ productId: 'prod-3', quantity: 1 }],
  });

  // Confirmation renders the server-assigned order number
  expect(screen.getByText('ORD-2026-12345')).toBeTruthy();
  expect(screen.getByText('PENDING')).toBeTruthy();
});

it('surfaces server rejections and keeps the cart intact', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status: 400,
    json: () => Promise.resolve({ message: 'Variant [var-1] for product [prod-3] is out of stock.' }),
  });

  render(<MenuBrowser {...defaultProps} />);

  fireEvent.click(screen.getByText('Burger'));
  fireEvent.click(screen.getByText(/add to cart/i));
  fireEvent.click(screen.getByText(/view cart/i));
  fireEvent.click(screen.getByText(/place order/i));

  await screen.findByText(/out of stock/i);
  // Cart is NOT lost — the guest can adjust and retry
  expect(screen.getByText('Your order')).toBeTruthy();
  expect(screen.getAllByText('Burger').length).toBeGreaterThanOrEqual(1);
});
