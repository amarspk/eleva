'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CustomerReceipt, KitchenTicket, PRINT_STYLES } from '@zayjar/receipts';
import type { ReceiptData } from '@zayjar/receipts';
import { resolveApiBase } from '../../lib/auth';

type PrintKind = 'customer' | 'kitchen';

/**
 * ELEVA Tower — Receipt print window (Phase 4 P3).
 *
 * Opened by the Cashier terminal ("Print Receipt" / "Print Kitchen Ticket").
 * Fetches the server-assembled receipt data (`GET /api/v1/orders/:id/receipt`)
 * — real order data, never mocks — renders the printer-friendly receipt or
 * kitchen ticket, then triggers `window.print()`.
 */
export default function ReceiptPrintPage(): React.ReactNode {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = typeof params?.id === 'string' ? params.id : '';
  const kind: PrintKind = searchParams?.get('kind') === 'kitchen' ? 'kitchen' : 'customer';

  const [data, setData] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    document.title = `${kind === 'kitchen' ? 'Kitchen Ticket' : 'Receipt'} — ${orderId}`;
  }, [kind, orderId]);

  useEffect(() => {
    (async (): Promise<void> => {
      try {
        const token = window.localStorage.getItem('accessToken') || '';
        const tenantId = window.localStorage.getItem('tenantId') || '';
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Tenant-ID': tenantId,
        };
        const res = await fetch(`${resolveApiBase()}/api/v1/orders/${orderId}/receipt`, { headers });
        if (!res.ok) {
          setError(`Unable to load receipt (HTTP ${res.status}).`);
          return;
        }
        const payload = (await res.json()) as ReceiptData;
        setData(payload);
      } catch {
        setError('Unable to load receipt. Please check your connection and try again.');
      }
    })();
  }, [orderId]);

  /* Auto-print once data is ready (deduped). */
  useEffect(() => {
    if (data && !printed) {
      const t = window.setTimeout((): void => {
        window.print();
        setPrinted(true);
      }, 300);
      return (): void => {
        window.clearTimeout(t);
      };
    }
    return undefined;
  }, [data, printed]);

  return (
    <main style={{ background: '#f3f4f6', minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      <div className="no-print" style={{ fontFamily: 'system-ui, sans-serif', padding: 8, fontSize: 13 }}>
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
        {!data && !error && <p>Loading {kind === 'kitchen' ? 'kitchen ticket' : 'receipt'}…</p>}
        {data && (
          <p style={{ color: '#374151' }}>
            {kind === 'kitchen' ? 'Kitchen ticket' : 'Receipt'} loaded — printing. Close this tab when done.
          </p>
        )}
      </div>
      {data && kind === 'customer' && <CustomerReceipt data={data} />}
      {data && kind === 'kitchen' && <KitchenTicket data={data} />}
    </main>
  );
}
