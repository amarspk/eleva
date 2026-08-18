import React from 'react';
import { render, screen } from '@testing-library/react';
import { CustomerReceipt } from './CustomerReceipt';
import type { ReceiptData } from './receipt-types';

const baseData: ReceiptData = {
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
  tenant: {
    name: 'Albaik Demo',
    logoUrl: 'https://cdn.example.com/logo.png',
    primaryColor: '#ff5733',
    currency: 'SAR',
  },
  branch: { name: 'Riyadh - Olaya', address: 'Olaya St', phoneNumber: '+966501234567' },
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
    specialNotes: 'No onions please',
    createdAt: '2026-08-18T14:30:00.000Z',
    items: [
      {
        name: 'Chicken Tikka',
        quantity: 2,
        unitPrice: 12,
        totalPrice: 24,
        size: 'Large',
        addons: ['Cheese'],
      },
    ],
  },
};

describe('CustomerReceipt (P3)', () => {
  it('renders restaurant identity, order meta and items', () => {
    render(<CustomerReceipt data={baseData} />);
    expect(screen.getByText('Albaik Demo')).toBeInTheDocument();
    expect(screen.getByText(/ORD-2026-12345/)).toBeInTheDocument();
    expect(screen.getByText(/Chicken Tikka/)).toBeInTheDocument();
    expect(screen.getByText('Riyadh - Olaya')).toBeInTheDocument();
  });

  it('renders item modifiers (size + add-ons)', () => {
    render(<CustomerReceipt data={baseData} />);
    expect(screen.getByText('Large')).toBeInTheDocument();
    expect(screen.getByText('Cheese')).toBeInTheDocument();
  });

  it('renders totals and payment method', () => {
    render(<CustomerReceipt data={baseData} />);
    expect(screen.getAllByText(/24\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Cash')).toBeInTheDocument();
  });

  it('renders the footer message and notes', () => {
    render(<CustomerReceipt data={baseData} />);
    expect(screen.getByText('Thank you!')).toBeInTheDocument();
    expect(screen.getByText('No onions please')).toBeInTheDocument();
  });

  it('honours field visibility toggles', () => {
    const data: ReceiptData = {
      ...baseData,
      config: { ...baseData.config, showLogo: false, showDateTime: false, showNotes: false, showPayment: false },
    };
    render(<CustomerReceipt data={data} />);
    // Logo img absent
    expect(document.querySelector('img')).toBeNull();
    // Notes absent
    expect(screen.queryByText('No onions please')).toBeNull();
    // Payment absent
    expect(screen.queryByText('Cash')).toBeNull();
  });

  it('renders RTL for Arabic receipts', () => {
    const data: ReceiptData = { ...baseData, config: { ...baseData.config, language: 'ar' } };
    const { container } = render(<CustomerReceipt data={data} />);
    expect(container.firstChild).toHaveAttribute('dir', 'rtl');
    expect(screen.getAllByText(/طلب/).length).toBeGreaterThanOrEqual(1);
  });

  it('hides the discount row when there is no discount', () => {
    const data: ReceiptData = {
      ...baseData,
      order: { ...baseData.order, discountAmount: 0 },
    };
    render(<CustomerReceipt data={data} />);
    expect(screen.queryByText('Discount')).toBeNull();
  });
});