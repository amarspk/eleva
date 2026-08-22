import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReceiptDesigner } from './ReceiptDesigner';
import { DEFAULT_RECEIPT_CONFIG } from '@zayjar/receipts';

/* Mock the shared receipts package so the preview renderer is deterministic. */
jest.mock('@zayjar/receipts', () => {
  const actual = jest.requireActual('@zayjar/receipts');
  return {
    ...actual,
    CustomerReceipt: ({ data }: { data: { config: { language: string; footerMessage: string } } }) => (
      <div data-testid="receipt-preview" data-lang={data.config.language}>
        {data.config.footerMessage}
      </div>
    ),
  };
});

const mockGetDesign = jest.fn();
const mockSaveDraft = jest.fn();
const mockPublish = jest.fn();
const mockApiGet = jest.fn();

jest.mock('../lib/resources', () => ({
  designsApi: {
    get: (...args: unknown[]) => mockGetDesign(...args),
    saveDraft: (...args: unknown[]) => mockSaveDraft(...args),
    publish: (...args: unknown[]) => mockPublish(...args),
  },
}));

jest.mock('../lib/api-client', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
}));

const designDraft = { colors: { primary: '#111' } };

describe('ReceiptDesigner (Phase 4 P3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDesign.mockResolvedValue({ draft: designDraft, published: {}, version: 1 });
    mockSaveDraft.mockResolvedValue({ version: 2 });
    mockPublish.mockResolvedValue({ version: 2 });
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/api/v1/orders') {
        return [{ id: 'order-1', orderNumber: 'ORD-2026-1', createdAt: '2026-08-18T10:00:00.000Z' }];
      }
      if (path === '/api/v1/orders/order-1/receipt') {
        return {
          config: DEFAULT_RECEIPT_CONFIG,
          tenant: { name: 'Albaik Demo', currency: 'SAR' },
          branch: { name: 'Riyadh' },
          order: {
            id: 'order-1', orderNumber: 'ORD-2026-1', type: 'DINE_IN', status: 'COMPLETED',
            subtotal: 10, taxAmount: 1, discountAmount: 0, total: 11, createdAt: '2026-08-18T10:00:00.000Z', items: [],
          },
        };
      }
      throw new Error(`unexpected ${path}`);
    });
  });

  it('loads the existing receipt config from the design draft', async () => {
    mockGetDesign.mockResolvedValueOnce({
      draft: { ...designDraft, receipt: { language: 'ar', showLogo: false, footerMessage: 'شكراً' } },
      published: {}, version: 1,
    });
    render(<ReceiptDesigner tenantId="tenant-1" />);
    await waitFor(() => {
      expect(screen.getByText('العربية')).toHaveClass('bg-black');
    });
  });

  it('auto-saves the draft when a field toggle changes', async () => {
    render(<ReceiptDesigner tenantId="tenant-1" />);
    await waitFor(() => expect(mockGetDesign).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText('Show logo'));

    await waitFor(() => {
      expect(mockSaveDraft).toHaveBeenCalled();
      const [, draft] = mockSaveDraft.mock.calls[0] as [string, Record<string, unknown>];
      expect((draft.receipt as { showLogo: boolean }).showLogo).toBe(false);
    });
  });

  it('publishes the receipt settings', async () => {
    render(<ReceiptDesigner tenantId="tenant-1" />);
    await waitFor(() => expect(mockGetDesign).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Publish receipt settings'));

    await waitFor(() => {
      expect(mockPublish).toHaveBeenCalledWith('tenant-1');
    });
  });

  it('shows a live preview using the tenant real order (no mock orders)', async () => {
    render(<ReceiptDesigner tenantId="tenant-1" />);
    await waitFor(() => {
      expect(screen.getByText(/ORD-2026-1/)).toBeInTheDocument();
      expect(screen.getByTestId('receipt-preview')).toBeInTheDocument();
    });
  });

  it('shows an empty-state note when the tenant has no orders', async () => {
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/api/v1/orders') {return [];}
      throw new Error('unexpected');
    });
    render(<ReceiptDesigner tenantId="tenant-1" />);
    await waitFor(() => {
      expect(screen.getByText(/No orders yet/)).toBeInTheDocument();
    });
  });

  it('applies the language toggle to the live preview', async () => {
    render(<ReceiptDesigner tenantId="tenant-1" />);
    await waitFor(() => expect(mockGetDesign).toHaveBeenCalled());

    fireEvent.click(screen.getByText('العربية'));
    await waitFor(() => {
      expect(screen.getByTestId('receipt-preview')).toHaveAttribute('data-lang', 'ar');
    });
  });
});