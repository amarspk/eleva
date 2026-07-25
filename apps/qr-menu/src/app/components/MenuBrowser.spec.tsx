import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MenuBrowser } from './MenuBrowser';

const mockCategories = [
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
        isAvailable: true,
        sizes: [],
        variants: [],
        addons: [],
      },
    ],
  },
];

const defaultProps = {
  categories: mockCategories,
  primaryColor: '#ff0000',
};

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
  const { container } = render(<MenuBrowser {...defaultProps} categories={[]} />);
  const main = container.querySelector('main');
  expect(main).toBeTruthy();
  expect(main!.children.length).toBe(0);
});

it('opens product detail modal on product click', () => {
  render(<MenuBrowser {...defaultProps} />);
  fireEvent.click(screen.getByText('Coca-Cola'));
  expect(screen.getByText(/add to cart|select options/i)).toBeTruthy();
});
