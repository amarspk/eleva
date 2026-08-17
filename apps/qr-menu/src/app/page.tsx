import React from 'react';
import { headers } from 'next/headers';
import { MenuBrowser } from './components/MenuBrowser';
import { RestaurantSite } from './components/RestaurantSite';
import { fetchGuestMenu, fetchPublicSite, resolveServerApiBase, GuestOrderError } from './lib/guest-api';
import type { PublicMenuResponse } from './lib/types';

// The menu depends on the request host (tenant subdomain) and the scanned
// table token — it must never be prerendered or cached across guests.
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { t?: string | string[] };
}

/**
 * SSR entry of the public QR Ordering Channel (DOC-001 1.2).
 *
 * Flow:
 *   1. The scanned QR URL carries the cryptographic table token as ?t=.
 *   2. This server component loads the tenant branding, table context and
 *      full branch menu from the Step-1 public API (GET /api/v1/public/menu),
 *      addressed through the incoming request's own Host so tenant tenancy
 *      is preserved end-to-end (DOC-005 4.6).
 *   3. The interactive cart (MenuBrowser) hydrates with that real data and
 *      submits the order straight from the browser to the Step-2 public
 *      checkout endpoint.
 *
 * No mock data exists on this surface: every rendered byte originates in the
 * database through the public API.
 */
export default async function Page({ searchParams }: PageProps): Promise<React.ReactNode> {
  const rawToken = searchParams.t;
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';

  const host = headers().get('host') ?? 'localhost:3000';
  const apiBase = resolveServerApiBase(host);

  // Phase 4 P1 — when no QR table token is present, render the token-free
  // public restaurant website (branding, social links, category-filterable
  // menu) at the tenant subdomain instead of an error. The QR ordering flow
  // below is unchanged when a token IS present.
  if (!token) {
    try {
      const site = await fetchPublicSite(apiBase);
      return <RestaurantSite site={site} />;
    } catch {
      return (
        <QrErrorView
          title="This restaurant is not available"
          message="Please try again shortly, or scan the QR code on your table to view the menu and order."
        />
      );
    }
  }

  let menu: PublicMenuResponse;
  try {
    menu = await fetchGuestMenu(apiBase, token);
  } catch (err) {
    // Uniform guest-facing failure: the API intentionally returns the same
    // 404 for unknown/expired tokens (no existence oracle), and 403 when the
    // tenant's subscription pauses guest ordering (DOC-001 1.10). Either way
    // the guest only learns that ordering is unavailable here.
    const status = err instanceof GuestOrderError ? err.status : 0;
    return (
      <QrErrorView
        title="Online ordering is unavailable"
        message={
          status === 403
            ? 'This restaurant has temporarily paused online ordering. Please order with our staff.'
            : 'This QR code could not be resolved. Please rescan the code on your table or ask our staff for help.'
        }
      />
    );
  }

  const { tenant, branch, restaurant, table } = menu;

  return (
    <div>
      {/* Tenant header with server-fetched branding per DOC-003 3.3.2 */}
      <div style={{ backgroundColor: tenant.primaryColor, color: 'white', padding: '12px', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>{tenant.name}</h1>
        <p style={{ margin: 0, fontSize: '12px' }}>
          {branch.name} • Table {table.number} • QR Secure Ordering
        </p>
      </div>

      <MenuBrowser initialData={menu} token={token} />

      <div style={{ textAlign: 'center', padding: '12px', fontSize: '10px', color: '#999' }}>
        {restaurant.name} • Prices in {restaurant.currency} • Secure ordering • Tenant isolated • {new Date().getFullYear()} Eleva
      </div>
    </div>
  );
}

function QrErrorView({ title, message }: { title: string; message: string }): React.ReactNode {
  return (
    <div style={{ maxWidth: '28rem', margin: '0 auto', padding: '48px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: '40px', marginBottom: '16px' }} aria-hidden>
        🍽️
      </div>
      <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#111', margin: '0 0 8px' }}>{title}</h1>
      <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>{message}</p>
    </div>
  );
}
