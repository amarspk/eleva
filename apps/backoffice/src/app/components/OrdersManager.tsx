'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../lib/api-client';
import { OrderSummary, ordersApi, unwrapOrders } from '../lib/resources';

export function OrdersManager({
  tenantId,
  branchId,
}: {
  tenantId: string;
  branchId?: string;
}): React.ReactElement {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [filter, setFilter] = useState<'all' | 'preorder'>('all');
  const [error, setError] = useState('');
  const prevCount = useRef(0);
  const [hasNew, setHasNew] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!tenantId) {
      setError('Tenant context is required to load orders.');
      return;
    }
    try {
      const list = unwrapOrders(await ordersApi.list(branchId));
      if (list.length > prevCount.current) {
        setHasNew(true);
      }
      prevCount.current = list.length;
      setOrders(list);
      setError('');
    } catch (loadError) {
      setError(apiErrorMessage(loadError, 'Unable to load orders.'));
    }
  }, [branchId, tenantId]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 8000);
    return (): void => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!hasNew) {
      return;
    }

    try {
      const AudioContextConstructor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextConstructor) {
        const context = new AudioContextConstructor();
        const oscillator = context.createOscillator();
        oscillator.frequency.value = 880;
        oscillator.connect(context.destination);
        oscillator.start();
        window.setTimeout(() => {
          oscillator.stop();
          void context.close();
        }, 200);
      }
    } catch {
      // Sound is an enhancement; the visible new-order badge remains authoritative.
    }

    const id = window.setTimeout(() => setHasNew(false), 4000);
    return (): void => window.clearTimeout(id);
  }, [hasNew]);

  const filtered = filter === 'preorder' ? orders.filter((order) => order.isPreorder) : orders;

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold">
          Orders{' '}
          {hasNew ? (
            <span className="ml-2 animate-pulse rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
              New order!
            </span>
          ) : null}
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded px-2 py-1 text-xs ${filter === 'all' ? 'bg-black text-white' : 'border'}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter('preorder')}
            className={`rounded px-2 py-1 text-xs ${filter === 'preorder' ? 'bg-black text-white' : 'border'}`}
          >
            Pre-orders
          </button>
          <button type="button" onClick={() => void load()} className="rounded border px-2 py-1 text-xs">
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <div className="max-h-[60vh] space-y-2 overflow-auto">
        {filtered.map((order) => {
          const items = order.orderItems ?? order.items ?? [];
          return (
            <div
              key={order.id}
              className={`rounded-lg border p-3 ${order.isPreorder ? 'border-amber-400 bg-amber-50' : ''}`}
            >
              <div className="flex justify-between">
                <span className="text-sm font-semibold">
                  {order.orderNumber}{' '}
                  {order.isPreorder ? (
                    <span className="rounded bg-amber-500 px-1 text-[10px] text-white">
                      PRE-ORDER{' '}
                      {order.scheduledAt ? new Date(order.scheduledAt).toLocaleString() : ''}
                    </span>
                  ) : null}
                </span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{order.status}</span>
              </div>
              <div className="mt-1 text-xs text-gray-600">
                Branch: {order.branchId?.slice(0, 8)} • {order.paymentMethod} • {order.total} •{' '}
                {new Date(order.createdAt).toLocaleString()}
              </div>
              <div className="mt-1 text-xs">
                Items:{' '}
                {items
                  .map((item) => `${item.quantity}x ${item.productId?.slice(0, 6) ?? ''}`)
                  .join(', ') || '—'}
              </div>
              {order.specialNotes ? <div className="mt-1 text-xs italic">Note: {order.specialNotes}</div> : null}
            </div>
          );
        })}
        {filtered.length === 0 ? <p className="text-xs text-gray-500">No orders yet.</p> : null}
      </div>
    </div>
  );
}
