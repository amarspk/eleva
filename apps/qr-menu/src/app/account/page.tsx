'use client';

import React, { useEffect, useState } from 'react';
import { CustomerAccount } from '../components/CustomerAccount';

/**
 * Customer Account & Profile (Phase 4).
 *
 * Mobile-first, restaurant-branded (fetches the tenant's real public site
 * branding — never ELEVA tower styling). Hosts sign in / account creation /
 * profile / order history / logout behind the CustomerAccount component.
 */
export default function AccountPage(): React.ReactNode {
  const [branding, setBranding] = useState<{
    name: string;
    primaryColor: string;
    logoUrl?: string | null;
    currency?: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/public/site', { cache: 'no-store' });
        if (res.ok) {
          const site = (await res.json()) as {
            tenant: { name: string; primaryColor?: string | null; logoUrl?: string | null };
            restaurant: { currency: string };
          };
          setBranding({
            name: site.tenant.name,
            primaryColor: site.tenant.primaryColor || '#111111',
            logoUrl: site.tenant.logoUrl,
            currency: site.restaurant.currency,
          });
        }
      } catch {
        /* fall back to neutral branding */
      }
    })();
  }, []);

  if (!branding) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 20, fontSize: 13, color: '#6b7280' }}>
          Loading…
        </div>
      </div>
    );
  }

  return <CustomerAccount branding={branding} />;
}
