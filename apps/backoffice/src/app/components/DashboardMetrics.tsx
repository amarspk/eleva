'use client';

import React, { useEffect, useState } from 'react';
import { apiErrorMessage } from '../lib/api-client';
import { branchesApi, ordersApi, productsApi, unwrapOrders } from '../lib/resources';

interface DashboardStats {
  orders: number;
  revenue: number;
  products: number;
  branches: number;
}

const EMPTY_STATS: DashboardStats = { orders: 0, revenue: 0, products: 0, branches: 0 };

export function DashboardMetrics({ tenantId }: { tenantId: string }): React.ReactElement {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      try {
        const [ordersPayload, products, branches] = await Promise.all([
          ordersApi.list(),
          productsApi.list(),
          branchesApi.list(),
        ]);
        const orders = unwrapOrders(ordersPayload);
        const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
        if (active) {
          setStats({
            orders: orders.length,
            revenue,
            products: products.length,
            branches: branches.length,
          });
          setError('');
        }
      } catch (loadError) {
        if (active) {
          setError(apiErrorMessage(loadError, 'Unable to load dashboard metrics.'));
        }
      }
    };

    void load();
    return (): void => {
      active = false;
    };
  }, [tenantId]);

  const cards = [
    { key: 'Orders', value: stats.orders },
    { key: 'Revenue', value: stats.revenue.toFixed(2) },
    { key: 'Products', value: stats.products },
    { key: 'Branches', value: stats.branches },
  ];

  return (
    <section aria-label="Dashboard metrics" className="mb-4">
      {error ? (
        <div role="alert" className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <div key={card.key} className="rounded-xl border bg-white p-4">
            <div className="text-xs text-gray-500">{card.key}</div>
            <div className="text-xl font-bold">{card.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
