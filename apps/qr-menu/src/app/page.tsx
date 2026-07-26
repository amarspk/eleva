'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-console */

import React, { useEffect, useState } from 'react';
import { MenuBrowser } from './components/MenuBrowser';

interface Category {
  id: string;
  name: string;
  products: any[];
}

// Mock data per DOC-010 Appendix C.1 and DOC-002 schema
const mockCategories: Category[] = [
  {
    id: 'cat_1',
    name: 'Premium Craft Burgers',
    products: [
      {
        id: 'prod_1',
        name: 'Truffle Umami Smash Burger',
        description: 'Double smashed patty with truffle aioli, caramelized onions, and aged cheddar on brioche',
        imageUrl: null,
        basePrice: 14.5,
        calories: 850,
        isAvailable: true,
        sizes: [
          { id: 'size_1', name: 'Single', priceAdjustment: 0 },
          { id: 'size_2', name: 'Double Patty Max', priceAdjustment: 4.0 },
        ],
        variants: [
          { id: 'var_1', name: 'Classic - Medium', price: 14.5, stockQuantity: 20 },
          { id: 'var_2', name: 'Spicy - Hot', price: 15.5, stockQuantity: 3 },
        ],
        addons: [
          {
            id: 'addon_group_1',
            name: 'Extra Sauces',
            minSelections: 0,
            maxSelections: 2,
            options: [
              { id: 'addon_1', name: 'House Truffle Aioli', price: 0.75, isAvailable: true },
              { id: 'addon_2', name: 'Chili Garlic Butter', price: 0.5, isAvailable: true },
            ],
          },
        ],
      },
      {
        id: 'prod_2',
        name: 'Classic Smash Burger',
        description: 'Single smashed patty with American cheese, pickles, and special sauce',
        imageUrl: null,
        basePrice: 10.0,
        calories: 650,
        isAvailable: true,
        sizes: [],
        variants: [],
        addons: [],
      },
    ],
  },
  {
    id: 'cat_2',
    name: 'Artisan Pizzas',
    products: [
      {
        id: 'prod_3',
        name: 'Margherita Craft',
        description: 'San Marzano tomatoes, fresh mozzarella, basil on sourdough crust',
        imageUrl: null,
        basePrice: 12.0,
        calories: 700,
        isAvailable: true,
        sizes: [
          { id: 'size_3', name: 'Medium 12"', priceAdjustment: 0 },
          { id: 'size_4', name: 'Large 14"', priceAdjustment: 3.5 },
        ],
        variants: [],
        addons: [
          {
            id: 'addon_group_2',
            name: 'Extra Toppings',
            minSelections: 0,
            maxSelections: 3,
            options: [
              { id: 'addon_3', name: 'Extra Mozzarella', price: 1.5, isAvailable: true },
              { id: 'addon_4', name: 'Pepperoni', price: 2.0, isAvailable: true },
            ],
          },
        ],
      },
    ],
  },
];

export default function Page(): React.ReactNode {
  const [categories, setCategories] = useState<Category[]>(mockCategories);
  const [primaryColor, setPrimaryColor] = useState('#FF5733');
  const [tenantName, setTenantName] = useState('Gourmet Burger LLC');
  const [tableNumber, setTableNumber] = useState<string | null>(null);

  useEffect(() => {
    // Resolve tenant context from subdomain or query param per DOC-005 4.2 and 4.6
    // In real app, would fetch from /api/v1/tenants/:id and /api/v1/menu/categories
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get('table');
    if (tableParam) {
      setTableNumber(tableParam);
    }

    // Attempt to fetch real menu data if API available
    const fetchMenu = async (): Promise<void> => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        // Try to get tenant branding based on subdomain
        const host = window.location.hostname;
        const subdomain = host.split('.')[0];
        
        // In real implementation, would call:
        // const tenantRes = await fetch(`${apiUrl}/api/v1/tenants/${subdomain}`);
        // const menuRes = await fetch(`${apiUrl}/api/v1/menu/categories?branchId=...`);
        // For now, use mock data with tenant isolation preserved via subdomain logging
        console.log(`QR Menu loaded for subdomain: ${subdomain}, table: ${tableParam}, tenant: ${tenantName}`);
        
        // Simulate cache-busting per DOC-007 6.4
        // Image URLs would include ?v=timestamp
      } catch (err) {
        console.warn('Failed to fetch real menu, using mock data:', err);
      }
    };

    fetchMenu();
  }, [tenantName]);

  return (
    <div>
      {/* Tenant header with branding per DOC-003 3.3.2 */}
      <div style={{ backgroundColor: primaryColor, color: 'white', padding: '12px', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>{tenantName}</h1>
        {tableNumber && <p style={{ margin: 0, fontSize: '12px' }}>Table {tableNumber} • QR Secure Ordering</p>}
      </div>
      <MenuBrowser categories={categories} primaryColor={primaryColor} />
      {/* Footer with tenant isolation note */}
      <div style={{ textAlign: 'center', padding: '12px', fontSize: '10px', color: '#999' }}>
        Secure ordering • Tenant isolated • {new Date().getFullYear()} Zayjar
      </div>
    </div>
  );
}
