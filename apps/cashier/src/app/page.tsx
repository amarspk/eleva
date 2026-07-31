'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { loadSession, resolveApiBase, StaffSession } from './lib/auth';

const CashierTerminal = dynamic(() => import('./components/CashierTerminal'), {
  loading: () => <div className="flex items-center justify-center h-screen">Loading Cashier Terminal...</div>,
  ssr: false,
});

/**
 * Cashier entry point (Sprint 2 Task 1 — Auth-UI gate). Requires a stored staff
 * session; unauthenticated visitors are redirected to /login. The tenant is
 * taken from the authenticated session (never hardcoded); the branch is taken
 * from the `?branchId=` query parameter.
 */
export default function Page(): React.ReactNode {
  const router = useRouter();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [ready, setReady] = useState(false);
  const [branchId, setBranchId] = useState('');

  useEffect(() => {
    const stored = loadSession();
    setSession(stored);
    setReady(true);
    if (!stored) {
      router.replace('/login');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setBranchId(params.get('branchId') || '');
  }, [router]);

  if (!ready || !session) {
    return (
      <div className="flex items-center justify-center h-screen">Loading Cashier Terminal...</div>
    );
  }

  return (
    <CashierTerminal tenantId={session.tenantId || ''} branchId={branchId} apiUrl={resolveApiBase()} />
  );
}
