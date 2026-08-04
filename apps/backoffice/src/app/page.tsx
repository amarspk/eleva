'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BackofficeShell } from './components/BackofficeShell';
import { loadSession } from './lib/auth';

/**
 * Backoffice entry point.
 *
 * AUDIT-014: renders the CRUD shell instead of the old read-only `AdminPanel`.
 * The hardcoded `'tenant-uuid-1111'` / `'branch-uuid-1234'` literals are gone —
 * tenant context now comes from the verified session and is attached to every
 * request by the shared API client.
 *
 * Unauthenticated visitors are redirected to the standalone /login screen (the
 * restaurant-creation wizard remains at /setup for brand-new tenants).
 */
export default function Page(): React.ReactNode {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const session = loadSession();
    const isAuthed = !!session?.accessToken;
    setAuthed(isAuthed);
    if (!isAuthed) {
      router.replace('/login');
    }
  }, [router]);

  if (authed === null || !authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  return <BackofficeShell />;
}
