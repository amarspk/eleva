'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductsModule } from './modules/ProductsModule';
import { CategoriesModule } from './modules/CategoriesModule';
import { clearSession, loadSession } from '../lib/auth';

/**
 * Backoffice application shell (AUDIT-014).
 *
 * Replaces the read-only `AdminPanel`, which rendered four static lists and
 * contained zero mutations. Each tab is a self-contained CRUD module wired to
 * the real API.
 *
 * The tenant no longer comes from the hardcoded `'tenant-uuid-1111'` literal —
 * it is read from the verified session, and every request carries it via the
 * shared API client.
 */

type TabId = 'products' | 'categories' | 'branches' | 'tables' | 'customers' | 'users';

const TABS: { id: TabId; label: string }[] = [
  { id: 'products', label: 'Products' },
  { id: 'categories', label: 'Categories' },
  { id: 'branches', label: 'Branches' },
  { id: 'tables', label: 'Tables' },
  { id: 'customers', label: 'Customers' },
  { id: 'users', label: 'Staff' },
];

function Placeholder({ label }: { label: string }): React.ReactElement {
  return (
    <div className="rounded border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
      {label} module is being wired next.
    </div>
  );
}

function ShellContent(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('products');
  const session = loadSession();
  const email = session?.user?.email ?? '';

  const signOut = (): void => {
    clearSession();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between bg-white px-6 py-3 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">Zayjar Backoffice</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{email}</span>
          <button
            type="button"
            onClick={signOut}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b bg-white px-4" aria-label="Sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="p-6">
        {activeTab === 'products' ? <ProductsModule /> : null}
        {activeTab === 'categories' ? <CategoriesModule /> : null}
        {activeTab === 'branches' ? <Placeholder label="Branches" /> : null}
        {activeTab === 'tables' ? <Placeholder label="Tables" /> : null}
        {activeTab === 'customers' ? <Placeholder label="Customers" /> : null}
        {activeTab === 'users' ? <Placeholder label="Staff" /> : null}
      </main>
    </div>
  );
}

export function BackofficeShell(): React.ReactElement {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
            // A 401 means the 15-minute access token expired; retrying cannot
            // help and just delays the redirect to /login.
            retry: (failureCount: number, error: unknown): boolean => {
              const status = (error as { status?: number })?.status;
              if (status === 401 || status === 403 || status === 404) {
                return false;
              }
              return failureCount < 1;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ShellContent />
    </QueryClientProvider>
  );
}
