'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductsModule } from './modules/ProductsModule';
import { CategoriesModule } from './modules/CategoriesModule';
import { BranchesModule } from './modules/BranchesModule';
import { TablesModule } from './modules/TablesModule';
import { CustomersModule } from './modules/CustomersModule';
import { StaffModule } from './modules/StaffModule';
import { DesignBuilder } from './DesignBuilder';
import { MediaLibrary } from './MediaLibrary';
import { OrdersManager } from './OrdersManager';
import { ReceiptDesigner } from './ReceiptDesigner';
import { LoyaltySettings } from './LoyaltySettings';
import { WelcomeOfferSettings } from './WelcomeOfferSettings';
import { WalletManager } from './WalletManager';
import { DashboardMetrics } from './DashboardMetrics';
import { clearSession, loadSession } from '../lib/auth';

/**
 * Backoffice application shell (AUDIT-014).
 *
 * Six self-contained CRUD modules wired to the real API. Tenant context
 * comes from the verified session and every request carries it via the
 * shared API client.
 */

type TabId = 'dashboard'|'products'|'categories'|'branches'|'tables'|'customers'|'users'|'orders'|'design'|'receipts'|'media'|'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'products', label: 'Products' },
  { id: 'categories', label: 'Categories' },
  { id: 'branches', label: 'Branches' },
  { id: 'tables', label: 'Tables' },
  { id: 'orders', label: 'Orders' },
  { id: 'customers', label: 'Customers' },
  { id: 'users', label: 'Staff' },
  { id: 'design', label: 'Design / Website' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'media', label: 'Media Library' },
  { id: 'settings', label: 'Settings' },
];

function ShellContent(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('products');
  const session = loadSession();
  const email = session?.user?.email ?? '';
  const roles: string[] = Array.isArray(session?.user?.roles) ? (session.user.roles as string[]) : [];

  const signOut = (): void => {
    clearSession();
    window.location.href = '/login';
  };

  const tenantId = session?.user?.tenantId || session?.tenantId || 'demo-tenant';

  /**
   * Office label derived from the REAL authenticated role set. The numbered
   * floor ↔ role mapping is an internal detail and is never exposed — the
   * label is descriptive only and always server-derived.
   */
  const officeLabel = ((): string => {
    if (roles.includes('PLATFORM_OWNER')) return 'Executive Office';
    if (roles.includes('RESTAURANT_OWNER')) return 'Restaurant Owner Office';
    if (roles.includes('BRANCH_MANAGER')) return 'Management Office';
    if (roles.includes('KITCHEN_STAFF')) return 'Kitchen Office';
    if (roles.includes('CASHIER')) return 'Cashier Terminal';
    return 'Restaurant Office';
  })();

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Office header — premium architectural band */}
      <header className="bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center font-black text-sm shadow-lg">
              E
            </div>
            <div>
              <div className="font-black tracking-tight leading-none">ELEVA</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">{officeLabel}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden sm:block">{email}</span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/5 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
        {/* Accent line */}
        <div className="h-0.5 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500" />
      </header>

      <nav className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b bg-white/95 backdrop-blur px-4" aria-label="Sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold ${
              activeTab === tab.id
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="p-4 sm:p-6">
        {activeTab === 'dashboard' ? <><DashboardMetrics tenantId={tenantId}/><OrdersManager tenantId={tenantId}/></> : null}
        {activeTab === 'products' ? <ProductsModule /> : null}
        {activeTab === 'categories' ? <CategoriesModule /> : null}
        {activeTab === 'branches' ? <BranchesModule /> : null}
        {activeTab === 'tables' ? <TablesModule /> : null}
        {activeTab === 'orders' ? <OrdersManager tenantId={tenantId}/> : null}
        {activeTab === 'customers' ? <CustomersModule /> : null}
        {activeTab === 'users' ? <StaffModule /> : null}
        {activeTab === 'design' ? <DesignBuilder tenantId={tenantId}/> : null}
        {activeTab === 'receipts' ? <ReceiptDesigner tenantId={tenantId}/> : null}
        {activeTab === 'media' ? <MediaLibrary tenantId={tenantId}/> : null}
        {activeTab === 'settings' ? <><div className="bg-white rounded-xl border p-6"><h3 className="font-bold">Settings</h3><p className="text-sm text-gray-600 mt-2">Tenant: {tenantId}</p><p className="text-xs text-gray-500">Subscription, branches, language (AR/EN) and platform branding managed via Eleva design builder. RTL/LTR verified.</p></div><div className="mt-4"><LoyaltySettings tenantId={tenantId} /></div>
        <div className="mt-4"><WelcomeOfferSettings tenantId={tenantId} /></div>
        <div className="mt-4"><WalletManager tenantId={tenantId} /></div></> : null}
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
