'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductsModule } from './modules/ProductsModule';
import { CategoriesModule } from './modules/CategoriesModule';
import { RestaurantsModule } from './modules/RestaurantsModule';
import { DiscountManager } from './modules/DiscountManager';
import { InvoiceManager } from './modules/InvoiceManager';
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
import { ComplaintManager } from './ComplaintManager';
import { RatingsManager } from './RatingsManager';
import { DashboardMetrics } from './DashboardMetrics';
import { ExecutiveOffice } from './ExecutiveOffice';
import { clearSession, loadSession } from '../lib/auth';
import {
  NAV_LABELS,
  type NavTabId,
  visibleNavGroups,
} from '../lib/nav-permissions';

/**
 * Backoffice application shell (AUDIT-014 + staff-role menu visibility).
 *
 * Tab visibility is derived from the session permission strings returned by
 * login /auth/me. Hidden tabs are not rendered. This is NOT authorization —
 * every module still hits JWT + RbacPermissionGuard + tenant isolation.
 */

const LOCALE_KEY = 'eleva.backoffice.locale';

function readLocale(): 'en' | 'ar' {
  if (typeof window === 'undefined') {
    return 'en';
  }
  return window.localStorage.getItem(LOCALE_KEY) === 'ar' ? 'ar' : 'en';
}

function ShellContent(): React.ReactElement {
  const session = loadSession();
  const email = session?.user?.email ?? '';
  const roleList = session?.user?.roles;
  const permissionList = session?.user?.permissions;
  const roles = useMemo(
    () => (Array.isArray(roleList) ? roleList : []),
    [roleList],
  );
  const permissions = useMemo(
    () => (Array.isArray(permissionList) ? permissionList : []),
    [permissionList],
  );

  const groups = useMemo(() => visibleNavGroups(permissions, roles), [permissions, roles]);
  const visibleIds = useMemo(
    () => groups.flatMap((group) => group.tabs.map((tab) => tab.id)),
    [groups],
  );

  const [activeTab, setActiveTab] = useState<NavTabId>(visibleIds[0] ?? 'dashboard');
  const [locale, setLocale] = useState<'en' | 'ar'>(readLocale);

  useEffect(() => {
    if (visibleIds.length === 0) {
      return;
    }
    if (!visibleIds.includes(activeTab)) {
      setActiveTab(visibleIds[0]);
    }
  }, [visibleIds, activeTab]);

  const signOut = (): void => {
    clearSession();
    window.location.href = '/login';
  };

  const tenantId = session?.user?.tenantId || session?.tenantId || 'demo-tenant';
  const isRtl = locale === 'ar';
  const labels = NAV_LABELS[locale];

  const officeLabel = ((): string => {
    if (roles.includes('PLATFORM_OWNER')) {
      return isRtl ? 'المكتب التنفيذي' : 'Executive Office';
    }
    if (roles.includes('RESTAURANT_OWNER')) {
      return isRtl ? 'مكتب مالك المطعم' : 'Restaurant Owner Office';
    }
    if (roles.includes('BRANCH_MANAGER') || roles.includes('MANAGER')) {
      return isRtl ? 'مكتب الإدارة' : 'Management Office';
    }
    if (roles.includes('KITCHEN_STAFF')) {
      return isRtl ? 'مكتب المطبخ' : 'Kitchen Office';
    }
    if (roles.includes('CASHIER')) {
      return isRtl ? 'نقطة الكاشير' : 'Cashier Terminal';
    }
    return isRtl ? 'مكتب المطعم' : 'Restaurant Office';
  })();

  const toggleLocale = (): void => {
    const next = locale === 'en' ? 'ar' : 'en';
    setLocale(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_KEY, next);
    }
  };

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className={`min-h-screen bg-slate-100 ${isRtl ? 'font-arabic' : ''}`}>
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
            <button
              type="button"
              onClick={toggleLocale}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/5"
            >
              {isRtl ? 'English' : 'العربية'}
            </button>
            <span className="text-xs text-slate-400 hidden sm:block">{email}</span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/5 hover:text-white transition-colors"
            >
              {isRtl ? 'خروج' : 'Sign out'}
            </button>
          </div>
        </div>
        <div className="h-0.5 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500" />
      </header>

      <nav className="sticky top-0 z-10 overflow-x-auto border-b bg-white/95 backdrop-blur px-4" aria-label={isRtl ? 'الأقسام' : 'Sections'}>
        {groups.length === 0 ? (
          <p className="py-3 text-sm text-gray-500">{isRtl ? 'لا توجد وحدات متاحة.' : 'No modules available.'}</p>
        ) : (
          <div className="flex gap-6">
            {groups.map((group) => (
              <div key={group.id} data-nav-group={group.id} className="flex flex-col py-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-3">
                  {labels.groups[group.id]}
                </span>
                <div className="flex">
                  {group.tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      aria-current={activeTab === tab.id ? 'page' : undefined}
                      className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
                        activeTab === tab.id
                          ? 'border-orange-500 text-orange-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {labels.tabs[tab.id]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </nav>

      <main className="p-4 sm:p-6">
        {activeTab === 'agent' && visibleIds.includes('agent') ? <ExecutiveOffice /> : null}
        {activeTab === 'dashboard' && visibleIds.includes('dashboard') ? (
          <>
            <DashboardMetrics tenantId={tenantId} />
            <OrdersManager tenantId={tenantId} />
          </>
        ) : null}
        {activeTab === 'products' && visibleIds.includes('products') ? <ProductsModule /> : null}
        {activeTab === 'categories' && visibleIds.includes('categories') ? <CategoriesModule /> : null}
        {activeTab === 'restaurants' && visibleIds.includes('restaurants') ? <RestaurantsModule /> : null}
        {activeTab === 'branches' && visibleIds.includes('branches') ? <BranchesModule /> : null}
        {activeTab === 'tables' && visibleIds.includes('tables') ? <TablesModule /> : null}
        {activeTab === 'orders' && visibleIds.includes('orders') ? <OrdersManager tenantId={tenantId} /> : null}
        {activeTab === 'customers' && visibleIds.includes('customers') ? <CustomersModule /> : null}
        {activeTab === 'users' && visibleIds.includes('users') ? <StaffModule /> : null}
        {activeTab === 'complaints' && visibleIds.includes('complaints') ? <ComplaintManager tenantId={tenantId} /> : null}
        {activeTab === 'ratings' && visibleIds.includes('ratings') ? <RatingsManager tenantId={tenantId} /> : null}
        {activeTab === 'discounts' && visibleIds.includes('discounts') ? <DiscountManager /> : null}
        {activeTab === 'invoices' && visibleIds.includes('invoices') ? <InvoiceManager /> : null}
        {activeTab === 'design' && visibleIds.includes('design') ? <DesignBuilder tenantId={tenantId} /> : null}
        {activeTab === 'receipts' && visibleIds.includes('receipts') ? <ReceiptDesigner tenantId={tenantId} /> : null}
        {activeTab === 'media' && visibleIds.includes('media') ? <MediaLibrary tenantId={tenantId} /> : null}
        {activeTab === 'settings' && visibleIds.includes('settings') ? (
          <>
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-bold">{labels.tabs.settings}</h3>
              <p className="text-sm text-gray-600 mt-2">Tenant: {tenantId}</p>
            </div>
            <div className="mt-4">
              <LoyaltySettings tenantId={tenantId} />
            </div>
            <div className="mt-4">
              <WelcomeOfferSettings tenantId={tenantId} />
            </div>
            <div className="mt-4">
              <WalletManager tenantId={tenantId} />
            </div>
          </>
        ) : null}
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
