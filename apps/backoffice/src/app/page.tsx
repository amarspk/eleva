'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPanel } from './components/AdminPanel';
import { loadSession } from './lib/auth';

/**
 * Backoffice entry point (Sprint 2 Task 1 — Auth-UI gate, PROJECT_STATE §15
 * item 6): unauthenticated visitors are redirected to the standalone /login
 * screen instead of the restaurant-creation wizard (which is only for new
 * tenants and remains reachable at /setup). The tenant context comes from the
 * session.
 */
export default function Page(): React.ReactNode {
  const router = useRouter();
  const [branchId, setBranchId] = useState('branch-uuid-1234');
  const [tenantId, setTenantId] = useState('tenant-uuid-1111');
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const session = loadSession();
    setAuthed(!!session?.accessToken);
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    if (session.tenantId) {
      setTenantId(session.tenantId);
    }
    const params = new URLSearchParams(window.location.search);
    const branchParam = params.get('branchId');
    if (branchParam) {
      setBranchId(branchParam);
    }
  }, [router]);

  if (authed === null || !authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <AdminPanel tenantId={tenantId} initialBranchId={branchId} />
    </div>
  );
}
