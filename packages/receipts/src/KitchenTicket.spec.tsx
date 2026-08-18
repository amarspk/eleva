import React from 'react';
import { render, screen } from '@testing-library/react';
import { KitchenTicket } from './KitchenTicket';
import type { ReceiptData } from './receipt-types';

const data: ReceiptData = {
  config: {
    language: 'en',
    showLogo: true,
    showBranchInfo: true,
    showOrderNumber: true,
    showDateTime: true,
    showDiscounts: true,
    showPayment: true,
    showNotes: true,
    footerMessage: 'Thank you!',
  },
  tenant: { name: 'Albaik Demo', currency: 'SAR' },
  branch: { name: 'Riyadh - Olaya' },
  order: {
    id: 'o1',
    orderNumber: 'ORD-2026-12345',
    type: 'DINE_IN',
    status: 'COMPLETED',
    paymentMethod: 'CASH',
    subtotal: 24,
    taxAmount: 2.4,
    discountAmount: 2.4,
    total: 24,
    specialNotes: 'Extra spicy',
    createdAt: '2026-08-18T14:30:00.000Z',
    items: [
      {
        name: 'Chicken Tikka',
        quantity: 2,
        unitPrice: 12,
        totalPrice: 24,
        size: 'Large',
        addons: ['Cheese', 'Garlic'],
      },
    ],
  },
};

describe('KitchenTicket (P3)', () => {
  it('renders ticket identity, items, sizes and add-ons', () => {
    render(<KitchenTicket data={data} />);
    expect(screen.getByText(/ORD-2026-12345/)).toBeInTheDocument();
    expect(screen.getByText(/Chicken Tikka/)).toBeInTheDocument();
    expect(screen.getByText(/Large/)).toBeInTheDocument();
    expect(screen.getByText(/Cheese \+ Garlic/)).toBeInTheDocument();
  });

  it('renders order notes for the kitchen', () => {
    render(<KitchenTicket data={data} />);
    expect(screen.getByText('Extra spicy')).toBeInTheDocument();
  });

  it('does NOT expose customer-facing receipt information (prices, totals, payment)', () => {
    render(<KitchenTicket data={data} />);
    // No money rendering, no payment method, no totals
    expect(screen.queryByText(/24\.00/)).toBeNull();
    expect(screen.queryByText('Cash')).toBeNull();
    expect(screen.queryByText(/Total/)).toBeNull();
  });

  it('renders RTL for Arabic kitchen tickets', () => {
    const ar = { ...data, config: { ...data.config, language: 'ar' } };
    const { container } = render(<KitchenTicket data={ar} />);
    expect(container.firstChild).toHaveAttribute('dir', 'rtl');
  });
});